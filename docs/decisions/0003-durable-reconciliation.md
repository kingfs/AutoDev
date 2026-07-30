# ADR 0003: Model the workflow as durable reconciliation

- Status: Accepted
- Date: 2026-07-30

## Context

An automated development run can stop after a commit, push, MR/PR creation, or
while waiting for CI. A purely linear in-memory script cannot safely determine
what to repeat after restart and may duplicate remote side effects.

## Decision

Represent each stage as a condition over durable run state and observable Git,
SCM, and CI reality. The controller dispatches eligible unsatisfied conditions.
Results are revision-aware, and repair invalidates downstream conditions.

## Consequences

- Runs can resume safely after process or provider failure.
- Side effects require explicit idempotency and observation rules.
- The state model and reconciliation tests are core product behavior.
- The MVP may implement a simple sequential dispatcher, but its persisted
  contract must remain compatible with reconciliation.

