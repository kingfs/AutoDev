# 安全与信任边界

## 凭据

SCM API 凭据由 agent-compose 的 Secret 配置保存并注入，AutoDev 不实现自己的
凭据存储。确定性 Controller 使用注入后的 SCM 能力；调用 Coding Agent 前，
AutoDev 会移除配置的敏感环境变量。

Prompt、模型 Transcript、命令 Artifact 和 Issue 报告不得包含凭据。AutoDev
会对命令输出、CI 日志和异常信息做脱敏，但部署方仍应避免让测试命令主动输出
Secret。

当前服务式部署中，Controller 和 Coding Agent 子进程可能共享 Sandbox。
环境变量清理可以阻止普通继承，但不是进程级或硬件级安全边界。多租户生产环境
需要 agent-compose 提供独立 Sandbox 或 Capability，把特权 Publisher 与 Coding
Sandbox 分开。AutoDev 届时只向该边界传递已经验证的发布请求。

## 不可信输入

以下内容均应视为不可信：

- Issue 标题、正文、评论、标签和附件；
- 仓库指令和源代码；
- 依赖安装输出；
- 命令 stdout/stderr；
- CI 日志和 Artifact；
- 模型输出。

仓库白名单、准入标签、作者/操作者授权、禁止路径、人工审批路径、有限修复预算、
Schema 校验和确定性远端操作是必需的防线。Prompt 中的约束不能替代授权。

## Git 能力

agent-compose 准备的 Workspace 可能包含 Clone/Push 凭据。Coding Agent 会被明确
要求禁止 Push，但更强的部署应使用独立读写身份或平台 Push Guard，让只有可信
Publisher 能执行写操作。在该能力边界可用前，AutoDev 只应处理可信维护者在
白名单仓库中触发的任务。

## 默认远端策略

- 只创建 Draft MR/PR；
- 不自动合并；
- 不自动部署；
- CI 必须绑定精确 Push SHA；
- MR/PR 和 Issue 评论均先观察再创建；
- 一个 Project 同时只运行一个仓库修改任务；
- 高风险路径必须人工批准；
- 生产部署和 CI 配置默认禁止自动修改。
