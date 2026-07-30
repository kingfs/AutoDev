# ADR 0002: Use agent-compose as the runtime platform

- Status: Accepted
- Date: 2026-07-30

## Context

AutoDev needs event triggers, schedulers, isolated sandboxes, Git workspaces,
agent and LLM invocation, skills, secrets, sessions, cancellation, and run
lifecycle management. Reimplementing these capabilities inside the workflow
would create a second runtime and make projects difficult to operate uniformly.

## Decision

Use agent-compose as the initial runtime and control-plane host. AutoDev remains
a project workflow and policy layer. Runtime calls are isolated behind a thin
adapter so workflow domain code does not depend on provider-specific APIs.

Use a service-style scheduler workflow as the primary orchestration model. One
controller owns run state and invokes logical agent roles through the runtime.
Independent multi-agent event chains may be used for optional advisory work,
but not for shared mutable Git state in the initial design.

## Consequences

- AutoDev benefits from agent-compose upgrades and provider support.
- Git and workflow semantics remain testable outside a model invocation.
- The first deployment requires an agent-compose daemon and guest image.
- Runtime capability gaps should be added to agent-compose or covered by a thin
  adapter, not by copying a full provider harness into AutoDev.

