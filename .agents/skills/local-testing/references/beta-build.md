# Layer 5: a beta build for the user

When the user wants to try a change themselves, give them a `.vsix` whose
version is clearly a beta, so it is never confused with a release and VS Code
treats it as newer than what they have installed.

## Pick the version

Ask the user which beta they have installed, or read it from their VS Code:

```sh
code --list-extensions --show-versions | grep -i gitlab-workflow   # e.g. gitlab.gitlab-workflow@3.101.3-beta.2
```

Use the next number: `<current package.json version>-beta.<N+1>`.

## Build

```sh
source ~/.nvm/nvm.sh && nvm use 18.17.0 >/dev/null
npm pkg set version=3.101.3-beta.3     # changes only the version line
npm run package                        # dist-desktop/gitlab-workflow-3.101.3-beta.3.vsix
git checkout package.json              # the beta version is never committed
cp dist-desktop/gitlab-workflow-3.101.3-beta.3.vsix ~/Downloads/
git status --short                     # package.json must not be listed
```

Copy the `.vsix` out before anything else builds: every build empties
`dist-desktop/`.

## Check the file before handing it over

```sh
V=~/Downloads/gitlab-workflow-3.101.3-beta.3.vsix
unzip -p "$V" extension/package.json | grep '"version"'
unzip -p "$V" extension/extension.js | grep -c '<a string only the new code has>'
```

The count must be at least 1; for review code navigation, for example,
`vscode.executeDefinitionProvider`.

## Tell the user

- Install: `code --install-extension ~/Downloads/gitlab-workflow-<version>.vsix --force`,
  then run **Developer: Reload Window**.
- What to try, step by step, and what they should see.
- How to report a problem: turn on the `gitlab.debug` setting, reproduce, and
  copy the lines from the **GitLab Workflow** output channel. Name the log
  prefix the feature writes, if it has one.
- To go back: install the previous `.vsix` the same way.
