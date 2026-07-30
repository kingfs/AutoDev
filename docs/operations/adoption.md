# Adopting AutoDev for a repository

The target operator supplies configuration; normal adoption should not fork the
workflow implementation.

## Required inputs

1. Repository clone URL and default branch/ref.
2. GitHub or GitLab API base URL and least-privilege token.
3. Webhook secret/token and external agent-compose webhook URL.
4. Admission labels and repository allowlist.
5. Validation commands and changed-path policies.
6. Agent provider/model and runtime limits.
7. Optional repository-specific skills.

## Expected deployment flow

```text
copy configuration example
  -> create .env with secrets
  -> customize repository policy
  -> agent-compose config --quiet
  -> agent-compose up
  -> register webhook source
  -> configure repository webhook
  -> send a signed fixture event
  -> enable the ai-ready label policy
```

## Safe defaults

- process only allowlisted repositories;
- require `ai-ready`;
- one mutating run per repository;
- create draft MR/PR only;
- never auto-merge or deploy;
- deny CI, credential, and production-deployment paths unless explicitly
  approved;
- use finite local and CI repair budgets;
- stop on ambiguous product requirements;
- keep SCM credentials out of the agent environment.

