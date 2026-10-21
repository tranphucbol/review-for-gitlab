import * as vscode from 'vscode';

export const SHOW_LOCAL_CHANGE_BUTTONS = 'gitlab.mergeRequestDiff.showLocalChangeButtons';

/** Whether the side-by-side view offers buttons that change the local file. Off unless set. */
export const getShowLocalChangeButtons = (): boolean =>
  vscode.workspace.getConfiguration('gitlab.mergeRequestDiff')?.showLocalChangeButtons === true;
