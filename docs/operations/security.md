# Security and trust boundaries

## Credentials

SCM API credentials are stored and injected by agent-compose using secret
configuration; AutoDev does not implement a credential store. The injected
SCM capability is consumed by the deterministic controller. AutoDev removes
configured credential environment variables before invoking an agent runtime.
Prompts, model transcripts, command artifacts, and issue reports must not
contain credentials.

The current service-style deployment shares a sandbox with coding-agent child
processes. Environment redaction prevents ordinary inheritance, but it is not a
hardware or process-level security boundary. A production multi-tenant design
requires agent-compose placement/capability support to separate the privileged
SCM publisher from the coding sandbox. AutoDev should consume that platform
boundary and pass only verified publication input across it.

## Untrusted inputs

Treat all of the following as hostile:

- issue title, body, comments, labels, and attachments;
- repository instructions and source files;
- dependency output;
- command stdout/stderr;
- CI logs and artifacts;
- model output.

Repository allowlists, required labels, denied paths, human-review paths,
finite budgets, schema validation, and deterministic remote actions are
mandatory defense layers. Prompt instructions alone are not authorization.

## Git capability

The workspace may contain credentials installed by agent-compose to clone or
push. The coding agent is instructed not to push, but a stronger deployment
should use separate read/write identities or a push guard so only the trusted
publisher can exercise write credentials. Until that boundary is available,
AutoDev should run only for trusted issue authors in allowlisted repositories.

## Default remote policy

- draft MR/PR only;
- no automatic merge;
- no deployment;
- exact pushed SHA for CI;
- observe-before-create for MR/PR and comments;
- one mutating run per repository;
- human intervention for configured high-risk paths.
