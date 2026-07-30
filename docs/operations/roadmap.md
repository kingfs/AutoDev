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

## Phase 2: CI closure — partially coded

- Exact pushed-SHA GitLab pipeline observation.
- Failed-job evidence collection and bounded CI repair.
- Exact-SHA polling and finite CI repair budgets are coded.
- Cancellation propagation, restart reconciliation, end-to-end deadlines, and
  sanitized artifacts remain AutoDev work.
- Webhook authentication, sandbox cancellation, and secret storage/injection
  are agent-compose responsibilities and are configured rather than rebuilt.

Exit criteria: success, failed CI repair, cancellation, and restart paths pass
integration tests.

## Phase 3: Provider portability — basic adapters coded

- Provider-neutral SCM domain interface.
- GitHub Issues, PRs, and basic Actions status are coded.
- SCM pagination, transient retry/rate-limit handling, richer GitHub Actions
  evidence, GitHub App guidance, and live smoke tests remain.
- Webhook signatures are verified by the configured agent-compose webhook
  source, not by AutoDev.
- Repository policy examples for common stacks remain.

Exit criteria: the same workflow core runs against GitLab and GitHub fixtures.

## Phase 4: Scale and operations — in progress

- Per-run worktree/sandbox isolation and safe repository concurrency.
- Metrics, run inspection, replay tooling, and cleanup policy.
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
