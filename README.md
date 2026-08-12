# AutoDev

> 文档站会在 GitHub Release 发布时自动更新。工程设计、运维指南与故事连载均由
> 仓库中的 Markdown 构建，参见 [文档导航](docs/engineering-series/README.md)。

AutoDev 是一个基于策略驱动的 AI 自动化开发系统。它接收 GitHub 或
GitLab Issue，通过 AI Agent 完成需求分析、代码实现、语义审查和失败修复，
再由确定性控制程序执行质量门禁、Git 提交、分支推送、MR/PR 创建、CI 观察
和结果回报。

本项目基于并引用开源项目
[chaitin/agent-compose](https://github.com/chaitin/agent-compose)。
agent-compose 提供 Scheduler、Webhook Source、Sandbox、Git Workspace、
Agent/LLM Runtime、Secret 注入和运行生命周期；AutoDev 在其上实现自动化开发
工作流。使用前请同时阅读 agent-compose 的安装与配置文档。

> 核心原则：AI 负责分析、实现和修复；可信控制程序负责授权、验证和发布。

## 能做什么

- 接收 GitLab Issue Hook 和 GitHub Issues Webhook；
- 按仓库、标签、Issue 作者和事件操作者执行准入；
- 为任务准备 Git 基线和独立任务分支；
- 调用 Agent 完成 Plan、Implement、Review、Repair；
- 执行仓库预先配置的测试、类型检查、Lint、构建等质量门禁；
- 检查禁止修改路径、敏感信息、文件数量和文件大小；
- 在验证通过后提交并推送代码，创建或更新 Draft MR/PR；
- 观察与推送 Commit SHA 严格一致的 GitLab Pipeline 或 GitHub Actions；
- 根据本地验证或 CI 失败证据执行有限次数的修复；
- 在 Issue 中幂等更新执行结果；
- 对高风险路径等待人工批准，并把批准绑定到具体代码 revision。

默认不会自动合并 MR/PR，也不会自动部署。

## 工作流程

```text
GitHub/GitLab Issue Webhook
            │
            ▼
agent-compose Webhook Source 鉴权和事件调度
            │
            ▼
AutoDev 准入、任务去重、仓库租约
            │
            ▼
Git Workspace 与任务分支
            │
            ▼
Plan Agent → 固化门禁 → Implement Agent
            │
            ▼
确定性验证 ──失败──> Repair Agent ──┐
            │                        │
            └────────────────────────┘
            │
            ▼
Review Agent → Commit/Push → Draft MR/PR
            │
            ▼
精确 SHA CI 观察 ──失败──> CI Repair
            │
            ▼
Issue 报告与任务结束
```

AutoDev 与 agent-compose 的完整责任划分见
[职责边界](docs/architecture/responsibility-boundary.md)。

## 前置条件

- Linux 主机；
- Docker；
- Node.js 20 或更高版本（用于本地检查）；
- 已安装并启动
  [agent-compose](https://github.com/chaitin/agent-compose)；
- 一个用于首次验证的非生产 GitHub/GitLab 仓库；
- 可调用的 Agent Provider，例如已完成认证的 Codex；
- 对目标仓库具有最小必要权限的 Git 和 SCM API 凭据。

不要把首次测试指向生产仓库。

## 快速开始

### 1. 获取和检查项目

```bash
git clone https://github.com/<your-org>/autodev.git
cd autodev
npm ci
npm run check
npm test
npm run build
```

如果尚未安装 agent-compose，请从其官方仓库安装：

```text
https://github.com/chaitin/agent-compose
```

确认 daemon 已启动，并且以下命令可用：

```bash
agent-compose version
agent-compose ps
```

### 2. 创建环境变量文件

```bash
cp .env.example .env
chmod 600 .env
```

`.env` 中需要配置：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `SCM_PROVIDER` | 是 | `github` 或 `gitlab` |
| `SCM_REPOSITORY_URL` | 是 | Git Clone URL，建议 HTTPS URL |
| `SCM_DEFAULT_BRANCH` | 是 | 默认分支，例如 `main` |
| `SCM_REPOSITORY` | 是 | `owner/repository` 或 `group/project` |
| `SCM_GIT_TOKEN` | 是 | Clone 和 Push 使用的 Token |
| `SCM_API_BASE_URL` | 是 | GitHub/GitLab API 地址 |
| `SCM_API_TOKEN` | 是 | Issue、MR/PR、CI API 使用的 Token |

`SCM_GIT_TOKEN` 和 `SCM_API_TOKEN` 可以使用同一个凭据，但生产环境建议拆分，
以便分别限制 Git 写入权限和 SCM API 权限。它们通过 agent-compose 配置注入；
不要写进 `config/autodev.yml`，也不要提交 `.env`。

### 3. GitLab 配置示例

```dotenv
SCM_PROVIDER=gitlab
SCM_REPOSITORY_URL=https://gitlab.example.com/group/project.git
SCM_DEFAULT_BRANCH=main
SCM_REPOSITORY=group/project
SCM_GIT_TOKEN=<gitlab-project-or-personal-access-token>
SCM_API_BASE_URL=https://gitlab.example.com
SCM_API_TOKEN=<gitlab-project-or-personal-access-token>
```

建议 Token 至少具有：

- 读取仓库；
- 推送任务分支；
- 读取和更新 Issue；
- 创建和更新 Merge Request；
- 读取 Pipeline 与 Job 日志。

GitLab.com 的 API Base URL 使用 `https://gitlab.com`，不要附加 `/api/v4`，
AutoDev 会自行添加 API 路径。

### 4. GitHub 配置示例

```dotenv
SCM_PROVIDER=github
SCM_REPOSITORY_URL=https://github.com/example/project.git
SCM_DEFAULT_BRANCH=main
SCM_REPOSITORY=example/project
SCM_GIT_TOKEN=<github-app-installation-token-or-fine-grained-token>
SCM_API_BASE_URL=https://api.github.com
SCM_API_TOKEN=<github-app-installation-token-or-fine-grained-token>
```

建议优先使用 GitHub App Installation Token。所需仓库权限：

- Metadata：Read；
- Contents：Read and write；
- Issues：Read and write；
- Pull requests：Read and write；
- Actions：Read；
- Checks：Read。

详细说明见 [GitHub App 部署](docs/operations/github-app.md)。

### 5. 配置仓库策略

编辑 [config/autodev.yml](config/autodev.yml)。默认文件会从 `.env` 展开仓库
信息，通常需要重点修改以下内容：

```yaml
repository:
  provider: ${SCM_PROVIDER}
  url: ${SCM_REPOSITORY_URL}
  default_branch: ${SCM_DEFAULT_BRANCH}
  required_label: ai-ready
  branch_prefix: ai/issue-
  allowlist:
    - ${SCM_REPOSITORY}

automation:
  mode: draft
  local_repair_limit: 2
  ci_repair_limit: 2
  run_timeout: 3h
  agent_provider: codex
  ci_watch: true
  ci_timeout: 1h

verification:
  commands:
    - id: test
      command: npm test
    - id: build
      command: npm run build

security:
  allowed_actors:
    - trusted-maintainer
  denied_paths:
    - ".github/workflows/**"
    - ".gitlab-ci.yml"
    - "deploy/production/**"
  require_human_review:
    - "migrations/**"
    - "auth/**"
  human_approval_label: ai-approved
```

配置说明：

- `required_label`：只有包含该标签的 Issue 才会进入工作流；
- `allowlist`：允许操作的仓库完整名称；
- `allowed_authors`：允许的 Issue 作者，空数组表示不限制；
- `allowed_actors`：允许触发操作的人，例如添加 `ai-ready` 的维护者；
- `mode`：`draft`、`no-push` 或 `plan-only`；
- `verification.commands`：每次修改必须通过的命令；
- `verification.path_rules`：命中特定路径时追加的门禁；
- `denied_paths`：任何情况下均不允许自动修改的路径；
- `require_human_review`：修改后需要人工批准的路径；
- `human_approval_label`：人工批准标签，默认 `ai-approved`；
- `local_repair_limit` / `ci_repair_limit`：本地和 CI 修复预算。

常见项目配置见 [质量门禁示例](docs/operations/policy-examples.md)。

### 6. 验证并启动 agent-compose Project

```bash
agent-compose config --quiet
agent-compose build
agent-compose up
```

检查运行状态：

```bash
agent-compose ps
agent-compose logs
```

`agent-compose.yml`完成以下工作：

- 从 `SCM_REPOSITORY_URL` 创建 Git Workspace；
- 构建 AutoDev Guest 镜像；
- 把状态卷挂载到 `/state`；
- 把仓库策略只读挂载到 `/etc/autodev/config.yml`；
- 以 Secret 形式注入 `SCM_API_TOKEN`；
- 注册 GitLab/GitHub Issue 事件 Scheduler；
- 为每次 Scheduler 调用创建新的 Sandbox。

## 配置 Webhook

首先设置 agent-compose 管理地址和一个随机 Webhook Secret：

```bash
export AGENT_COMPOSE_HTTP_URL=http://127.0.0.1:7410
export AGENT_COMPOSE_TOKEN='<agent-compose token>'
export SCM_PROVIDER=gitlab       # 或 github
export AUTODEV_WEBHOOK_TOKEN='<使用密码生成器生成的随机值>'
./scripts/register-webhook.sh
```

### GitLab 直连

注册脚本会让 agent-compose 从 `X-Gitlab-Token` 读取 Token。然后在目标项目中：

1. 打开 `Settings → Webhooks`；
2. URL 设置为：
   `https://<agent-compose-host>/api/webhooks/webhook.gitlab.issue`；
3. Secret token 设置为 `AUTODEV_WEBHOOK_TOKEN`；
4. 只选择 `Issues events`；
5. 根据部署情况启用 SSL verification；
6. 保存后使用 GitLab 的 Test 功能发送 Issue Hook。

### GitHub 接入

GitHub 原生 Webhook 使用 `X-Hub-Signature-256` HMAC。当前所适配的
agent-compose 版本虽然保留 signature 配置字段，但 Webhook 接收路径当前实际
使用 Bearer Token 或自定义 Token Header 鉴权，因此不能把 GitHub Webhook
直接暴露给该入口。

推荐在公网入口部署一个 Webhook relay：

```text
GitHub Webhook
  → relay 验证 X-Hub-Signature-256
  → 添加 Authorization: Bearer <AUTODEV_WEBHOOK_TOKEN>
  → 转发到 /api/webhooks/webhook.github.issues
```

GitHub 仓库 Webhook 配置：

1. `Settings → Webhooks → Add webhook`；
2. Payload URL 指向 relay 的公网 HTTPS 地址；
3. Content type 选择 `application/json`；
4. Secret 设置为 relay 用于验证 HMAC 的独立 Secret；
5. 选择 `Let me select individual events`；
6. 只选择 `Issues`；
7. relay 转发时使用 `AUTODEV_WEBHOOK_TOKEN` 访问 agent-compose。

不要在 relay 中跳过 GitHub HMAC 验证。等 agent-compose 正式支持 GitHub
签名校验后，可以移除 relay，但应先按所用版本的官方文档验证能力。

## 创建第一个自动开发任务

1. 在测试仓库创建 Issue，写清需求和验收条件；
2. 由 `allowed_actors` 中的维护者添加 `ai-ready`；
3. 观察 `agent-compose logs`；
4. 检查 `ai/issue-*` 分支；
5. 检查 Draft MR/PR；
6. 确认 CI 对应的 SHA 与 AutoDev 推送 SHA 一致；
7. 检查 Issue 中的 AutoDev 状态评论。

如果改动命中 `require_human_review`，审查代码后添加 `ai-approved` 标签，
AutoDev 会把批准绑定到当前 revision 并继续执行。

完整测试流程见 [测试指南](TESTING.md)。

## 运维命令

查看 agent-compose 平台运行：

```bash
agent-compose ps
agent-compose logs
agent-compose inspect sandbox <sandbox-id> --json
```

查看 AutoDev 工作流状态：

```bash
npm run runs -- list
npm run runs -- show <run-id>
```

更多说明见 [运行检查](docs/operations/run-inspection.md)。

## 安全说明

- `.env` 不得提交到 Git；
- Token 应使用最小权限，并优先使用短期 Installation Token；
- Webhook 鉴权、Secret 注入、Sandbox 和 Workspace 生命周期由
  agent-compose 负责；
- AutoDev 不实现自己的 Secret Store；
- 当前 Coding Agent 和 Publisher 仍可能处于同一 Sandbox，环境变量清理不等于
  硬权限隔离；
- 首次运行必须使用非生产仓库；
- 默认保留 CI、部署和生产配置为禁止修改路径；
- 默认只创建 Draft MR/PR，不自动合并和部署。

详细安全边界见 [安全与信任边界](docs/operations/security.md)。

## 项目结构

```text
agent-compose.yml        agent-compose Project 定义
config/                  仓库策略配置
docs/architecture/       系统架构与职责边界
docs/decisions/          架构决策记录
docs/operations/         部署、接入、安全和运维文档
scripts/                 Webhook 注册和测试工具
src/controller/          工作流控制器
src/git/                 Git Workspace 一致性检查
src/observability/       结构化运行事件
src/policies/            准入和门禁策略
src/runtime/             agent-compose Runtime 适配器
src/scm/                 GitHub/GitLab SCM 适配器
src/stages/              验证、发布、CI 阶段
src/state/               持久状态、幂等和仓库租约
tests/                   单元测试和边界集成测试
```

## 当前状态与限制

GitLab/GitHub 的核心工作流已经编码并通过本地测试。正式使用前仍应在一次性
测试仓库完成真实 Webhook、Push、MR/PR 和 CI smoke test。

当前不包含：

- 自动合并和部署；
- 面向公网的 GitHub Webhook HMAC relay；
- Coding Sandbox 与 Publisher 的平台级硬隔离；
- 生产 SLO 和长期运行 Dashboard。

路线图见 [交付路线图](docs/operations/roadmap.md)。

## 致谢与许可证

AutoDev 的运行和编排能力建立在
[chaitin/agent-compose](https://github.com/chaitin/agent-compose) 之上，感谢其
提供的开源 Agent 编排基础设施。使用和分发 agent-compose 时请遵守其仓库中的
许可证。

AutoDev 使用 [Apache License 2.0](LICENSE) 开源许可证。使用和分发本项目及
agent-compose 时，请分别遵守两个仓库中适用的许可证和版权声明。
