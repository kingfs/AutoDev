# 交付路线图

## 阶段 0：架构基线——已完成

- 定义 Agent/控制平面边界；
- 定义状态模型、工作流不变量、安全模型和可移植配置；
- 明确 AutoDev 与 agent-compose 的职责划分。

## 阶段 1：GitLab 垂直链路——已编码，等待真实环境证明

- GitLab Issue Hook 归一化和准入；
- agent-compose Git Workspace 与 Scheduler；
- Plan、Implement、Review、Repair；
- 确定性质量门禁；
- 可信 Commit、Push、Draft MR 和 Issue 评论；
- 持久状态、幂等评论和仓库租约。

退出条件：在一次性真实 GitLab 仓库中完成 Issue 到 Draft MR；重复投递不创建
重复分支、MR 或评论。

## 阶段 2：CI 闭环——已编码并通过本地测试，等待真实环境证明

- 精确 Push SHA 的 Pipeline 观察；
- 失败 Job 证据和有限 CI Repair；
- deadline、取消、Workspace/远端恢复；
- revision 级证据失效和人工审批；
- 证据脱敏、敏感信息扫描和变更范围限制。

Webhook 鉴权、Secret 注入、Sandbox 取消属于 agent-compose，不在 AutoDev
重复实现。

## 阶段 3：SCM 可移植性——已编码并通过本地测试

- Provider-neutral SCM 接口；
- GitHub Issues、PR 和 Actions；
- GitHub/GitLab 分页与有限瞬时重试；
- GitHub Actions 失败证据；
- GitHub App 最小权限指南；
- Go、TypeScript、Python 和 Monorepo 门禁示例。

剩余条件：真实 GitHub App/relay Smoke Test。GitHub Webhook HMAC 校验当前需要
relay 或未来 agent-compose 原生能力。

## 阶段 4：规模化和运维——部分完成

已完成：

- 结构化运行事件；
- AutoDev 状态只读查询；
- agent-compose Project 模板；
- 仓库策略和部署文档。

后续工作：

- 生产指标、SLO 和 Dashboard；
- Artifact/状态清理策略；
- 多 Project 配置生成器；
- 可选的成本感知模型路由；
- agent-compose 提供的独立 Publisher Capability。

Event Replay、Scheduler Run 管理和 Sandbox 清理由 agent-compose 平台负责。

## 状态术语

- **已编码**：存在实现并通过针对性单元测试；
- **已测试**：边界、失败和恢复集成测试通过；
- **已证明**：在一次性真实 SCM 仓库中完成文档场景；
- **生产可用**：目标部署接受安全边界、运维能力和 SLO 证据。
