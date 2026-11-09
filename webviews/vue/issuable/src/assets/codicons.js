/*
 * The codicons the Overview uses, inlined as SVG markup at build time so that
 * the webview needs no font and no CSP change. Glyphs from @vscode/codicons,
 * CC-BY-4.0, https://github.com/microsoft/vscode-codicons.
 * Keys are codicon names; `issue-opened` and `issue-closed` are the font's
 * aliases of `issues` and `pass`.
 */
// The resolver does not know Vite's `?raw` suffix; the build fails on a missing file.
/* eslint-disable import/no-unresolved */
import arrowRight from '@vscode/codicons/src/icons/arrow-right.svg?raw';
import calendar from '@vscode/codicons/src/icons/calendar.svg?raw';
import check from '@vscode/codicons/src/icons/check.svg?raw';
import chevronDown from '@vscode/codicons/src/icons/chevron-down.svg?raw';
import chevronRight from '@vscode/codicons/src/icons/chevron-right.svg?raw';
import circleLarge from '@vscode/codicons/src/icons/circle-large.svg?raw';
import circleSlash from '@vscode/codicons/src/icons/circle-slash.svg?raw';
import circleSmallFilled from '@vscode/codicons/src/icons/circle-small-filled.svg?raw';
import code from '@vscode/codicons/src/icons/code.svg?raw';
import comment from '@vscode/codicons/src/icons/comment.svg?raw';
import commentDiscussion from '@vscode/codicons/src/icons/comment-discussion.svg?raw';
import copy from '@vscode/codicons/src/icons/copy.svg?raw';
import debugStepOver from '@vscode/codicons/src/icons/debug-step-over.svg?raw';
import edit from '@vscode/codicons/src/icons/edit.svg?raw';
import error from '@vscode/codicons/src/icons/error.svg?raw';
import eye from '@vscode/codicons/src/icons/eye.svg?raw';
import eyeClosed from '@vscode/codicons/src/icons/eye-closed.svg?raw';
import file from '@vscode/codicons/src/icons/file.svg?raw';
import gitBranch from '@vscode/codicons/src/icons/git-branch.svg?raw';
import gitCommit from '@vscode/codicons/src/icons/git-commit.svg?raw';
import gitMerge from '@vscode/codicons/src/icons/git-merge.svg?raw';
import gitPullRequest from '@vscode/codicons/src/icons/git-pull-request.svg?raw';
import gitPullRequestClosed from '@vscode/codicons/src/icons/git-pull-request-closed.svg?raw';
import gitPullRequestDraft from '@vscode/codicons/src/icons/git-pull-request-draft.svg?raw';
import history from '@vscode/codicons/src/icons/history.svg?raw';
import issues from '@vscode/codicons/src/icons/issues.svg?raw';
import linkExternal from '@vscode/codicons/src/icons/link-external.svg?raw';
import lock from '@vscode/codicons/src/icons/lock.svg?raw';
import milestone from '@vscode/codicons/src/icons/milestone.svg?raw';
import pass from '@vscode/codicons/src/icons/pass.svg?raw';
import person from '@vscode/codicons/src/icons/person.svg?raw';
import pinned from '@vscode/codicons/src/icons/pinned.svg?raw';
import reactions from '@vscode/codicons/src/icons/reactions.svg?raw';
import sync from '@vscode/codicons/src/icons/sync.svg?raw';
import tag from '@vscode/codicons/src/icons/tag.svg?raw';
import tasklist from '@vscode/codicons/src/icons/tasklist.svg?raw';
import typeHierarchy from '@vscode/codicons/src/icons/type-hierarchy.svg?raw';
import unlock from '@vscode/codicons/src/icons/unlock.svg?raw';
import watch from '@vscode/codicons/src/icons/watch.svg?raw';

export default {
  'arrow-right': arrowRight,
  calendar,
  check,
  'chevron-down': chevronDown,
  'chevron-right': chevronRight,
  'circle-large': circleLarge,
  'circle-slash': circleSlash,
  'circle-small-filled': circleSmallFilled,
  code,
  comment,
  'comment-discussion': commentDiscussion,
  copy,
  'debug-step-over': debugStepOver,
  edit,
  error,
  eye,
  'eye-closed': eyeClosed,
  file,
  'git-branch': gitBranch,
  'git-commit': gitCommit,
  'git-merge': gitMerge,
  'git-pull-request': gitPullRequest,
  'git-pull-request-closed': gitPullRequestClosed,
  'git-pull-request-draft': gitPullRequestDraft,
  history,
  'issue-closed': pass,
  'issue-opened': issues,
  'link-external': linkExternal,
  lock,
  milestone,
  pass,
  person,
  pinned,
  reactions,
  sync,
  tag,
  tasklist,
  'type-hierarchy': typeHierarchy,
  unlock,
  watch,
};
