import * as vscode from 'vscode';
import { initializeLogging } from '../common/log';
import { createGitLabPlatformManagerBrowser } from './gitlab_platform_browser';
import { activateCommon } from '../common/main';

export const activate = async (context: vscode.ExtensionContext) => {
  const outputChannel = vscode.window.createOutputChannel('GitLab Workflow');
  initializeLogging(line => outputChannel.appendLine(line));

  // browser always has account linked and repo opened.
  await vscode.commands.executeCommand('setContext', 'gitlab:noAccount', false);
  await vscode.commands.executeCommand('setContext', 'gitlab:validState', true);

  const platformManager = await createGitLabPlatformManagerBrowser();
  await activateCommon(context, platformManager, outputChannel);
};
