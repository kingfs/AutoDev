# AutoDev 产品定位与 GitLab 深度集成

## 目标

AutoDev 的核心不是无人值守地修改代码，而是为仓库维护者提供一个基于代码事实的
问题分析、实现和合入审查助手。它把自然语言请求转成可审计的证据、门禁和建议；
只有通过确定性策略后，才允许产生代码或远端变更。

核心工作面分为两类：

1. **Issue 分析与实现**：判断 Bug/需求的合理性、必要性、可行性、影响范围和风险；
   不合理或证据不足时说明原因，合理任务才生成计划、实现、验证并创建 Draft MR。
2. **MR 合入审查**：基于目标分支、精确 head SHA、代码 diff、测试和仓库规范，判断
   逻辑闭环、质量、兼容性和风险；拒绝明显错误或破坏性改动，并对合格 MR 给出可读
   的合入结论。修复后必须针对新 SHA 重新审查，确认先前问题已解决。

Pipeline 不是产品入口。CI 结果是审查和发布证据的一部分，只有仓库确实需要时才接入。

## GitLab 事件与用户交互

建议启用三类 Project Webhook：

| 事件 | 用途 |
| --- | --- |
| Issues events | Issue 创建、更新、标签和生命周期变化 |
| Comment/Note events | Issue/MR 中的 `@autodev` 命令 |
| Merge request events | 新建、更新、新 commit、重新请求审查和合并状态 |

Push、Pipeline、Job 等事件可以后续扩展，不是第一阶段依赖。MR 新 commit 已包含在
Merge Request Hook 中；只有需要更细粒度的仓库级自动化时才增加 Push Hook。

推荐命令：

```text
@autodev help
@autodev status
@autodev analyze       # 分析 Issue 或 MR，不改代码
@autodev run           # Issue 通过分析后实现并创建 Draft MR
@autodev review        # 审查 MR 当前精确 SHA
@autodev retry         # 重试失败或没有响应的 invocation
@autodev cancel
```

裸 `@autodev` 只返回帮助或状态，不直接执行写操作。命令必须校验项目、对象、评论者
权限、命令白名单、当前 SHA 和幂等键；机器人自己的评论必须被忽略以防循环触发。

GitLab Project Access Token 会生成类似 `project_<id>_bot_<random>` 的 bot 用户名。
若要求用户真正输入稳定的 `@autodev`，应建立独立 GitLab 服务账号；短期也可以解析
评论文本中的 `/autodev` 或 `@autodev`。

## 决策与副作用边界

### Issue

```text
收到 Issue/命令
  → 重新读取 Issue 和仓库事实
  → 合理性/必要性/可行性/风险分析
  → rejected | needs_human | accepted
  → 计划、实现、确定性门禁、内部 Review
  → 推送任务分支并创建 Draft MR
```

模型可以提出分析和代码方案，但不能直接授权 Push、MR、合并或修改门禁。Issue 内容、
评论和仓库文件均视为不可信输入。

Issue 分析必须输出可验证的结构，而不是笼统的“建议实现”：

| 字段 | 要回答的问题 |
| --- | --- |
| codeEvidence | 哪些符号、路径、调用链或测试证明问题存在 |
| validity | 现象是否可复现，需求假设是否成立 |
| necessity | 是否已有能力，是否值得引入复杂度 |
| feasibility | 可实现路径、依赖和受限条件 |
| impact | API、数据、兼容性、性能和安全影响 |
| acceptance | 可以机械验证的验收条件 |
| verdict | accepted、needs_human 或 rejected |

证据不足不能判定 accepted；产品取舍不明确应进入 needs_human；与代码事实冲突、重复、
收益明显低于风险或违反仓库策略的请求应 rejected，并在 Issue 中说明证据和替代建议。

### MR

```text
收到 MR/评论命令
  → 重新读取 MR、diff、commits、讨论和目标分支
  → 低级错误与确定性门禁
  → 语义/安全/兼容性 Review
  → findings + 合入结论评论
  → 新 SHA 到达后失效旧结论并重新审查
```

第一阶段只评论，不自动批准、不自动合并、不修改作者分支。修复建议和自动修复应是
独立的、显式授权的后续命令。

MR 结论使用明确的三态，而不是含糊评分：

- `blocking`：存在正确性、安全、数据损坏、兼容性、严重质量或必需门禁失败，不能合入；
- `needs_attention`：没有已证实的严重破坏，但仍需作者解释或补充非阻塞改进；
- `merge_ready`：必需门禁通过，没有未解决的 blocking finding，并说明核心改动、验证证据
  和残余风险。

每条 finding 记录稳定指纹、首次发现 SHA、最近确认 SHA、证据位置和状态。新 SHA 到达后
旧的 `merge_ready` 自动失效；系统必须逐条确认旧 finding 是 resolved、仍存在或因代码移动
需要重新定位，不能仅重新生成一份无关联的 Review。

## 低级错误与确定性门禁

AutoDev 应优先消除机器能够可靠发现的问题，把人工注意力留给设计和业务判断。门禁至少
覆盖仓库配置的格式化、Lint、类型检查、构建、单元/集成测试，以及 AutoDev 自身执行的：

- 空变更、超大变更、意外二进制和符号链接；
- 禁止路径、生成文件和超出 Issue/MR 声明范围的修改；
- 密钥、凭据和高风险配置泄漏；
- 测试被删除、跳过、弱化，或质量配置被绕过；
- MR target/head SHA 漂移和审查证据过期。

模型不能宣布这些门禁通过。控制器保存命令、退出码、耗时和脱敏 artifact，并把失败项
直接纳入 Issue/MR 结论。测试通过也不等价于 merge_ready，语义审查仍必须闭环。

## 状态模型要求

一个 Issue 或 MR 不是一次性 Run，而是长期对象。建议模型为：

```text
Target (Issue # / MR !)
  → Invocation (analyze/run/review/retry)
  → Attempt (revision/SHA、证据、评论)
```

这样 `@autodev retry` 可以恢复 rejected/failed/无响应任务，同时保留历史证据；MR 每个
新 head SHA 都产生新的审查 Attempt。所有评论、finding 和结论必须带对象 ID、SHA 和
幂等键。

## 非目标

- 不自动合并生产 MR；
- 不把 AI 评论直接当作 GitLab Approval；
- 不因任意 Issue 文本或任意用户提及就执行代码修改；
- 不把 Pipeline 轮询当作核心用户体验；
- 不让模型输出直接触发远端副作用。
