# Delivery roadmap

## Phase 0: Architecture baseline — complete

- Define execution-plane boundary, state model, workflow invariants, security
  model, portability contract, and repository layout.

Exit criteria: architecture and ADRs reviewed.

## Phase 1: GitLab vertical slice — coded, live proof pending

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

## Phase 2: CI closure — coded and locally tested, live proof pending

- Exact pushed-SHA GitLab pipeline observation.
- Failed-job evidence collection and bounded CI repair.
- Exact-SHA polling and finite CI repair budgets are coded.
- Cancellation/deadline propagation, workspace/remote reconciliation,
  revision-scoped repair, sanitized evidence, and change safety gates are
  locally tested. Crash recovery has focused tests but needs production soak.
- Webhook authentication, sandbox cancellation, and secret storage/injection
  are agent-compose responsibilities and are configured rather than rebuilt.

Exit criteria: success, failed CI repair, cancellation, and restart paths pass
integration tests.

## Phase 3: Provider portability — coded and locally tested, live proof pending

- Provider-neutral SCM domain interface.
- GitHub Issues, PRs, and basic Actions status are coded.
- SCM pagination, bounded transient retry, richer GitHub Actions evidence, and
  GitHub App guidance are implemented. Live GitHub smoke remains.
- Webhook signatures are verified by the configured agent-compose webhook
  source, not by AutoDev.
- Repository policy examples cover Go, TypeScript, Python, and monorepos.

Exit criteria: the same workflow core runs against GitLab and GitHub fixtures.

## Phase 4: Scale and operations — partially implemented

- Per-run worktree/sandbox isolation and safe repository concurrency.
- Structured run events and read-only run inspection are implemented. Metrics,
  cleanup policy, and SLO dashboards remain. Event replay stays an
  agent-compose platform operation.
- Optional advisory multi-agent roles and cost-aware model routing.
- Configuration scaffolding and upgrade compatibility.

Exit criteria: multiple repositories run from configuration without workflow
forks and satisfy defined reliability/SLO targets.

## Delivery terminology

- **coded**: an implementation exists and passes focused unit tests;
- **tested**: boundary and crash/retry integration tests pass;
- **proven**: a disposable real SCM repository passes the documented scenario;
- **production-ready**: security boundaries, operations, and SLO evidence are
  accepted for the intended deployment.
