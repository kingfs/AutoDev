# ADR 0001: Separate agent reasoning from deterministic control

- Status: Accepted
- Date: 2026-07-30

## Context

AI coding agents are effective at repository investigation, implementation, and
repair, but their outputs are probabilistic. Git push, change-request creation,
quality-gate results, retry budgets, and authorization require predictable and
auditable behavior.

## Decision

AutoDev uses two execution planes:

- agents perform reasoning and local code work;
- trusted scripts validate and perform control-plane side effects.

Agent outputs crossing the boundary use schemas and are treated as untrusted
input. Scripts independently observe repository and remote state.

## Consequences

- Workflow code is larger than a single autonomous-agent prompt.
- External mutations are reproducible, idempotent, and testable.
- Providers and models can be replaced without changing authorization policy.
- Mechanical verification is reliable even when an agent's narrative is wrong.

