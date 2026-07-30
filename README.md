# AutoDev

AutoDev is a portable, policy-driven AI software-development automation system.
It turns trusted repository work items into reviewed code changes by combining
AI coding agents with deterministic workflow scripts.

AutoDev is designed to run on agent-compose, while keeping repository policy,
SCM integration, and workflow decisions independent from any single model,
provider, or source-code host.

## Design goals

- Accept work from GitHub, GitLab, or another issue source through webhooks.
- Mount or materialize an isolated Git workspace for every development run.
- Use agents for investigation, planning, implementation, review, and repair.
- Use deterministic scripts for admission, state transitions, quality gates,
  Git operations, publishing, CI observation, retries, and authorization.
- Produce structured evidence for every decision and external side effect.
- Stop safely and hand work to a human when policy or repair budgets require it.
- Be reusable by copying configuration and project-specific policy, not by
  forking workflow code.

## Core principle

> AI proposes and implements; trusted code authorizes, verifies, and publishes.

The workflow has two execution planes:

| Plane | Responsibilities |
| --- | --- |
| Agent plane | Repository investigation, plan, code changes, semantic review, repair |
| Control plane | Webhook validation, policy, Git baseline, commands, gates, push, MR/PR, CI, state |

See [System architecture](docs/architecture/system.md) for the full design.

## Intended workflow

```text
Webhook / manual task
        |
        v
Admission and deduplication (script)
        |
        v
Isolated workspace and Git baseline (script)
        |
        v
Probe -> Plan (agent)
        |
        v
Materialize and freeze quality gates (script)
        |
        v
Implement (agent)
        |
        v
Verify commands and policies (script)
        |
        +---- failed ----> Repair (agent) ----+
        |                                      |
        +<-------------------------------------+
        |
        v
Semantic review (agent) + final gate (script)
        |
        v
Commit, push, MR/PR (script)
        |
        v
Watch exact pushed SHA (script)
        |
        +---- failed ----> CI repair (agent) --+
        |
        v
Report and close run (script)
```

## Repository layout

```text
config/                 Portable project and policy examples
docs/architecture/      System and workflow architecture
docs/decisions/         Architecture decision records
docs/operations/        Deployment and operating guidance
scripts/                Bootstrap and operator utilities
skills/                 Reusable agent skills
src/controller/         Workflow reconciliation and lifecycle
src/stages/             Stage implementations
src/policies/           Admission and quality-gate policy
src/runtime/            agent-compose Agent/LLM adapter
src/scm/                GitHub/GitLab abstraction
src/state/              Durable run state and idempotency
src/observability/      Events, evidence, reports, and metrics
tests/fixtures/          Webhook and SCM fixtures
tests/integration/       Workflow boundary tests
```

## Status

This repository currently contains the architecture baseline and delivery
roadmap. Implementation will begin with a GitLab, single-repository,
issue-to-draft-MR vertical slice. See [Roadmap](docs/operations/roadmap.md).

## Non-goals

- Automatically merge or deploy changes by default.
- Give issue authors direct access to credentials or arbitrary network targets.
- Let an agent decide whether its own tests passed.
- Assume one validation command works for every repository.
- Encode GitHub-, GitLab-, or D-Sensor-specific behavior in the workflow core.

