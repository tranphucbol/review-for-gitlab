import * as vscode from 'vscode';
import { initializeLogging } from '../common/log';
import { createGitLabPlatformManagerBrowser } from './gitlab_platform_browser';
import { CodeSuggestions } from '../common/code_suggestions/code_suggestions';

export const activate = async (context: vscode.ExtensionContext) => {
  const outputChannel = vscode.window.createOutputChannel('GitLab Workflow');
  initializeLogging(line => outputChannel.appendLine(line));
  const platformManager = await createGitLabPlatformManagerBrowser();
  context.subscriptions.push(new CodeSuggestions(platformManager));
};
