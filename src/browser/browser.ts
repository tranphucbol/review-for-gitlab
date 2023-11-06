import * as vscode from 'vscode';
import { initializeLogging } from '../common/log';
import { createGitLabPlatformManagerBrowser } from './gitlab_platform_browser';
import { activateCommon } from '../common/main';
import * as featureFlags from '../common/feature_flags';
import { setupTelemetry } from './setup_telemetry_browser';
import { registerLanguageServer } from '../common/language_server';
import { createCodeSuggestionStatusBar } from '../common/code_suggestions/code_suggestions_status_bar_item';
import { CodeSuggestions } from '../common/code_suggestions/code_suggestions';
import { browserLanguageClientFactory } from './language_server/browser_language_client_factory';

export const activate = async (context: vscode.ExtensionContext) => {
  setupTelemetry();

  const outputChannel = vscode.window.createOutputChannel('GitLab Workflow');
  initializeLogging(line => outputChannel.appendLine(line));

  // browser always has account linked and repo opened.
  await vscode.commands.executeCommand('setContext', 'gitlab:noAccount', false);
  await vscode.commands.executeCommand('setContext', 'gitlab:validState', true);

  const platformManager = await createGitLabPlatformManagerBrowser();
  await activateCommon(context, platformManager, outputChannel);

  if (featureFlags.isEnabled(featureFlags.FeatureFlag.LanguageServer)) {
    registerLanguageServer(context, browserLanguageClientFactory, createCodeSuggestionStatusBar());
  } else {
    context.subscriptions.push(new CodeSuggestions(platformManager));
  }
};
