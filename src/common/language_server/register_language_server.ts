import vscode from 'vscode';
import { SUGGESTION_ACCEPTED_COMMAND } from '@gitlab-org/gitlab-lsp';
import { LanguageClientOptions } from 'vscode-languageclient';
import { AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES } from '../code_suggestions/constants';
import { LanguageClientFactory } from './client_factory';
import { getClientContext } from './get_client_context';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { CONFIG_NAMESPACE } from '../constants';
import { LanguageClientWrapper } from './language_client_wrapper';

const LANGUAGE_CLIENT_OPTIONS: LanguageClientOptions = {
  documentSelector: AI_ASSISTED_CODE_SUGGESTIONS_LANGUAGES.map(language => ({ language })),
};

export const registerLanguageServer = async (
  context: vscode.ExtensionContext,
  clientFactory: LanguageClientFactory,
  gitlabPlatformManager: GitLabPlatformManager,
) => {
  const client = clientFactory.createLanguageClient(context, {
    ...LANGUAGE_CLIENT_OPTIONS,
    initializationOptions: getClientContext(),
  });
  const wrapper = new LanguageClientWrapper(client, gitlabPlatformManager);
  await wrapper.initAndStart();
  context.subscriptions.push(
    wrapper,
    vscode.commands.registerCommand(
      SUGGESTION_ACCEPTED_COMMAND,
      wrapper.sendSuggestionAcceptedEvent,
    ),
    vscode.workspace.onDidChangeConfiguration(async e => {
      if (e.affectsConfiguration(CONFIG_NAMESPACE)) {
        return;
      }

      await wrapper.syncConfig();
    }),
    gitlabPlatformManager.onAccountChange(wrapper.syncConfig),
  );
};
