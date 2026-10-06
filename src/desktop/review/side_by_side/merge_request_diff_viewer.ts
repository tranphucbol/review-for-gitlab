import * as vscode from 'vscode';

export const MERGE_REQUEST_DIFF_VIEWER = 'gitlab.mergeRequestDiff.viewer';

export type MergeRequestDiffViewer = 'native' | 'sideBySide';

/** Which viewer a click on a changed file opens. Anything but `sideBySide` is the native diff. */
export const getMergeRequestDiffViewer = (): MergeRequestDiffViewer =>
  vscode.workspace.getConfiguration('gitlab.mergeRequestDiff')?.viewer === 'sideBySide'
    ? 'sideBySide'
    : 'native';

export const SHOW_LOCAL_CHANGE_BUTTONS = 'gitlab.mergeRequestDiff.showLocalChangeButtons';

/** Whether the side-by-side view offers buttons that change the local file. Off unless set. */
export const getShowLocalChangeButtons = (): boolean =>
  vscode.workspace.getConfiguration('gitlab.mergeRequestDiff')?.showLocalChangeButtons === true;
