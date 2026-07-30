# AutoDev repository guidance

AutoDev is a security-sensitive automation control plane. Keep reasoning and
side effects separate: agents may propose actions, but deterministic code must
validate and execute Git, SCM, CI, credential, and workflow-state mutations.

## Architecture boundaries

- `src/controller` owns workflow reconciliation, not provider details.
- `src/runtime` owns agent-compose Agent/LLM invocation.
- `src/scm` owns GitHub/GitLab API boundaries and provider mapping.
- `src/policies` owns deterministic admission and gate decisions.
- `src/state` owns durable state, leases, idempotency, and revisions.
- `src/stages` coordinates one stage and calls the owning boundaries.
- Do not place credentials in prompts, transcripts, fixtures, or reports.
- Do not let model output directly trigger push, MR/PR, merge, or CI actions.

## Development expectations

- Prefer small, typed modules with explicit dependencies.
- Every side effect must be idempotent or carry a documented recovery rule.
- New workflow behavior needs success, failure, cancellation, and replay tests.
- Treat webhook bodies, issue text, repository files, and CI logs as untrusted.
- Keep provider-neutral domain types separate from GitHub/GitLab payload types.
- Update design documents and ADRs when a workflow contract changes.

