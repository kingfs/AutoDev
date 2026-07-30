# AutoDev 测试指南

## 本地质量检查

```bash
npm ci
npm run check
npm test
npm run build
```

使用不包含真实凭据的测试值验证 agent-compose Project：

```bash
SCM_PROVIDER=gitlab \
SCM_REPOSITORY_URL=https://gitlab.example.com/group/project.git \
SCM_DEFAULT_BRANCH=main \
SCM_REPOSITORY=group/project \
SCM_GIT_TOKEN=dummy \
SCM_API_BASE_URL=https://gitlab.example.com \
SCM_API_TOKEN=dummy \
agent-compose config --quiet
```

自动化测试覆盖：

- 配置解析、默认值和环境变量展开；
- 准入、事件操作者和任务幂等身份；
- 持久状态、原子事件 claim 和仓库租约；
- Git Workspace 与远端任务分支恢复；
- 质量门禁生成和确定性命令执行；
- 变更大小、Symlink、敏感信息扫描和证据脱敏；
- GitHub/GitLab Webhook 归一化；
- SCM 分页、幂等评论和瞬时错误重试；
- 精确 Commit SHA 的 CI 观察；
- 本地失败后的有限 Repair；
- 人工批准与具体代码 revision 绑定；
- 真实临时 Git 仓库上的 Commit、Push 和发布重入；
- deadline 和取消状态持久化。

## agent-compose Smoke Test

前置条件：

- agent-compose daemon 和 Docker 已启动；
- 目标仓库是可丢弃的测试仓库；
- Guest Runtime 中已完成 Codex 或其他 Agent Provider 认证；
- `.env` 包含测试仓库的真实凭据；
- `config/autodev.yml` 中的验证命令安全且可执行。

启动 Project：

```bash
cp .env.example .env
chmod 600 .env
# 编辑 .env 和 config/autodev.yml
agent-compose config --quiet
agent-compose build
agent-compose up
```

注册 GitLab Webhook Source 并发送测试 Fixture：

```bash
export SCM_PROVIDER=gitlab
export AUTODEV_WEBHOOK_TOKEN='<测试用随机 Token>'
./scripts/register-webhook.sh
./scripts/send-gitlab-fixture.sh
```

查看执行情况：

```bash
agent-compose ps
agent-compose logs
```

预期结果：

1. `webhook.gitlab.issue` 触发 Scheduler Run；
2. 只有白名单仓库中带有 `ai-ready` 的 Issue 通过准入；
3. 目标仓库出现 `ai/issue-*` 分支；
4. 所有确定性门禁通过后创建 Draft MR；
5. Issue 中只创建或更新一条带 AutoDev Marker 的评论；
6. Scheduler 输出包含 `__AUTODEV_RESULT__` 和终态；
7. CI 观察的 SHA 与 AutoDev 推送的 SHA 完全一致。

GitHub 需要先按 README 配置验证 `X-Hub-Signature-256` 的 relay，再把请求
转发到 `webhook.github.issues`。

首次 Smoke Test 绝不能使用生产仓库。虽然 AutoDev 不会自动合并，但该测试会
实际推送分支并创建 MR/PR。
