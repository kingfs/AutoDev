# Repository policy examples

Quality-gate commands are trusted repository-owner configuration. Agents may
propose checks, but cannot remove or replace these commands.

## Go

```yaml
verification:
  commands:
    - { id: gofmt, command: test -z "$(gofmt -l .)" }
    - { id: go-vet, command: go vet ./... }
    - { id: go-test, command: go test ./... }
```

## TypeScript

```yaml
verification:
  commands:
    - { id: install-lock, command: npm ci --ignore-scripts }
    - { id: typecheck, command: npm run check }
    - { id: test, command: npm test }
    - { id: build, command: npm run build }
```

Dependency installation may need network access. Prefer a sandbox image with
dependencies cached and use the repository's lockfile-enforcing command.

## Python

```yaml
verification:
  commands:
    - { id: lint, command: ruff check . }
    - { id: types, command: mypy . }
    - { id: test, command: pytest -q }
```

## Monorepo path rules

```yaml
verification:
  commands:
    - { id: repository-policy, command: ./scripts/validate-repository.sh }
  path_rules:
    - pattern: "frontend/**"
      commands:
        - { id: frontend-check, command: pnpm typecheck, cwd: frontend }
        - { id: frontend-test, command: pnpm test, cwd: frontend }
    - pattern: "services/api/**"
      commands:
        - { id: api-test, command: go test ./..., cwd: services/api }
```

Commands execute through `bash -lc` because they are trusted policy, not model
output. Review policy changes like CI configuration and keep the policy file
outside the target repository when issue authors are not fully trusted.
