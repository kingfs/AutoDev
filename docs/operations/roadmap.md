# 交付路线图

路线围绕“问题分析、低级错误拦截、MR 合入审查”排序。状态含义：**已编码**表示有实现，
**已测试**表示有边界测试，**已证明**表示在真实 GitLab 完成验收。

## M0：当前基线

- GitLab Issue Hook、准入、Plan/Implement/Verify/内部 Review、Draft MR 和状态持久化；
- agent-compose Sandbox、Git Workspace、Secret 和 Scheduler 集成；
- `draft`、`no-push`、`plan-only` 模式；
- 不支持 Note Hook、MR Hook、MR Review 和显式重试命令。

## M1：GitLab 事件与命令底座——已编码，等待真实 Note Hook 证明

- 接入 Note Hook 和 Merge Request Hook；
- 解析 Issue/MR/Comment/Commit 事件，重新通过 API 获取权威对象；
- `help`、`status`、`analyze` 只读命令；
- bot 身份识别、权限校验、Webhook/Note 幂等和自评论防循环；
- 记录 delivery/note/target 身份和脱敏命令状态；原始投递由 agent-compose 保留。

验收：在现有 Issue 和 MR 评论 `@autodev status`，只产生一次可追踪回复，重复投递不重复执行。

## M2：Issue 事实分析与命令化实现

- 独立 Issue 分析结果：证据、合理性、必要性、可行性、风险、影响路径和待澄清问题；
- 明确 `rejected`、`needs_human`、`accepted` 的决策理由；
- `run` 只对 accepted Issue 进入实现；
- `retry` 支持失败、取消、无响应和人工补充后的恢复；
- 将状态从“一 Issue 一 Run”升级为 Target/Invocation/Attempt。

验收：同一 Issue 可分析、补充信息、重试和实现，历史结果完整且无重复 MR。

## M3：MR 只读合入审查

- 获取精确 target branch、head SHA、diff、commits、现有 notes/discussions；
- 确定性检查：构建、测试、类型、Lint、禁止路径、敏感信息、变更范围；
- 语义检查：需求覆盖、逻辑闭环、兼容性、安全、可维护性和测试质量；
- 输出 findings、严重级别、证据、合入结论和摘要评论；
- 新 SHA 自动使旧结论失效并重新审查；不自动 Approve/Merge。

验收：严重问题 MR 必须明确拒绝合入；质量良好 MR 必须给出核心工作摘要和“达到合入标准”的理由。

## M4：MR 修复确认与低级错误闭环

- 对之前 finding 建立稳定指纹，修复后标记 resolved/仍存在；
- `@autodev review` 审查当前 SHA，`@autodev retry` 重跑失败审查；
- 可选 `@autodev fix`，默认只生成建议，显式授权后才创建修复分支/MR；
- 行级 Discussion、重复评论抑制和结果更新。

## M5：真实仓库验收与运维

- 为 Issue 分析、Issue 实现、MR 审查分别建立真实 GitLab smoke test；
- 指标：响应延迟、重复率、拒绝准确性、finding 修复确认率、误报/漏报；
- 状态和 artifact 清理、成本预算、权限轮换和故障恢复；
- Pipeline/Job 事件仅作为可选证据源，不改变核心产品流程。

## 优先级原则

先实现“可解释地判断和评论”，再实现“自动修改”；先实现“只读审查”，再考虑“自动修复”；
所有远端写操作都必须由确定性控制器授权并可恢复。
