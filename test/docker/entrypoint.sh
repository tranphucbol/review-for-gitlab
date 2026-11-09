#!/usr/bin/env bash
# Runs a command inside the headless box (docs/decisions/025): copies the read-only checkout from
# /src into /work, installs Linux node_modules into the box's own volumes when a lockfile changed,
# starts a virtual display with a window manager and an unlocked keyring, then runs the command.
# Nothing in the host checkout is written: no dist-desktop/, test_workspace/ or node_modules/.
set -euo pipefail

rsync -a --delete \
  --exclude=.git --exclude=node_modules --exclude=/.vscode-test --exclude=/dist-desktop \
  --exclude=/dist-browser --exclude=/test_workspace --exclude=/docs/plans --exclude=/reports \
  --exclude='/webviews/*/dist' --exclude=.playwright-cli \
  /src/ /work/

# The volumes keep node_modules between runs; a changed lockfile reinstalls them.
LOCKS=(package-lock.json webviews/vue/package-lock.json webviews/vue2/package-lock.json
  scripts/commit-lint/package-lock.json)
STAMP=node_modules/.headless-box-locks
WANT="$(sha256sum "${LOCKS[@]}")"
install() {
  # The root's install scripts run one by one: keytar, which only vsce's `login` and `publish` use,
  # has no linux-arm64 prebuild and does not compile with this gcc, and the bundled Chromium is
  # never launched here. The root postinstall would `npm install` the sub-packages; `ci` is exact.
  npm ci --no-audit --no-fund --ignore-scripts
  npm rebuild esbuild msw
  for dir in webviews/vue webviews/vue2 scripts/commit-lint; do
    npm ci --no-audit --no-fund --prefix "$dir"
  done
}
if [ "$(cat "$STAMP" 2>/dev/null)" != "$WANT" ]; then
  echo "headless box: installing node_modules (a lockfile changed)"
  install >/tmp/npm-ci.log 2>&1 || {
    cat /tmp/npm-ci.log
    exit 1
  }
  printf '%s' "$WANT" >"$STAMP"
fi

SCREEN="${HEADLESS_BOX_SCREEN:-1920x1080x24}"
mkdir -p -m 1777 /tmp/.X11-unix
Xvfb :99 -screen 0 "$SCREEN" -nolisten tcp >/tmp/xvfb.log 2>&1 &
for _ in $(seq 1 100); do
  [ -S /tmp/.X11-unix/X99 ] && break
  sleep 0.1
done
[ -S /tmp/.X11-unix/X99 ] || {
  cat /tmp/xvfb.log
  exit 1
}
export DISPLAY=:99

# A login keyring created with a password is unlocked without a prompt; naming it the default stops
# libsecret asking to create another. The keyring and the session bus die with the container.
read -r -d '' SESSION <<'INNER' || true
mkdir -p ~/.local/share/keyrings && printf login >~/.local/share/keyrings/default
eval "$(printf '%s' headless-box | gnome-keyring-daemon --unlock --components=secrets)"
export GNOME_KEYRING_CONTROL
openbox >/tmp/openbox.log 2>&1 &
exec "$@"
INNER

exec dbus-run-session -- bash -c "$SESSION" headless "$@"
