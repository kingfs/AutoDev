# GitHub App deployment

Use a dedicated GitHub App installation for AutoDev instead of a personal
access token. Token minting and injection belong to the deployment and
agent-compose secret boundary; AutoDev consumes only the injected installation
token.

Recommended repository permissions:

- Metadata: read
- Issues: read/write
- Contents: read/write
- Pull requests: read/write
- Actions: read
- Checks: read

Subscribe the App or repository webhook to Issues events only for the basic
workflow. Configure its webhook secret in the agent-compose webhook source.
Do not add webhook signature verification or private-key storage to AutoDev.

An installation access token is short lived. A production deployment should
mint/refresh it outside the coding sandbox and inject it as `SCM_API_TOKEN`
with `secret: true`. The Git workspace token can be a separate installation
token with Contents access. AutoDev never writes either token to run state.

Start with one disposable repository. Confirm Issue comment, branch creation,
draft PR, Actions exact-SHA observation, and duplicate delivery behavior before
installing the App for additional repositories.
