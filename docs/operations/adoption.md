# 为仓库接入 AutoDev

仓库维护者只需要提供环境配置和仓库策略，正常接入不应 Fork AutoDev 的工作流
实现。

## 需要准备的信息

1. SCM 类型：GitHub 或 GitLab；
2. 仓库 Clone URL、完整名称和默认分支；
3. 最小权限 Git Token 和 SCM API Token；
4. agent-compose 对外 Webhook 地址和随机 Webhook Token；
5. 准入标签、仓库白名单、可信作者和可信事件操作者；
6. 测试、Lint、类型检查、构建等确定性命令；
7. 禁止自动修改和需要人工审批的路径；
8. Agent Provider、运行超时和修复预算；
9. 可选的项目专用 Agent Skill。

## 接入流程

```text
复制 .env.example
  → 填写仓库和凭据
  → 修改 config/autodev.yml
  → agent-compose config --quiet
  → agent-compose build / up
  → 注册 Webhook Source
  → 配置仓库 Webhook
  → 在一次性测试仓库完成 Smoke Test
  → 再为正式仓库启用 ai-ready
```

## 推荐默认策略

- 只处理白名单仓库；
- 必须由可信维护者添加 `ai-ready`；
- 一个 agent-compose Project 对应一个目标仓库；
- 只创建 Draft MR/PR；
- 不自动合并和部署；
- 默认禁止修改 CI、凭据和生产部署路径；
- 本地修复和 CI 修复均设置有限预算；
- 产品或安全需求不明确时停止并请求人工输入；
- 敏感路径批准必须绑定当前代码 revision；
- SCM 凭据由 agent-compose 注入，不进入 Agent Prompt 和 AutoDev 状态。

完整环境变量和 GitHub/GitLab 配置见仓库根目录 README。
