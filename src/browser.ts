import * as vscode from 'vscode';
import { hello } from './commands/hello';

export const activate = async () => {
  vscode.window.createOutputChannel('Browser GitLab Workflow');
  vscode.commands.registerCommand('gl.hello', hello);
};
