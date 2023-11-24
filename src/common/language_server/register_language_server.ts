import vscode from 'vscode';
import { SUGGESTION_ACCEPTED_COMMAND } from '@gitlab-org/gitlab-lsp';
import { LanguageClientOptions } from 'vscode-languageclient';
import { AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES } from '../code_suggestions/constants';
import { LanguageClientFactory } from './client_factory';
import { getClientContext } from './get_client_context';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { CONFIG_NAMESPACE } from '../constants';
import { LanguageClientWrapper } from './language_client_wrapper';
import { CodeSuggestionsStateManager } from '../code_suggestions/code_suggestions_state_manager';
import { CodeSuggestionsStatusBarItem } from '../code_suggestions/code_suggestions_status_bar_item';
import { LanguageClientMiddleware } from './language_client_middleware';
import {
  COMMAND_TOGGLE_CODE_SUGGESTIONS,
  toggleCodeSuggestions,
} from '../code_suggestions/commands/toggle';

const LANGUAGE_CLIENT_OPTIONS: LanguageClientOptions = {
  documentSelector: AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES.map(language => ({ language })),
};

export const registerLanguageServer = async (
  context: vscode.ExtensionContext,
  clientFactory: LanguageClientFactory,
  gitlabPlatformManager: GitLabPlatformManager,
) => {
  const stateManager = new CodeSuggestionsStateManager();
  const statusBarItem = new CodeSuggestionsStatusBarItem(stateManager);
  const client = clientFactory.createLanguageClient(context, {
    ...LANGUAGE_CLIENT_OPTIONS,
    initializationOptions: getClientContext(),
    middleware: new LanguageClientMiddleware(stateManager),
  });
  const wrapper = new LanguageClientWrapper(client, gitlabPlatformManager, stateManager);
  await wrapper.initAndStart();
  context.subscriptions.push(
    wrapper,
    vscode.commands.registerCommand(
      SUGGESTION_ACCEPTED_COMMAND,
      wrapper.sendSuggestionAcceptedEvent,
    ),
    vscode.commands.registerCommand(COMMAND_TOGGLE_CODE_SUGGESTIONS, () =>
      toggleCodeSuggestions({ stateManager }),
    ),
    vscode.workspace.onDidChangeConfiguration(async e => {
      if (e.affectsConfiguration(CONFIG_NAMESPACE)) {
        return;
      }

      await wrapper.syncConfig();
    }),
    gitlabPlatformManager.onAccountChange(wrapper.syncConfig),
    statusBarItem,
  );
};
