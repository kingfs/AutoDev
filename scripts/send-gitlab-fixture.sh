#!/usr/bin/env bash
set -euo pipefail

: "${AGENT_COMPOSE_HTTP_URL:=http://127.0.0.1:7410}"
: "${AGENT_COMPOSE_TOKEN:?set AGENT_COMPOSE_TOKEN}"
: "${AUTODEV_WEBHOOK_TOKEN:?set AUTODEV_WEBHOOK_TOKEN}"
: "${SCM_REPOSITORY:=group/project}"
: "${SCM_REPOSITORY_URL:=https://gitlab.example.com/group/project.git}"

curl --fail-with-body --silent --show-error \
  -X POST "$AGENT_COMPOSE_HTTP_URL/api/webhooks/webhook.gitlab.issue" \
  -H "Authorization: Bearer $AUTODEV_WEBHOOK_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Gitlab-Event: Issue Hook' \
  -H 'X-Gitlab-Event-UUID: autodev-fixture-1' \
  -H "Authorization: Bearer $AGENT_COMPOSE_TOKEN" \
  -d "$(printf '{\"event_type\":\"issue\",\"user\":{\"username\":\"fixture-user\"},\"project\":{\"id\":1,\"path_with_namespace\":\"%s\",\"git_http_url\":\"%s\",\"web_url\":\"https://gitlab.example.com/%s\",\"default_branch\":\"main\"},\"object_attributes\":{\"id\":101,\"iid\":101,\"action\":\"open\",\"title\":\"AutoDev fixture task\",\"description\":\"Add a small documented fixture change.\",\"updated_at\":\"2026-07-30T10:00:00Z\",\"url\":\"https://gitlab.example.com/%s/-/issues/101\",\"labels\":[{\"title\":\"ai-ready\"}]}}' "$SCM_REPOSITORY" "$SCM_REPOSITORY_URL" "$SCM_REPOSITORY" "$SCM_REPOSITORY")"

echo
