import * as vscode from 'vscode';
import { initializeLogging } from '../common/log';
import { createGitLabPlatformManagerBrowser } from './gitlab_platform_browser';
import { activateCommon } from '../common/main';

export const activate = async (context: vscode.ExtensionContext) => {
  const outputChannel = vscode.window.createOutputChannel('GitLab Workflow');
  initializeLogging(line => outputChannel.appendLine(line));
  const platformManager = await createGitLabPlatformManagerBrowser();
  await activateCommon(context, platformManager);
};
