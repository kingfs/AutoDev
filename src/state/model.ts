import type {
  AdmissionDecision,
  ChangeRequest,
  GateEvidence,
  GitCheckpoint,
  JobFailure,
  Pipeline,
  PlanResult,
  QualityGate,
  ReviewResult,
  WorkItem,
} from "../domain.js";

export type RunStatus =
  | "running"
  | "completed"
  | "plan_completed"
  | "needs_human"
  | "rejected"
  | "failed"
  | "budget_exhausted"
  | "cancelled";

export interface RevisionState {
  number: number;
  implementationSummary: string;
  implementedAt: string;
  verification?: {
    passed: boolean;
    evidence: GateEvidence[];
    verifiedAt: string;
  };
  review?: ReviewResult;
  publication?: {
    pushedSha: string;
    changeRequest: ChangeRequest;
    publishedAt: string;
  };
  ci?: {
    pipeline: Pipeline;
    failures: JobFailure[];
    observedAt: string;
  };
}

export interface RunState {
  schemaVersion: 1;
  runId: string;
  idempotencyKey: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  workItem: WorkItem;
  admission?: AdmissionDecision;
  git?: GitCheckpoint;
  plan?: PlanResult;
  gates: QualityGate[];
  gatesFrozenAt?: string;
  revisions: RevisionState[];
  localRepairCount: number;
  ciRepairCount: number;
  currentStage: string;
  terminalReason?: string;
  report?: { summary: string; reportedAt: string };
  humanApprovals: Array<{ revision: number; actor: string; approvedAt: string }>;
}

export function currentRevision(state: RunState): RevisionState | undefined {
  return state.revisions.at(-1);
}

export function createRunState(runId: string, idempotencyKey: string, workItem: WorkItem, now = new Date()): RunState {
  const timestamp = now.toISOString();
  return {
    schemaVersion: 1,
    runId,
    idempotencyKey,
    status: "running",
    createdAt: timestamp,
    updatedAt: timestamp,
    workItem,
    gates: [],
    revisions: [],
    localRepairCount: 0,
    ciRepairCount: 0,
    currentStage: "intake",
    humanApprovals: [],
  };
}

export function beginRevision(state: RunState, summary: string, now = new Date()): RevisionState {
  const revision: RevisionState = {
    number: (currentRevision(state)?.number ?? 0) + 1,
    implementationSummary: summary,
    implementedAt: now.toISOString(),
  };
  state.revisions.push(revision);
  state.updatedAt = now.toISOString();
  return revision;
}

export function resumeFromHumanInput(state: RunState, item: WorkItem, idempotencyKey: string, approvalLabel: string, now = new Date()): boolean {
  if (state.status !== "needs_human" || state.workItem.revision === item.revision) return false;
  if (state.currentStage === "human-review") {
    const revision = currentRevision(state);
    if (!revision || !item.issue.labels.includes(approvalLabel)) return false;
    state.humanApprovals.push({ revision: revision.number, actor: item.actor, approvedAt: now.toISOString() });
  } else {
    if (state.revisions.length > 0) return false;
    delete state.plan;
    state.gates = [];
    delete state.gatesFrozenAt;
  }
  state.workItem = item;
  state.idempotencyKey = idempotencyKey;
  state.status = "running";
  delete state.terminalReason;
  delete state.report;
  state.currentStage = "intake-resume";
  return true;
}
