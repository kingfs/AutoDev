# ADR 0002：使用 agent-compose 作为 Runtime 平台

- 状态：已接受
- 日期：2026-07-30

## 背景

AutoDev 需要事件、Scheduler、Sandbox、Git Workspace、Agent/LLM、Skill、
Secret、Session、取消和 Run 生命周期。若在工作流中重新实现，会形成第二套
Runtime，增加维护和运维成本。

## 决策

使用 [agent-compose](https://github.com/chaitin/agent-compose) 作为 Runtime 和
控制平面宿主。AutoDev 只实现工作流和策略层，通过薄适配器调用 Runtime，领域
代码不依赖具体模型 API。

主编排采用服务式 Scheduler Workflow。一个 Controller 持有可变 Git 状态，
不同逻辑角色通过 Runtime Agent 调用实现。初始设计不允许多个独立 Agent 并行
修改同一个 Workspace。

## 影响

- AutoDev 可以继承 agent-compose 的 Provider 和基础设施升级；
- Git 和工作流语义可以脱离模型单独测试；
- 部署依赖 agent-compose daemon 和 Guest Image；
- Runtime 能力缺口应优先在 agent-compose 中补齐，或使用薄适配器，不应复制
  完整 Provider Harness。
