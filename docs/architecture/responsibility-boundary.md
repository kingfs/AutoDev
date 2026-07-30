# AutoDev 与 agent-compose 职责边界

AutoDev 是运行在 agent-compose 上的自动化开发工作流应用。平台已经提供的
能力应直接使用，而不是在 AutoDev 中重复实现。

## agent-compose 负责

- Webhook 入口、Token 鉴权、请求大小限制、事件接收和分发；
- 通过 `secret: true` 声明、注入和展示脱敏敏感值；
- Sandbox 创建、隔离策略、生命周期、取消和资源限制；
- Git Workspace Clone/Provision 和凭据安装；
- Scheduler 并发策略及 Run/Sandbox 生命周期；
- Agent/LLM Provider 执行、认证、会话和用量统计；
- Volume 和平台层持久化。

AutoDev 只能引用这些能力，不能把 Webhook Secret、模型凭据或 Git 凭据复制到
自己的运行状态中。

当前 agent-compose Webhook 接收路径支持 Bearer Token 和自定义 Token Header。
GitLab 可以使用 `X-Gitlab-Token` 直连。GitHub HMAC 签名校验需要 relay 或未来
agent-compose 原生能力。

## AutoDev 负责

- 在 agent-compose 接收事件后归一化 Provider Payload；
- 仓库、标签、Issue 作者和事件操作者授权；
- Task/Run 身份和工作流级幂等语义；
- 开发阶段持久状态和 revision 证据失效；
- 仓库专用质量策略和确定性证据；
- Workspace 内的 Git Branch/Baseline 不变量；
- Push、MR/PR、评论和 CI 的先观察后操作；
- 有限修复预算和人工交接；
- SCM API 适配、分页、瞬时错误和精确 SHA CI 解释；
- 命令输出和 CI 证据在持久化或发送给模型前的脱敏。

## 共同边界契约

| 关注点 | agent-compose | AutoDev |
| --- | --- | --- |
| Webhook 信任 | 鉴权来源并生成事件 | 只接收配置 Topic，授权仓库和操作者 |
| Secret | 注入并对配置展示脱敏 | 不序列化，调用 Agent 前移除敏感环境变量 |
| Workspace | 在 Sandbox 中准备仓库 | 验证 Origin、Branch、Base SHA、Cleanliness 和远端状态 |
| 取消 | 停止 Scheduler Run/Sandbox | 接收终止信号并持久化终态 |
| 并发 | 限制 Scheduler/Sandbox 重叠运行 | 仓库租约作为手动或跨入口运行的额外防线 |
| 日志 | 保存平台 Run 日志 | 清洗任务 Artifact 和有限失败证据 |

`secret: true`保护平台配置处理和展示，但不能让同一 Sandbox 内的任意进程天然
无法读取 Secret。严格 Publisher 边界需要 agent-compose 提供独立 Sandbox 或
Capability Placement；AutoDev 应使用该边界，而不是实现另一套 Secret Store。
