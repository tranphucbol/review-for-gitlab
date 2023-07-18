#!/usr/bin/env bash

set -o errexit # AKA -e - exit immediately on errors (http://mywiki.wooledge.org/BashFAQ/105)
set -o pipefail # fail when pipelines contain an error (see http://www.gnu.org/software/bash/manual/html_node/Pipelines.html)
# set -o xtrace # AKA -x - get bash "stacktraces" and see where this script failed

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

PROJECT_ROOT="${SCRIPT_DIR}/.."
ICONS_FOLDER="${PROJECT_ROOT}/src/assets/icons"

ICONS_URL="https://gitlab.com/gitlab-org/editor-extensions/gitlab-ide-icons/-/raw/main/svg/"

# Test that the repository is not dirty so we don't give false positive
if [[ -n $(git -C "$PROJECT_ROOT" status -s) ]]; then
  echo "The repository has uncommited changes, make sure that 'git status' doesn't return anything before running the script."
  exit 1
fi

# Download all icons - replaces the versioned icons
for icon_path in "${ICONS_FOLDER}"/*
do
  icon_file=$(basename "${icon_path}")
  wget --output-document "$icon_path" "$ICONS_URL/$icon_file"
done

# Check if the Git repository has changes
if [[ -n $(git -C "$PROJECT_ROOT" status -s) ]]; then
  echo -e "\n-------------\n"
  echo -e "⚠⚠⚠⚠ Some icons have changed: ⚠⚠⚠⚠\n"
  git -C "$PROJECT_ROOT" status
  echo -e "\n-------------\n"
  if [[ -n "$CI" ]]; then
    echo "Follow the docs to update the icons:"
    echo "https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/blob/main/docs/developer/icons.md#the-check-icons-job-is-failing-what-should-i-do"
  else
    echo "Icons have been updated, you can locally test and commit the changes."
  fi
  exit 1
fi
