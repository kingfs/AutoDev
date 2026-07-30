# GitHub App 部署

生产环境建议使用专用 GitHub App Installation Token，不要使用个人长期 Token。
Token 的生成、轮换和注入属于部署系统及 agent-compose Secret 边界；AutoDev
只消费注入后的短期 Token。

建议仓库权限：

- Metadata：Read；
- Issues：Read and write；
- Contents：Read and write；
- Pull requests：Read and write；
- Actions：Read；
- Checks：Read。

基础工作流只需要订阅 Issues 事件。

GitHub App Installation Token 有效期较短。生产部署应在 Coding Sandbox 外部
生成和刷新，然后通过 agent-compose 的 `secret: true` 机制注入
`SCM_API_TOKEN`。Git Workspace 可以使用另一个仅具有 Contents 权限的 Token。
AutoDev 不会把任何 Token 写入运行状态。

## Webhook 注意事项

GitHub 通过 `X-Hub-Signature-256` 对 Webhook Body 进行 HMAC 签名。当前
AutoDev 所适配的 agent-compose 版本尚未在接收路径执行该签名校验，因此需要
一个 relay：

1. relay 接收 GitHub Webhook；
2. 使用 GitHub App Webhook Secret 验证 `X-Hub-Signature-256`；
3. 验证成功后添加 agent-compose Webhook Source Bearer Token；
4. 转发到 `/api/webhooks/webhook.github.issues`。

relay 和 GitHub 使用的 HMAC Secret，不应与 relay 转发给 agent-compose 的
Bearer Token 相同。

先在一个测试仓库确认 Issue 评论、分支、Draft PR、Actions 精确 SHA 和重复
投递行为，再扩大 GitHub App 的安装范围。
