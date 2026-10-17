// Every keyword is tested in order and the last match wins, so "unlocked"
// overrides "locked" and "merged" overrides "merge".
export const SYSTEM_NOTE_ICONS = [
  [/commit/, 'git-commit'],
  [/moved/, 'arrow-right'],
  [/description/, 'edit'],
  [/merge/, 'git-merge'],
  [/merged/, 'git-merge'],
  [/opened/, 'issue-opened'],
  [/closed/, 'issue-closed'],
  [/time estimate/, 'watch'],
  [/time spent/, 'watch'],
  [/assigned/, 'person'],
  [/title/, 'edit'],
  [/task/, 'tasklist'],
  [/mentioned in/, 'comment'],
  [/branch/, 'git-branch'],
  [/confidential/, 'eye-closed'],
  [/visible/, 'eye'],
  [/milestone/, 'milestone'],
  [/discussion/, 'comment'],
  [/outdated/, 'edit'],
  [/pinned/, 'pinned'],
  [/duplicate/, 'copy'],
  [/locked/, 'lock'],
  [/unlocked/, 'unlock'],
  [/due date/, 'calendar'],
  [/Compare with/, 'history'],
];

export const DEFAULT_SYSTEM_NOTE_ICON = 'circle-small-filled';

export const getSystemNoteIcon = (body = '') =>
  SYSTEM_NOTE_ICONS.reduce(
    (icon, [keyword, glyph]) => (keyword.test(body) ? glyph : icon),
    DEFAULT_SYSTEM_NOTE_ICON,
  );
