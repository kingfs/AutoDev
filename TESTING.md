# Testing AutoDev

## Local quality gates

```bash
npm ci
npm run check
npm test
npm run build
```

Validate the agent-compose project with non-secret fixture values:

```bash
SCM_REPOSITORY_URL=https://gitlab.example.com/group/project.git \
SCM_DEFAULT_BRANCH=main \
SCM_REPOSITORY=group/project \
SCM_GIT_TOKEN=dummy \
SCM_API_BASE_URL=https://gitlab.example.com \
SCM_API_TOKEN=dummy \
/data/src/github.com/chaitin/agent-compose/build/agent-compose config --quiet
```

The test suite includes:

- configuration parsing and defaults;
- admission and idempotency identity;
- durable run state and repository leases;
- quality-gate materialization and deterministic command execution;
- GitHub/GitLab webhook normalization;
- exact-SHA CI observation;
- a full plan/implement/verify/review no-push workflow over a real temporary Git repository;
- trusted commit and push to a real temporary bare Git remote;
- idempotent SCM run comments.

## Agent-compose smoke test

Prerequisites:

- agent-compose daemon and Docker are running;
- the configured target repository is a disposable test repository;
- Codex or the selected provider is authenticated in the guest runtime;
- `.env` contains real test credentials;
- the target repository policy uses safe validation commands.

Apply the project:

```bash
cp .env.example .env
# Edit .env with disposable test-project credentials.
agent-compose config --quiet
agent-compose build
agent-compose up
```

Register a GitLab webhook source and send a fixture:

```bash
export SCM_PROVIDER=gitlab
export AUTODEV_WEBHOOK_TOKEN='<test-webhook-token>'
./scripts/register-webhook.sh
./scripts/send-gitlab-fixture.sh
```

Inspect the run:

```bash
agent-compose ps
agent-compose logs
```

Expected outcomes:

1. a scheduler run is created for `webhook.gitlab.issue`;
2. admission accepts only an allowlisted issue carrying `ai-ready`;
3. the target repository receives an `ai/issue-*` branch;
4. deterministic gates pass before a draft MR is created;
5. one AutoDev marker comment is created or updated on the issue;
6. the result output contains `__AUTODEV_RESULT__` and a terminal status.

Never point the first smoke test at a production repository. AutoDev does not
merge changes, but the test exercises real branch push and MR creation.
