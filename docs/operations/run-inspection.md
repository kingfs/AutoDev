# 运行状态检查

AutoDev 负责开发工作流状态；agent-compose 负责 Scheduler Run、Sandbox、
Webhook 事件和平台日志。

在挂载 AutoDev 状态卷的 Shell 中查看工作流状态：

```bash
npm run runs -- list
npm run runs -- show run-42-deadbeef
```

每次持久化状态转换都会输出一行以 `__AUTODEV_EVENT__` 开头的结构化事件。
Scheduler 最终结果以 `__AUTODEV_RESULT__` 开头。这些记录只包含任务标识、
阶段和状态，不包含命令输出或凭据。

平台层操作使用 agent-compose：

```bash
agent-compose ps
agent-compose logs
agent-compose inspect sandbox <sandbox-id> --json
```

Webhook Replay 和 Scheduler Run 取消也应使用 agent-compose。重放事件仍需通过
AutoDev 的准入、任务身份、仓库租约和工作流幂等检查。
