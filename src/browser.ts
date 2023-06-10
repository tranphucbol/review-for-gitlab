import * as vscode from 'vscode';
import { initializeLogging } from './log';
import { createGitLabPlatformManagerBrowser } from './gitlab/gitlab_platform_browser';
import { contextUtils } from './utils/context_utils';
import { CodeSuggestions } from './code_suggestions/code_suggestions';

export const activate = async (context: vscode.ExtensionContext) => {
  const outputChannel = vscode.window.createOutputChannel('GitLab Workflow');
  initializeLogging(line => outputChannel.appendLine(line));
  contextUtils.init(context);
  const platformManager = await createGitLabPlatformManagerBrowser();
  context.subscriptions.push(new CodeSuggestions(platformManager));
};
