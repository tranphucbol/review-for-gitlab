import * as vscode from 'vscode';
import fetch from '../gitlab/fetch_logged';
import { log } from '../log';
import {
  AI_ASSISTED_CODE_SUGGESTIONS_API_URL,
  AI_ASSISTED_CODE_SUGGESTIONS_LINES_BELOW_CURSOR,
} from '../constants';
import { GitLabPlatform, GitLabPlatformManager } from '../gitlab/gitlab_platform';
import { CodeSuggestionsTokenManager, CompletionToken } from './code_suggestions_token_manager';
import { getUserAgentHeader } from '../gitlab/http/get_user_agent_header';
import { CircuitBreaker } from './circuit_breaker';
import { PROGRAMMATIC_COMMANDS } from '../command_names';
import {
  TELEMETRY_HEADER_ACCEPTS,
  TELEMETRY_HEADER_ERRORS,
  TELEMETRY_HEADER_REQUESTS,
  codeSuggestionsTelemetry,
} from './code_suggestions_telemetry';

export const CIRCUIT_BREAK_INTERVAL_MS = 10000;
export const MAX_ERRORS_BEFORE_CIRCUIT_BREAK = 4;

interface Choice {
  text: string;
  index: number;
  finish_reason: string;
}

interface CodeSuggestionsResponse {
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

export class CodeSuggestionsProvider implements vscode.InlineCompletionItemProvider {
  private server: string;

  private debouncedCall?: NodeJS.Timeout;

  private debounceTimeMs = 500;

  private noDebounce: boolean;

  private tokenManager: CodeSuggestionsTokenManager;

  private manager: GitLabPlatformManager;

  private circuitBreaker = new CircuitBreaker(
    MAX_ERRORS_BEFORE_CIRCUIT_BREAK,
    CIRCUIT_BREAK_INTERVAL_MS,
  );

  constructor(manager: GitLabPlatformManager, noDebounce = false) {
    this.server = CodeSuggestionsProvider.#getServer();
    this.debouncedCall = undefined;
    this.noDebounce = noDebounce;
    this.tokenManager = new CodeSuggestionsTokenManager(manager);
    this.manager = manager;
  }

  static #getServer(): string {
    const serverUrl = new URL(AI_ASSISTED_CODE_SUGGESTIONS_API_URL);
    log.debug(`AI Assist: Using server: ${serverUrl.href}`);
    return serverUrl.href;
  }

  // TODO: Sanitize prompt to prevent exposing sensitive information
  // Issue https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/692
  static #getPrompt(
    document: vscode.TextDocument,
    position: vscode.Position,
    platform: GitLabPlatform,
  ): CodeSuggestionPrompt {
    const contentAboveCursor = document.getText(
      new vscode.Range(0, 0, position.line, position.character),
    );

    const linesBelowCursor = AI_ASSISTED_CODE_SUGGESTIONS_LINES_BELOW_CURSOR;
    const contentBelowCursor = document.getText(
      new vscode.Range(position.line, position.character, position.line + linesBelowCursor, 0),
    );

    const { namespaceWithPath, restId } = platform.project;
    const fileName = document.uri.path.split('/').pop() || '';

    const payload = {
      prompt_version: 1,
      project_path: namespaceWithPath,
      project_id: restId,
      current_file: {
        file_name: fileName,
        content_above_cursor: contentAboveCursor,
        content_below_cursor: contentBelowCursor,
      },
    };

    return payload;
  }

  async getCompletions(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.InlineCompletionItem[]> {
    if (this.circuitBreaker.isBreaking()) {
      return [];
    }

    const platform = await this.manager.getForActiveProject(false);
    if (!platform) {
      log.warn(
        'AI Assist: could not obtain suggestions, there is no active project. Open GitLab project to continue',
      );
      return [];
    }
    const prompt = CodeSuggestionsProvider.#getPrompt(document, position, platform);

    // FIXME: when we start supporting SM, we need to get the token from the **platform**, now the project might not match the token
    // Also, passing the project to the API might get deprecated: https://gitlab.com/gitlab-org/modelops/applied-ml/code-suggestions/ai-assist/-/merge_requests/143#note_1419849871
    const token = await this.tokenManager.getToken();
    if (!token) {
      log.error('AI Assist: Could not fetch token');
      return [];
    }

    log.debug(`AI Assist: fetching completions ...`);

    let response: CodeSuggestionsResponse;

    try {
      response = await this.fetchCompletions(token, prompt);
      this.circuitBreaker.success();

      // The previous counts were successfully sent...
      codeSuggestionsTelemetry.resetCounts();
    } catch (e) {
      log.error(`AI Assist: Error fetching completions: ${e.toString()}`);
      this.circuitBreaker.error();
      codeSuggestionsTelemetry.incErrorCount();
      return [];
    } finally {
      // Keep track of this request for next send..
      codeSuggestionsTelemetry.incRequestCount();
    }

    const choices = response.choices || [];

    log.debug(`AI Assist: got ${choices.length} completions`);

    // This command will be called when a suggestion is accepted
    const acceptedCommand: vscode.Command = {
      title: 'Code Suggestion Accepted',
      command: PROGRAMMATIC_COMMANDS.CODE_SUGGESTION_ACCEPTED,
      arguments: [],
    };

    return choices.map(
      choice =>
        new vscode.InlineCompletionItem(
          choice.text,
          new vscode.Range(position, position),
          acceptedCommand,
        ),
    );
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
  ): Promise<vscode.InlineCompletionItem[]> {
    if (this.debouncedCall !== undefined) {
      clearTimeout(this.debouncedCall);
    }

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

  async fetchCompletions(
    token: CompletionToken,
    prompt: CodeSuggestionPrompt,
  ): Promise<CodeSuggestionsResponse> {
    const telemetryString = `requests:${codeSuggestionsTelemetry.requestCount}/errors:${codeSuggestionsTelemetry.errorCount}/accepts:${codeSuggestionsTelemetry.acceptCount}`;
    log.debug(`AI Assist: fetching completions... (telemetry: ${telemetryString})`);

    const requestOptions = {
      method: 'POST',
      headers: {
        ...getUserAgentHeader(),
        'X-Gitlab-Authentication-Type': 'oidc',
        Authorization: `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
        [TELEMETRY_HEADER_REQUESTS]: codeSuggestionsTelemetry.requestCount.toString(),
        [TELEMETRY_HEADER_ERRORS]: codeSuggestionsTelemetry.errorCount.toString(),
        [TELEMETRY_HEADER_ACCEPTS]: codeSuggestionsTelemetry.acceptCount.toString(),
      },
      body: JSON.stringify(prompt),
    };

    const response = await fetch(this.server, requestOptions);

    await this.handleErrorReponse(response);

    const data = await response.json();
    return data;
  }

  private async handleErrorReponse(response: Response) {
    if (!response.ok) {
      const body = await response.text().catch(() => undefined);
      throw new Error(
        `Fetching code suggestions from ${response.url} failed for server ${this.server}. Body: ${body}`,
      );
    }
  }
}
