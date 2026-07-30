# Delivery roadmap

## Phase 0: Architecture baseline

- Define execution-plane boundary, state model, workflow invariants, security
  model, portability contract, and repository layout.

Exit criteria: architecture and ADRs reviewed.

## Phase 1: GitLab vertical slice

- GitLab Issue Hook normalization and admission.
- Single allowlisted repository and one mutating run at a time.
- agent-compose Git workspace and service scheduler.
- Structured probe/plan/implement calls.
- Static repository policy and deterministic command gates.
- At most two local repair attempts.
- Trusted commit, push, draft MR creation, and issue comment.
- File-backed durable state and sanitized artifacts.

Exit criteria: a fixture and a real test project complete issue-to-draft-MR;
duplicate delivery creates neither a duplicate branch nor duplicate MR.

## Phase 2: CI closure

- Exact pushed-SHA GitLab pipeline observation.
- Failed-job evidence collection and bounded CI repair.
- Cancellation, restart reconciliation, time budgets, and operator summary.
- Stronger secret, denied-path, and artifact controls.

Exit criteria: success, failed CI repair, cancellation, and restart paths pass
integration tests.

## Phase 3: Provider portability

- Provider-neutral SCM domain interface.
- GitHub Issues, PRs, Actions, signatures, pagination, and rate limits.
- GitHub App deployment guidance.
- Repository policy examples for common Go, TypeScript, Python, and monorepos.

Exit criteria: the same workflow core runs against GitLab and GitHub fixtures.

## Phase 4: Scale and operations

- Per-run worktree/sandbox isolation and safe repository concurrency.
- Metrics, run inspection, replay tooling, and cleanup policy.
- Optional advisory multi-agent roles and cost-aware model routing.
- Configuration scaffolding and upgrade compatibility.

Exit criteria: multiple repositories run from configuration without workflow
forks and satisfy defined reliability/SLO targets.

