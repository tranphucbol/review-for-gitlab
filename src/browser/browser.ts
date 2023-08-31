import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/browser';
import { initializeLogging } from '../common/log';
import { createGitLabPlatformManagerBrowser } from './gitlab_platform_browser';
import { activateCommon } from '../common/main';
import { setupTelemetry } from './setup_telemetry_browser';
import {
  LANGUAGE_SERVER_ID,
  LANGUAGE_SERVER_NAME,
  LANGUAGE_CLIENT_OPTIONS,
  registerLanguageServer,
} from '../common/language_server';
import { createCodeSuggestionStatusBar } from '../common/code_suggestions/code_suggestions_status_bar_item';
import { getExtensionConfiguration } from '../common/utils/extension_configuration';
import { CodeSuggestions } from '../common/code_suggestions/code_suggestions';

export const activate = async (context: vscode.ExtensionContext) => {
  setupTelemetry();

  const outputChannel = vscode.window.createOutputChannel('GitLab Workflow');
  initializeLogging(line => outputChannel.appendLine(line));

  // browser always has account linked and repo opened.
  await vscode.commands.executeCommand('setContext', 'gitlab:noAccount', false);
  await vscode.commands.executeCommand('setContext', 'gitlab:validState', true);

  const platformManager = await createGitLabPlatformManagerBrowser();
  await activateCommon(context, platformManager, outputChannel);

  if (getExtensionConfiguration().languageServer) {
    startLanguageServer(context);
  } else {
    context.subscriptions.push(new CodeSuggestions(platformManager));
  }
};

function startLanguageServer(context: vscode.ExtensionContext) {
  const module = vscode.Uri.joinPath(
    context.extensionUri,
    './assets/language-server/browser/main.js',
  );
  const worker = new Worker(module.toString(true));

  const client = new LanguageClient(
    LANGUAGE_SERVER_ID,
    LANGUAGE_SERVER_NAME,
    LANGUAGE_CLIENT_OPTIONS,
    worker,
  );

  // TODO: can we get an AccountService instance here?
  registerLanguageServer(context, client, createCodeSuggestionStatusBar());
}
