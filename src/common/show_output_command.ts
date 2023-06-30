import * as vscode from 'vscode';

export const COMMAND_SHOW_OUTPUT = 'gl.showOutput';

export const createShowOutputCommand = (outputChannel: vscode.OutputChannel) => () =>
  outputChannel.show();
