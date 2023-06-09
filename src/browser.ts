import * as vscode from 'vscode';
import { initializeLogging } from './log';
import { createGitLabPlatformManagerBrowser } from './gitlab/gitlab_platform_browser';
import { GitLabCodeCompletionProvider } from './completion/gitlab_code_completion_provider';
import { contextUtils } from './utils/context_utils';

export const activate = async (context: vscode.ExtensionContext) => {
  const outputChannel = vscode.window.createOutputChannel('GitLab Workflow');
  initializeLogging(line => outputChannel.appendLine(line));
  contextUtils.init(context);
  const platformManager = await createGitLabPlatformManagerBrowser();
  GitLabCodeCompletionProvider.registerGitLabCodeCompletion(context, platformManager);
};
