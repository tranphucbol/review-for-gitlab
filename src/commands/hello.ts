import * as vscode from 'vscode';

export const hello = async () => {
  await vscode.window.showInformationMessage(`Hello`);
};
