import path from "node:path";
import type { AutoDevConfig } from "../config/schema.js";
import type { GateEvidence, WorkItem } from "../domain.js";
import { runChecked } from "../git/command.js";
import { GitWorkspace } from "../git/workspace.js";
import { decideAdmission } from "../policies/admission.js";
import { addChangedPathGates, materializeGates } from "../policies/gates.js";
import { globMatches } from "../policies/glob.js";
import type { DevelopmentRuntime } from "../runtime/runtime.js";
import { buildImplementationPrompt, buildPlanPrompt, buildRepairPrompt, buildReviewPrompt } from "../runtime/prompts.js";
import type { SCMClient } from "../scm/scm.js";
import { waitForPipeline } from "../stages/ci.js";
import { commitAndPublish } from "../stages/publish.js";
import { requiredGatesPassed, verifyGates } from "../stages/verify.js";
import { beginRevision, createRunState, currentRevision, type RunState } from "../state/model.js";
import type { RunStateStore } from "../state/store.js";
import { parseDuration } from "../util/duration.js";

export interface WorkflowDependencies {
  config: AutoDevConfig;
  workspace: string;
  artifactRoot: string;
  runtime: DevelopmentRuntime;
  scm: SCMClient;
  store: RunStateStore;
}

export async function executeWorkflow(item: WorkItem, runId: string, key: string, dependencies: WorkflowDependencies): Promise<RunState> {
  const existing = await dependencies.store.load(runId);
  const state = existing ?? createRunState(runId, key, item);
  try {
    if (!state.admission) {
      state.admission = decideAdmission(item, dependencies.config);
      if (!state.admission.accepted) {
        state.status = "rejected";
        state.terminalReason = state.admission.reason;
        return await persist(dependencies.store, state);
      }
      await persist(dependencies.store, state);
    }

    const git = new GitWorkspace(dependencies.workspace);
    if (!state.git) {
      state.currentStage = "workspace";
      state.git = await git.prepare(item, dependencies.config);
      await persist(dependencies.store, state);
    }

    if (!state.plan) {
      state.currentStage = "plan";
      state.plan = (await dependencies.runtime.plan(buildPlanPrompt(item))).value;
      if (state.plan.requiresHumanInput) {
        state.status = "needs_human";
        state.terminalReason = state.plan.humanQuestions.join("\n");
        await report(dependencies, state);
        return state;
      }
      if (state.admission.mode === "plan-only") {
        state.status = "plan_completed";
        await report(dependencies, state);
        return state;
      }
      await persist(dependencies.store, state);
    }

    if (!state.gatesFrozenAt) {
      state.currentStage = "gates";
      state.gates = materializeGates(dependencies.config, state.plan);
      state.gatesFrozenAt = new Date().toISOString();
      await persist(dependencies.store, state);
    }

    while (state.status === "running") {
      let revision = currentRevision(state);
      if (!revision) {
        state.currentStage = "implement";
        const implementation = (await dependencies.runtime.implement(buildImplementationPrompt(item, state.plan, state.gates))).value;
        revision = beginRevision(state, implementation.summary);
        await persist(dependencies.store, state);
      }

      const checkpoint = await git.checkpoint(state.git);
      state.git = checkpoint;
      state.gates = addChangedPathGates(state.gates, dependencies.config, checkpoint.changedFiles);
      const humanReviewPaths = checkpoint.changedFiles.filter((file) => dependencies.config.security.require_human_review.some((pattern) => globMatches(pattern, file)));
      if (humanReviewPaths.length > 0) {
        state.status = "needs_human";
        state.terminalReason = `human review required for paths: ${humanReviewPaths.join(", ")}`;
        await report(dependencies, state);
        return state;
      }

      if (!revision.verification?.passed) {
        state.currentStage = "verify";
        const evidence = await verifyGates({ workspace: dependencies.workspace, artifactRoot: path.join(dependencies.artifactRoot, `revision-${revision.number}`), gates: state.gates, checkpoint, config: dependencies.config });
        revision.verification = { passed: requiredGatesPassed(state.gates, evidence), evidence, verifiedAt: new Date().toISOString() };
        await persist(dependencies.store, state);
        if (!revision.verification.passed) {
          if (state.localRepairCount >= dependencies.config.automation.local_repair_limit) return await exhaust(dependencies, state, "local repair budget exhausted");
          state.localRepairCount += 1;
          state.currentStage = "repair";
          const repair = (await dependencies.runtime.repair(buildRepairPrompt(item, state.plan, evidence))).value;
          beginRevision(state, repair.summary);
          await persist(dependencies.store, state);
          continue;
        }
      }

      if (!revision.review?.approved) {
        state.currentStage = "review";
        const diff = (await runChecked("git", ["diff", state.git.baseSha], { cwd: dependencies.workspace, maxOutputBytes: 500_000 })).stdout;
        revision.review = (await dependencies.runtime.review(buildReviewPrompt(item, state.plan, revision.verification.evidence, diff))).value;
        await persist(dependencies.store, state);
        if (!revision.review.approved) {
          if (state.localRepairCount >= dependencies.config.automation.local_repair_limit) return await exhaust(dependencies, state, "review repair budget exhausted");
          state.localRepairCount += 1;
          const reviewEvidence: GateEvidence[] = [{ gateId: "semantic-review", passed: false, summary: revision.review.summary }];
          const repair = (await dependencies.runtime.repair(buildRepairPrompt(item, state.plan, reviewEvidence, revision.review.summary))).value;
          beginRevision(state, repair.summary);
          await persist(dependencies.store, state);
          continue;
        }
      }

      if (state.admission.mode === "no-push") {
        state.status = "completed";
        state.terminalReason = "verified local change; publishing disabled by policy";
        await report(dependencies, state);
        return state;
      }

      if (!revision.publication) {
        state.currentStage = "publish";
        revision.publication = { ...(await commitAndPublish({ workspace: dependencies.workspace, item, plan: state.plan, taskBranch: state.git.taskBranch, targetBranch: state.git.baseBranch, scm: dependencies.scm })), publishedAt: new Date().toISOString() };
        await persist(dependencies.store, state);
      }

      if (!dependencies.config.automation.ci_watch) {
        state.status = "completed";
        state.terminalReason = "change request published; CI observation disabled";
        await report(dependencies, state);
        return state;
      }

      if (!revision.ci || revision.ci.pipeline.sha !== revision.publication.pushedSha) {
        state.currentStage = "ci";
        const observed = await waitForPipeline({ scm: dependencies.scm, repositoryId: item.repository.id, sha: revision.publication.pushedSha, timeoutMs: parseDuration(dependencies.config.automation.ci_timeout) });
        revision.ci = { ...observed, observedAt: new Date().toISOString() };
        await persist(dependencies.store, state);
      }
      if (revision.ci.pipeline.status === "success") {
        state.status = "completed";
        state.terminalReason = "published revision passed CI";
        await report(dependencies, state);
        return state;
      }
      if (revision.ci.pipeline.status !== "failed") {
        state.status = "failed";
        state.terminalReason = `CI ended with non-repairable status ${revision.ci.pipeline.status}`;
        await report(dependencies, state);
        return state;
      }
      if (state.ciRepairCount >= dependencies.config.automation.ci_repair_limit) return await exhaust(dependencies, state, "CI repair budget exhausted");
      state.ciRepairCount += 1;
      const evidence: GateEvidence[] = revision.ci.failures.map((failure) => ({ gateId: `ci-${failure.id}`, passed: false, summary: `${failure.name}\n${failure.log.slice(-50_000)}`, artifact: failure.url }));
      const repair = (await dependencies.runtime.repair(buildRepairPrompt(item, state.plan, evidence))).value;
      beginRevision(state, repair.summary);
      await persist(dependencies.store, state);
    }
    return state;
  } catch (error) {
    state.status = "failed";
    state.terminalReason = error instanceof Error ? error.message : String(error);
    await persist(dependencies.store, state);
    await report(dependencies, state).catch(() => undefined);
    return state;
  }
}

async function persist(store: RunStateStore, state: RunState): Promise<RunState> { await store.save(state); return state; }
async function exhaust(deps: WorkflowDependencies, state: RunState, reason: string): Promise<RunState> { state.status = "budget_exhausted"; state.terminalReason = reason; await report(deps, state); return state; }
async function report(deps: WorkflowDependencies, state: RunState): Promise<void> {
  const revision = currentRevision(state);
  const summary = [`AutoDev run **${state.status}**.`, "", state.terminalReason ?? "", state.plan ? `\nPlan: ${state.plan.summary}` : "", revision?.publication ? `\nChange request: ${revision.publication.changeRequest.url}` : ""].filter(Boolean).join("\n");
  await deps.scm.commentIssue(state.workItem, summary);
  state.report = { summary, reportedAt: new Date().toISOString() };
  await deps.store.save(state);
}
