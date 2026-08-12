#!/usr/bin/env bash
set -euo pipefail

: "${AGENT_COMPOSE_HTTP_URL:=http://127.0.0.1:7410}"
: "${AGENT_COMPOSE_TOKEN:?set AGENT_COMPOSE_TOKEN}"
: "${SCM_PROVIDER:?set SCM_PROVIDER to gitlab or github}"
: "${AUTODEV_WEBHOOK_TOKEN:?set AUTODEV_WEBHOOK_TOKEN}"

case "$SCM_PROVIDER" in
  gitlab)
    source_id=autodev-gitlab
    prefix=webhook.gitlab.
    token_header=X-Gitlab-Token
    ;;
  github)
    source_id=autodev-github
    prefix=webhook.github.
    token_header=Authorization
    ;;
  *)
    echo "unsupported SCM_PROVIDER: $SCM_PROVIDER" >&2
    exit 2
    ;;
esac

curl --fail-with-body --silent --show-error \
  -X PUT "$AGENT_COMPOSE_HTTP_URL/api/webhook-sources/$source_id" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $AGENT_COMPOSE_TOKEN" \
  -d "$(printf '{\"name\":\"AutoDev %s\",\"enabled\":true,\"provider\":\"%s\",\"topic_prefix\":\"%s\",\"token\":\"%s\",\"token_header\":\"%s\"}' "$SCM_PROVIDER" "$SCM_PROVIDER" "$prefix" "$AUTODEV_WEBHOOK_TOKEN" "$token_header")"

echo
echo "已注册 Webhook Source：$source_id"
if [[ "$SCM_PROVIDER" == github ]]; then
  echo "注意：GitHub Webhook 需要由 relay 验证 X-Hub-Signature-256，再使用 Bearer Token 转发。"
fi
