import * as vscode from 'vscode';
import * as path from 'path';
import fetch from '../gitlab/fetch_logged';
import { log } from '../log';
import {
  AI_ASSISTED_CODE_SUGGESTIONS_API_URL,
  AI_ASSISTED_CODE_SUGGESTIONS_LINES_BELOW_CURSOR,
} from '../constants';
import {
  getAiAssistedCodeSuggestionsConfiguration,
  AI_ASSISTED_CODE_SUGGESTIONS_MODE,
  AI_ASSISTED_CODE_SUGGESTIONS_CONFIG,
} from '../utils/extension_configuration';
import { getActiveProject } from '../commands/run_with_valid_project';
import { GitLabPlatform } from '../gitlab/gitlab_platform';
import { CodeCompletionTokenManager } from './token_manager';

interface Choice {
  text: string;
  index: number;
  finish_reason: string;
}

interface CodeSuggestionResponse {
  id: string;
  model: string;
  object: string;
  created: number;
  choices: Choice[];
  usage: null;
}

interface CurrentFile {
  content_above_cursor: string;
  content_below_cursor: string;
  file_name: string;
}
interface CodeSuggestionPrompt {
  current_file: CurrentFile;
  prompt_version: number;
  project_id: number | unknown;
  project_path: string;
}

export class GitLabCodeCompletionProvider implements vscode.InlineCompletionItemProvider {
  private model: string;

  private server: string;

  private debouncedCall: any;

  private debounceTimeMs = 500;

  private noDebounce: boolean;

  private tokenManager: CodeCompletionTokenManager;

  constructor(platform: GitLabPlatform, noDebounce = false) {
    this.model = 'gitlab';
    this.server = GitLabCodeCompletionProvider.#getServer();
    this.debouncedCall = undefined;
    this.noDebounce = noDebounce;
    this.tokenManager = new CodeCompletionTokenManager(platform);
  }

  static registerGitLabCodeCompletion(context: vscode.ExtensionContext, platform: GitLabPlatform) {
    let subscription: vscode.Disposable | undefined;
    const dispose = () => subscription?.dispose();
    context.subscriptions.push({ dispose });

    const register = () => {
      subscription = vscode.languages.registerInlineCompletionItemProvider(
        { pattern: '**' },
        new GitLabCodeCompletionProvider(platform),
      );
    };
    if (getAiAssistedCodeSuggestionsConfiguration().enabled) {
      register();
    }

    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(AI_ASSISTED_CODE_SUGGESTIONS_MODE)) {
        if (!getAiAssistedCodeSuggestionsConfiguration().enabled) {
          log.debug('Disabling code completion');
          dispose();
        } else {
          log.debug('Enabling code completion');
          register();
        }
      } else if (e.affectsConfiguration(AI_ASSISTED_CODE_SUGGESTIONS_CONFIG)) {
        dispose();
        register();
      }
    });
  }

  static #getServer(): string {
    const serverUrl = new URL(AI_ASSISTED_CODE_SUGGESTIONS_API_URL);
    log.debug(`AI Assist: Using server: ${serverUrl.href}`);
    return serverUrl.href;
  }

  static #getPrompt(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): CodeSuggestionPrompt {
    const contentAboveCursor = document.getText(
      new vscode.Range(0, 0, position.line, position.character),
    );

    const linesBelowCursor = AI_ASSISTED_CODE_SUGGESTIONS_LINES_BELOW_CURSOR;
    const contentBelowCursor = document.getText(
      new vscode.Range(position.line, position.character, position.line + linesBelowCursor, 0),
    );

    const projectPath = getActiveProject()?.project.namespaceWithPath || '';
    const projectId = getActiveProject()?.project.restId || -1;
    const fileName = path.basename(document.fileName) || '';

    const payload = {
      prompt_version: 1,
      project_path: projectPath,
      project_id: projectId,
      current_file: {
        file_name: fileName,
        content_above_cursor: contentAboveCursor,
        content_below_cursor: contentBelowCursor,
      },
    };

    return payload;
  }

  async getCompletions(document: vscode.TextDocument, position: vscode.Position) {
    const prompt: CodeSuggestionPrompt = GitLabCodeCompletionProvider.#getPrompt(
      document,
      position,
    );

    // TODO: Sanitize prompt to prevent exposing sensitive information
    // Issue https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/692
    if (!prompt) {
      log.debug('AI Assist: Prompt is empty, probably due to first line');
      return [] as vscode.InlineCompletionItem[];
    }

    const token = await this.tokenManager.getToken();
    if (!token) {
      log.error('AI Assist: Could not fetch token');
      return [] as vscode.InlineCompletionItem[];
    }

    const requestConfig = {
      method: 'POST',
      headers: {
        'X-Gitlab-Authentication-Type': 'oidc',
        Authorization: `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(prompt),
    };

    const fetchResponse = await fetch(this.server, requestConfig);
    const response: CodeSuggestionResponse = await fetchResponse.json();

    return (
      response.choices
        ?.map(choice => choice.text)
        .map(
          choiceText =>
            new vscode.InlineCompletionItem(
              choiceText as string,
              new vscode.Range(position, position),
            ),
        ) || []
    );
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
  ): Promise<vscode.InlineCompletionItem[]> {
    clearTimeout(this.debouncedCall);

    return new Promise(resolve => {
      //  In case of a hover, this will be triggered which is not desired as it calls for a new prediction
      if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
        if (this.noDebounce) {
          resolve(this.getCompletions(document, position));
        } else {
          this.debouncedCall = setTimeout(() => {
            resolve(this.getCompletions(document, position));
          }, this.debounceTimeMs);
        }
      }
    });
  }
}
