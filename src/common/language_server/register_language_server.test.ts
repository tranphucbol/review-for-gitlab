import vscode from 'vscode';
import { BaseLanguageClient } from 'vscode-languageclient';
import { SUGGESTION_ACCEPTED_COMMAND } from '@gitlab-org/gitlab-lsp';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { createFakePartial } from '../test_utils/create_fake_partial';
import { LanguageClientFactory } from './client_factory';
import { registerLanguageServer } from './register_language_server';
import { createExtensionContext } from '../test_utils/entities';
import { LanguageClientWrapper } from './language_client_wrapper';
import { createConfigurationChangeTrigger } from '../test_utils/vscode_fakes';
import { COMMAND_TOGGLE_CODE_SUGGESTIONS } from '../code_suggestions/commands/toggle';
import { CodeSuggestionsStateManager } from '../code_suggestions/code_suggestions_state_manager';
import { CodeSuggestionsGutterIcon } from '../code_suggestions/code_suggestions_gutter_icon';

jest.mock('../code_suggestions/code_suggestions_gutter_icon');
jest.mock('../code_suggestions/code_suggestions_status_bar_item');
jest.mock('../code_suggestions/code_suggestions_state_manager');
jest.mock('./language_client_wrapper');

describe('registerLanguageServer', () => {
  let triggerConfigChange: () => void;
  let clientWrapper: LanguageClientWrapper;
  let client: BaseLanguageClient;
  let languageClientFactory: LanguageClientFactory;
  let gitlabPlatformManager: GitLabPlatformManager;
  let stateManager: CodeSuggestionsStateManager;
  let context: vscode.ExtensionContext;

  beforeEach(async () => {
    triggerConfigChange = createConfigurationChangeTrigger();
    clientWrapper = createFakePartial<LanguageClientWrapper>({
      initAndStart: jest.fn(),
      sendSuggestionAcceptedEvent: jest.fn(),
      syncConfig: jest.fn(),
    });
    jest.mocked(LanguageClientWrapper).mockReturnValue(clientWrapper);
    client = createFakePartial<BaseLanguageClient>({});
    languageClientFactory = createFakePartial<LanguageClientFactory>({
      createLanguageClient: jest.fn(() => client),
    });
    gitlabPlatformManager = createFakePartial<GitLabPlatformManager>({
      onAccountChange: jest.fn(),
    });
    stateManager = createFakePartial<CodeSuggestionsStateManager>({
      init: jest.fn(),
      onDidChangeVisibleState: jest.fn(),
    });
    context = createExtensionContext();
    jest.mocked(CodeSuggestionsStateManager).mockReturnValue(stateManager);
    await registerLanguageServer(context, languageClientFactory, gitlabPlatformManager);
  });

  it('creates a language client and provides a baseAssetsUrl', () => {
    expect(languageClientFactory.createLanguageClient).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        initializationOptions: expect.objectContaining({
          baseAssetsUrl: 'https://localhost/assets/language-server/',
        }),
      }),
    );
  });

  it('initializes the language client wrapper', async () => {
    expect(clientWrapper.initAndStart).toHaveBeenCalled();
  });

  it('initializes state manager', async () => {
    expect(stateManager.init).toHaveBeenCalled();
  });

  it('registers suggestion accepted command', () => {
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      SUGGESTION_ACCEPTED_COMMAND,
      clientWrapper.sendSuggestionAcceptedEvent,
    );
  });

  it('registers the command to toggle code sugegestions on/off', () => {
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      COMMAND_TOGGLE_CODE_SUGGESTIONS,
      expect.any(Function),
    );
  });

  it('registers configuration change listener', () => {
    triggerConfigChange();
    expect(clientWrapper.syncConfig).toHaveBeenCalled();
  });

  it('registers on account change listener', () => {
    expect(gitlabPlatformManager.onAccountChange).toHaveBeenCalledWith(clientWrapper.syncConfig);
  });

  it('creates CodeSuggestionsGutterIcon', () => {
    expect(CodeSuggestionsGutterIcon).toHaveBeenCalledTimes(1);
    expect(CodeSuggestionsGutterIcon).toHaveBeenCalledWith(context, stateManager);
  });
});
