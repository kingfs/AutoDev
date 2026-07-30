# 仓库质量门禁示例

质量门禁属于仓库维护者提供的可信配置。Agent 可以建议检查项，但不能删除、
替换或降低这些门禁。

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

依赖安装可能需要网络。建议在 Sandbox 镜像中预置依赖缓存，并始终使用能够
强制校验 Lockfile 的安装命令。

## Python

```yaml
verification:
  commands:
    - { id: lint, command: ruff check . }
    - { id: types, command: mypy . }
    - { id: test, command: pytest -q }
```

## Monorepo 路径门禁

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

门禁命令通过 `bash -lc` 执行，因此必须由可信维护者配置，不能直接采用 Issue
或模型生成的任意命令。仓库策略的变更应像 CI 配置一样接受代码审查。如果
Issue 作者并不完全可信，应把策略文件保存在目标仓库之外。
