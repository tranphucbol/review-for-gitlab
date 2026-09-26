#!/bin/zsh
# Start VS Code with an isolated profile, one .vsix installed and a CDP port for playwright-cli.
#   launch.sh <code-app-path> <port> <profile-dir> <folder> <vsix>
# The account comes from GITLAB_WORKFLOW_INSTANCE_URL/GITLAB_WORKFLOW_TOKEN, filled from
# $GITLAB_HOST/$GITLAB_TOKEN, so the token is never typed, printed or saved in the profile.
set -eu
APP=$1 PORT=$2 E=$3 FOLDER=$4 VSIX=$5
: "${GITLAB_HOST:?set GITLAB_HOST}" "${GITLAB_TOKEN:?set GITLAB_TOKEN}"
CLI="$APP/Contents/Resources/app/bin/code"
mkdir -p "$E/ext" "$E/ud/User"
cat > "$E/ud/User/settings.json" <<'JSON'
{
  "gitlab.debug": true,
  "workbench.startupEditor": "none",
  "update.mode": "none",
  "extensions.autoUpdate": false,
  "telemetry.telemetryLevel": "off",
  "security.workspace.trust.enabled": false,
  "chat.disableAIFeatures": true,
  "window.restoreWindows": "none"
}
JSON
"$CLI" --extensions-dir "$E/ext" --user-data-dir "$E/ud" --install-extension "$VSIX" --force >/dev/null
"$CLI" --extensions-dir "$E/ext" --user-data-dir "$E/ud" --list-extensions --show-versions
GITLAB_WORKFLOW_INSTANCE_URL="$GITLAB_HOST" GITLAB_WORKFLOW_TOKEN="$GITLAB_TOKEN" \
  "$APP/Contents/MacOS/"*(N[1]) --remote-debugging-port="$PORT" --extensions-dir "$E/ext" --user-data-dir "$E/ud" \
  --disable-workspace-trust --skip-welcome --skip-release-notes --new-window "$FOLDER" >"$E/code.log" 2>&1 &
echo "pid $!"
