# 系统架构

## 1. 目标

AutoDev 把经过信任检查的 Issue 转换成可验证的代码变更提案。它不是一个大型
自治 Prompt，而是围绕 Coding Agent 构建的自动化控制器：概率性工作交给模型，
确定性工作交给控制程序。

首个 Runtime 平台是
[agent-compose](https://github.com/chaitin/agent-compose)。AutoDev 使用其
Project、Scheduler、Webhook Source、Sandbox、Git Workspace、Agent/LLM
Runtime、Secret、Volume 和运行生命周期，不重复实现这些设施。

精确职责见 [AutoDev 与 agent-compose 职责边界](responsibility-boundary.md)。

## 2. 系统边界

```text
GitHub / GitLab
      │ Issue Webhook
      ▼
agent-compose Webhook Source
  - 入口鉴权
  - 事件去重和分发
      │
      ▼
agent-compose Scheduler
  - 并发策略
  - 新 Sandbox
  - Git Workspace
      │
      ▼
AutoDev Controller
  ├── Runtime Adapter ──> Plan/Implement/Review/Repair Agent
  ├── Policy/Gates ─────> 确定性命令与安全检查
  ├── Git Workspace ────> Branch/Commit/Push 一致性
  ├── SCM Adapter ──────> GitHub/GitLab API
  └── State/Evidence ───> /state 持久卷
```

agent-compose 负责 Runtime 基础设施；AutoDev 负责自动开发语义；目标仓库维护者
负责验收策略和验证命令。

## 3. 两个执行平面

### 3.1 Agent 平面

需要仓库工具和迭代推理时使用 Coding Agent：

- 需求和仓库分析；
- 实现计划；
- 代码和测试修改；
- 语义审查；
- 根据本地或 CI 证据修复。

Agent 输出是不可信提案。关键阶段采用结构化 Schema；Agent 无权声明机械门禁
已经通过，也无权直接创建 MR/PR。

### 3.2 AutoDev 确定性控制平面

AutoDev Controller 负责：

- Provider Payload 归一化；
- 仓库、标签、作者和事件操作者准入；
- Task/Run Identity 和工作流级幂等；
- Git Baseline、任务分支和恢复；
- 质量门禁固化与执行；
- 命令退出码和脱敏证据；
- 禁止路径、人工审批路径和变更限制；
- 修复预算和 revision 转换；
- Commit、Push、MR/PR 创建或更新；
- 精确 SHA CI 观察；
- Issue 评论和最终状态。

Webhook 鉴权、Secret 注入、Sandbox 生命周期和 Scheduler 并发属于
agent-compose 平台控制面。

## 4. 主要组件

### 4.1 事件适配器

GitHub/GitLab Payload 会转换成统一 `WorkItem`：

```ts
interface WorkItem {
  provider: "github" | "gitlab";
  deliveryId: string;
  actor: string;
  action: string;
  repository: RepositoryRef;
  issue: IssueRef;
  revision: string;
}
```

工作流策略不直接依赖 Provider 原始字段。`actor` 表示触发本次操作的人，与
Issue 原作者分开授权。

### 4.2 准入策略

默认准入要求：

- Provider 与 Project 配置一致；
- 仓库在 Allowlist 中；
- 事件动作可执行；
- Issue 包含 `ai-ready` 等必需标签；
- Issue 作者和事件操作者符合信任策略；
- 仓库没有冲突的修改任务；
- 事件和 Task Identity 没有被重复处理。

模式包括：

- `draft`：完整执行并创建 Draft MR/PR；
- `no-push`：完成本地验证但不发布；
- `plan-only`：只输出计划。

### 4.3 Workspace 管理器

agent-compose 负责 Clone 和 Sandbox Workspace。AutoDev 在其内部验证：

- Origin 与配置仓库一致；
- 初始工作树干净；
- Base Branch 和 Base SHA 可观察；
- 当前分支是确定性任务分支；
- 重启后可以从远端任务分支恢复；
- 远端分支发生意外移动时拒绝覆盖。

### 4.4 状态与协调

持久状态记录：

```text
accepted → workspace_ready → planned → gates_frozen
         → implemented → locally_verified → reviewed
         → published → ci_green → completed
```

每次实现或修复创建一个 revision：

```text
revision N
  ├── verification N
  ├── review N
  ├── publication N / pushed SHA N
  └── CI N
```

创建 revision N+1 后，revision N 的验证、发布和 CI 不能满足新 revision。

文件状态存储采用临时文件加原子 Rename。事件先执行原子 Claim；仓库租约防止
手动或跨入口运行同时修改同一仓库。

### 4.5 质量门禁

门禁来源按顺序合并：

1. 全局安全默认值；
2. AutoDev Project 中的仓库策略；
3. Plan 识别的预期影响路径；
4. 实际 Changed Path 追加规则。

门禁在 Plan 后固化。实际路径可以追加更保守的检查，但 Agent 不能删除已有门禁。

门禁包括：

- 必须产生非空变更；
- 禁止路径；
- 命令退出码；
- 文件数量、单文件和总大小；
- Symlink 和 Workspace 逃逸；
- 私钥和 Token Pattern；
- 人工审批路径；
- 语义审查；
- 精确 SHA CI。

### 4.6 Runtime Adapter

`src/runtime` 是 agent-compose Runtime SDK 的薄适配层，提供 Plan、Implement、
Review、Repair 四种结构化调用。调用前会暂时移除配置的 SCM 敏感环境变量。

模型和 Provider 由配置选择，但必须满足阶段所需的工具和结构化输出能力。

### 4.7 SCM Adapter

工作流只依赖统一 SCM 接口：

- 评论 Issue；
- 查找、创建和更新 MR/PR；
- 按 SHA 查找 Pipeline/Actions Run；
- 获取失败 Job 证据。

GitHub 和 GitLab 适配器分别处理认证 Header、API 路径、分页、有限瞬时重试和
Provider 状态映射。

发布遵守先观察后操作：

1. 观察远端任务分支；
2. 检查远端 SHA 是否是当前提交祖先；
3. 相同 SHA 时跳过重复 Push；
4. 更新时使用精确 `--force-with-lease`；
5. 按 Source Branch 查找现有 MR/PR；
6. 创建或幂等更新；
7. 持久化远端 ID 和 Push SHA。

### 4.8 状态、Artifact 和可观测性

`/state` 中保存：

- 归一化任务身份；
- 阶段和 revision；
- Git Baseline 和 Checkpoint；
- 固化门禁及结果；
- 修复计数；
- MR/PR 身份和 Push SHA；
- CI 身份和终态；
- 人工批准；
- 脱敏错误和最终摘要。

较大的命令证据写入 Artifact 文件。每次状态转换输出
`__AUTODEV_EVENT__`；最终结果输出 `__AUTODEV_RESULT__`。

## 5. 端到端流程

### Intake

agent-compose 完成 Webhook Source 鉴权并触发 Scheduler。AutoDev 归一化事件、
执行准入、Claim 事件并获取仓库租约。拒绝事件不会调用 Coding Agent。

### Plan

Planning Agent 读取仓库约束，输出验收条件、影响区域、实施步骤、风险、预期路径、
检查建议和 MR/PR 信息。需要重要产品或安全决策时进入 `needs_human`。

### Implement 和 Verify

Implementation Agent 只修改本地任务分支。控制程序计算真实 Diff，追加路径门禁，
执行安全检查和仓库命令。机械失败不能被 Agent 的文字结论覆盖。

### Review 和 Repair

Review Agent 检查需求覆盖、正确性、安全性、兼容性和测试质量。失败证据经过长度
限制和脱敏后交给 Repair Agent。每次 Repair 创建新 revision，本地和 CI Repair
拥有独立预算。

### Publish 和 CI

只有当前 revision 的最终门禁全部通过，控制程序才 Commit、Push 并创建 Draft
MR/PR。CI 必须匹配 Push SHA；失败可以触发 CI Repair，成功后完成任务。

### 人工批准

Plan 问题可以通过更新 Issue 后重新触发。高风险路径需要可信操作者添加
`ai-approved`，批准只绑定当前实现 revision。

## 6. 并发、恢复和取消

- 一个 agent-compose Project 对应一个仓库；
- Scheduler 使用 `concurrency_policy: skip` 避免重叠；
- AutoDev 仓库租约作为额外防线；
- Workspace 重启时重新观察本地和远端任务分支；
- Push、MR/PR 和评论均具备幂等观察；
- SIGTERM、SIGINT 或 Deadline 会持久化 `cancelled`；
- agent-compose 负责真正停止 Sandbox/Run。

## 7. 安全模型

主要威胁：

- Issue/仓库 Prompt Injection；
- Agent 误用 SCM 能力；
- 命令或 CI 日志泄漏 Secret；
- 恶意修改 CI、认证或生产部署文件；
- 重复事件和并发 Push；
- 错误 CI SHA 被当作成功。

主要控制：

- agent-compose Webhook Token 和 Secret 注入；
- 仓库、作者和操作者 Allowlist；
- 新 Sandbox 和仓库租约；
- Agent 环境变量清理；
- 禁止路径和人工审批；
- 变更限制和 Secret Scan；
- 脱敏 Artifact；
- 固化门禁和有限修复；
- Observe-before-act；
- 精确 SHA CI。

当前同一 Sandbox 中的 Coding Agent 与 Publisher 不是硬权限隔离。严格多租户
边界需要 agent-compose 提供独立 Publisher Capability。

## 8. 可移植性

接入新仓库通常只需要：

1. 复制 `.env.example`；
2. 填写 SCM 和仓库变量；
3. 修改验证命令和路径策略；
4. 启动 agent-compose Project；
5. 注册 Webhook Source；
6. 在一次性测试仓库完成 Smoke Test。

不应为了接入普通仓库 Fork Workflow Core。
