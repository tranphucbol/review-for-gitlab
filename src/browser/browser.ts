import * as vscode from 'vscode';
import { initializeLogging } from '../common/log';
import { activateCommon } from '../common/main';
import * as featureFlags from '../common/feature_flags';
import { registerLanguageServer } from '../common/language_server/register_language_server';
import { CodeSuggestions } from '../common/code_suggestions/code_suggestions';
import { browserLanguageClientFactory } from './language_server/browser_language_client_factory';
import { createDependencyContainer } from './dependency_container_browser';

export const activate = async (context: vscode.ExtensionContext) => {
  const outputChannel = vscode.window.createOutputChannel('GitLab Workflow');
  const dependencyContainer = await createDependencyContainer();
  initializeLogging(line => outputChannel.appendLine(line));

  // browser always has account linked and repo opened.
  await vscode.commands.executeCommand('setContext', 'gitlab:noAccount', false);
  await vscode.commands.executeCommand('setContext', 'gitlab:validState', true);

  await activateCommon(context, dependencyContainer, outputChannel);

  if (featureFlags.isEnabled(featureFlags.FeatureFlag.LanguageServerWebIDE)) {
    await registerLanguageServer(
      context,
      browserLanguageClientFactory,
      dependencyContainer.gitLabPlatformManager,
    );
  } else {
    const codeSuggestions = new CodeSuggestions(context, dependencyContainer.gitLabPlatformManager);
    await codeSuggestions.init();
    context.subscriptions.push(codeSuggestions);
  }
};
