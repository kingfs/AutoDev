# AutoDev and agent-compose responsibility boundary

AutoDev is a development workflow application running on agent-compose. It
must consume platform capabilities instead of reimplementing them.

## agent-compose owns

- webhook endpoint authentication, token/signature storage, request size
  limits, delivery ingestion, and event dispatch;
- secret declaration, injection, and presentation redaction through
  `secret: true`;
- sandbox creation, isolation policy, lifecycle, cancellation, and resource
  limits;
- Git workspace cloning/provisioning and credential installation;
- scheduler trigger concurrency and run/session lifecycle;
- Agent/LLM provider execution, authentication, sessions, and runtime usage
  accounting;
- volume provisioning and platform-level persistence.

AutoDev configuration must reference these capabilities. It must not persist a
copy of webhook secrets, model credentials, or Git credentials in run state.

## AutoDev owns

- provider payload normalization after agent-compose admits the event;
- repository, label, issue-author, and event-actor authorization;
- task/run identity and workflow-level deduplication semantics;
- durable development-stage state and revision invalidation;
- repository-specific quality-gate policy and deterministic evidence;
- Git branch/baseline invariants inside the provisioned workspace;
- observe-before-act semantics for branch push, MR/PR, comments, and CI;
- bounded repair policy and human-handoff decisions;
- SCM API adaptation, pagination, transient-error handling, and exact-SHA CI
  interpretation;
- redaction of repository command output and CI evidence before those values
  are stored or sent to a model.

## Shared boundary contracts

Some concerns cross both layers and require an explicit contract:

| Concern | agent-compose contract | AutoDev contract |
| --- | --- | --- |
| Webhook trust | Authenticate the source and emit source metadata | Trust only configured event topics; authorize actor and repository |
| Secrets | Inject and redact configured secret values | Never serialize them; remove them from child-agent environments |
| Workspace | Materialize the configured repository in a sandbox | Verify origin, branch, base SHA, cleanliness, and remote state |
| Cancellation | Stop/cancel the sandbox or scheduler run | Observe an abort/deadline and persist a workflow terminal state |
| Concurrency | Limit scheduler/sandbox execution | Keep a repository lease as defense in depth for manual/cross-entry runs |
| Logs | Preserve platform run logs | Sanitize task artifacts and bounded evidence |

`secret: true` protects platform display and configuration handling. It does
not make a secret safe to expose to an arbitrary process in the same sandbox.
For a strict publisher boundary, agent-compose must provide separate sandbox or
capability placement; AutoDev should then place its privileged publisher in
that boundary rather than implementing a competing secret store.
