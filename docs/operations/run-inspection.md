# Run inspection

AutoDev owns development workflow state; agent-compose owns scheduler runs,
sandboxes, event ingestion, and platform logs.

Inspect AutoDev state in a shell with the state volume mounted:

```bash
npm run runs -- list
npm run runs -- show run-42-deadbeef
```

Every durable workflow transition emits one machine-readable line prefixed
with `__AUTODEV_EVENT__`. The terminal scheduler result is prefixed with
`__AUTODEV_RESULT__`. These records contain identifiers and stage status, not
command output or credentials.

Use agent-compose for platform-owned operations:

```bash
agent-compose ps
agent-compose logs
agent-compose inspect sandbox <sandbox-id> --json
```

Webhook replay and scheduler-run cancellation should use agent-compose. A
replayed event remains subject to AutoDev admission, task identity, repository
leases, and workflow idempotency.
