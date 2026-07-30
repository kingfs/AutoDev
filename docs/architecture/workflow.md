# 工作流契约

## 阶段图

```text
intake → workspace → plan → gates → implement
       → verify → review → publish → ci → report
```

`implement`、`verify`、`publish` 和 `ci` 都与代码 revision 绑定。每次 Repair
都会创建新 revision，并让旧 revision 的验证、发布和 CI 证据失效。

## 阶段归属

| 阶段 | 主要执行者 | 允许的副作用 |
| --- | --- | --- |
| Intake | 控制程序 | 保存归一化事件、幂等 Claim、仓库租约 |
| Workspace | 控制程序 | Fetch、Checkout、任务分支与恢复 |
| Plan | Agent | 只返回结构化计划 |
| Gates | 控制程序 | 固化质量策略 |
| Implement | Agent | 只修改本地 Workspace |
| Verify | 控制程序 | 执行命令、保存脱敏证据，不写远端 |
| Review | Agent + 控制程序 | Agent 语义审查，控制程序决定门禁结果 |
| Publish | 控制程序 | Commit、Push、创建或更新 MR/PR |
| CI | 控制程序 + Repair Agent | 精确 SHA 轮询，失败时本地修复 |
| Report | 控制程序 | Issue 评论和终态 |

## 终态

- `completed`：当前 revision 发布成功并通过 CI；
- `plan_completed`：Plan-only 模式完成，没有修改仓库；
- `needs_human`：缺少需求选择、批准或高风险审查；
- `rejected`：准入策略拒绝任务；
- `failed`：发生不可恢复错误；
- `budget_exhausted`：修复预算耗尽；
- `cancelled`：达到 deadline 或平台取消任务。

## 不变量

1. 准入和 Workspace 验证前不允许远端写操作；
2. 当前 revision 的所有必需门禁通过前不允许 Push；
3. 模型不能修改固化门禁，也不能声明命令已经通过；
4. CI Success 必须匹配当前 revision 的精确 Push SHA；
5. 所有远端 Create 前必须先执行幂等查找；
6. Secret 不得进入模型可见上下文；
7. 高风险路径默认必须人工批准；
8. 人工批准只对指定 revision 有效。
