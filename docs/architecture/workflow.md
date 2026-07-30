# Workflow contract

## Condition graph

```text
intake
  -> workspace
  -> probe
  -> plan
  -> gates
  -> implement
  -> verify
  -> review
  -> publish
  -> ci
  -> report
```

`implement`, `verify`, `publish`, and `ci` are revision-aware. A repair creates
a new revision and makes all downstream evidence stale.

## Stage ownership

| Stage | Primary executor | Side effects allowed |
| --- | --- | --- |
| Intake | Script | Persist normalized event and lease |
| Workspace | Script | Fetch, checkout, branch/worktree |
| Probe | Script + Agent | Read-only repository inspection |
| Plan | Agent | Structured result only |
| Gates | Script | Persist frozen policy |
| Implement | Agent | Local workspace changes only |
| Verify | Script | Commands and evidence; no remote writes |
| Review | Agent + Script | Structured review; gate decision by script |
| Publish | Script | Commit, push, create/update MR/PR |
| CI | Script + repair Agent | Poll; local repair on failure |
| Report | Script | Issue comment and terminal state |

## Terminal outcomes

- `completed`: published revision has green CI and reporting succeeded.
- `plan_completed`: plan-only policy completed without repository mutation.
- `needs_human`: required choice, approval, or high-risk review is missing.
- `rejected`: admission policy refused the task.
- `failed`: a non-recoverable operation failed.
- `budget_exhausted`: repair/time/token policy stopped further work.
- `cancelled`: operator or superseding task cancelled the run.

## Invariants

1. No remote write occurs before admission and workspace validation.
2. No push occurs before required gates pass for the current revision.
3. A model cannot change frozen gate definitions or mark commands as passed.
4. CI success must match the exact pushed SHA of the current revision.
5. Every remote create is preceded by an idempotent lookup.
6. Secrets never enter model-visible context.
7. A failed high-risk path policy requires human intervention by default.

