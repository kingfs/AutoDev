#!/usr/bin/env sh
set -eu

: "${SCM_REPOSITORY_URL:?SCM_REPOSITORY_URL is required}"
: "${SCM_DEFAULT_BRANCH:?SCM_DEFAULT_BRANCH is required}"
: "${SCM_GIT_TOKEN:?SCM_GIT_TOKEN is required}"
: "${AUTODEV_WORKSPACE:=/workspace}"

askpass_dir=$(mktemp -d)
# Expanded only when Git invokes the generated askpass helper.
# shellcheck disable=SC2016
printf '#!/usr/bin/env sh\ncase "$1" in *Username*) printf "%%s\\n" oauth2 ;; *) printf "%%s\\n" "$SCM_GIT_TOKEN" ;; esac\n' >"$askpass_dir/askpass"
chmod 700 "$askpass_dir/askpass"
export GIT_ASKPASS="$askpass_dir/askpass"
export GIT_TERMINAL_PROMPT=0

if [ ! -d "$AUTODEV_WORKSPACE/.git" ]; then
  git clone --branch "$SCM_DEFAULT_BRANCH" --single-branch "$SCM_REPOSITORY_URL" "$AUTODEV_WORKSPACE"
fi
# Expanded by Git when it invokes the credential helper.
# shellcheck disable=SC2016
git -C "$AUTODEV_WORKSPACE" config credential.helper \
  '!f() { printf "username=oauth2\npassword=%s\n" "$SCM_GIT_TOKEN"; }; f'
git -C "$AUTODEV_WORKSPACE" config credential.username oauth2
git -C "$AUTODEV_WORKSPACE" config core.askPass "$GIT_ASKPASS"

exec node /opt/autodev/dist/src/main.js
