#!/usr/bin/env bash
set -euo pipefail

: "${AGENT_COMPOSE_HTTP_URL:=http://127.0.0.1:7410}"
: "${SCM_PROVIDER:?set SCM_PROVIDER to gitlab or github}"
: "${AUTODEV_WEBHOOK_TOKEN:?set AUTODEV_WEBHOOK_TOKEN}"

case "$SCM_PROVIDER" in
  gitlab)
    source_id=autodev-gitlab
    prefix=webhook.gitlab.
    ;;
  github)
    source_id=autodev-github
    prefix=webhook.github.
    ;;
  *)
    echo "unsupported SCM_PROVIDER: $SCM_PROVIDER" >&2
    exit 2
    ;;
esac

curl --fail-with-body --silent --show-error \
  -X PUT "$AGENT_COMPOSE_HTTP_URL/api/webhook-sources/$source_id" \
  -H 'Content-Type: application/json' \
  -d "$(printf '{\"name\":\"AutoDev %s\",\"enabled\":true,\"provider\":\"%s\",\"topic_prefix\":\"%s\",\"token\":\"%s\"}' "$SCM_PROVIDER" "$SCM_PROVIDER" "$prefix" "$AUTODEV_WEBHOOK_TOKEN")"

echo
echo "registered $source_id; configure the repository webhook with the same token"
