import * as vscode from 'vscode';
import * as path from 'path';
import crossFetch from 'cross-fetch';
import { log } from '../log';
import {
  AI_ASSISTED_CODE_SUGGESTIONS_API_URL,
  AI_ASSISTED_CODE_SUGGESTIONS_LINES_BELOW_CURSOR,
} from '../constants';
import {
  getAiAssistedCodeSuggestionsConfiguration,
  AiAssistedCodeSuggestionsConfiguration,
  AI_ASSISTED_CODE_SUGGESTIONS_MODE,
  AI_ASSISTED_CODE_SUGGESTIONS_CONFIG,
} from '../utils/extension_configuration';
import { getActiveProject } from '../commands/run_with_valid_project';
import { tokenExchangeService } from '../gitlab/token_exchange_service';
import { getUserAgentHeader } from '../gitlab/http/get_user_agent_header';

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
  model: string;

  server: string;

  debouncedCall: any;

  debounceTime = 500; // milliseconds

  manualTrigger: boolean;

  constructor(
    configuration: AiAssistedCodeSuggestionsConfiguration = getAiAssistedCodeSuggestionsConfiguration(),
  ) {
    this.model = 'gitlab';
    this.server = GitLabCodeCompletionProvider.#getServer();
    this.debouncedCall = undefined;
    this.manualTrigger = configuration.manualTrigger;
  }

  static registerGitLabCodeCompletion(context: vscode.ExtensionContext) {
    let subscription: vscode.Disposable | undefined;
    const dispose = () => subscription?.dispose();
    context.subscriptions.push({ dispose });

    const register = () => {
      subscription = vscode.languages.registerInlineCompletionItemProvider(
        { pattern: '**' },
        new GitLabCodeCompletionProvider(),
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

  static async #getGitLabApiKey(): Promise<string | undefined> {
    const activeProject = getActiveProject();
    if (!activeProject) {
      log.debug(
        `AI Assist: Unable to get active project, ensure GitLab extension is properly configured`,
      );
      return undefined;
    }
    const account = await tokenExchangeService.refreshIfNeeded(activeProject.account.id);
    return account.token;
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

    const gitlabApiKey = await GitLabCodeCompletionProvider.#getGitLabApiKey();

    const requestHeaders = {
      ...getUserAgentHeader(),
      Authorization: `Bearer ${gitlabApiKey}`,
      'Content-Type': 'application/json',
    };

    const requestConfig = {
      method: `POST`,
      headers: requestHeaders,
      body: JSON.stringify(prompt),
    };

    const fetchResponse = await crossFetch(this.server, requestConfig);
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
      if (
        context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic ||
        this.manualTrigger
      ) {
        this.debouncedCall = setTimeout(async () => {
          resolve(this.getCompletions(document, position));
        }, this.debounceTime);
      }
    });
  }
}
