import vscode from 'vscode';
import { BaseLanguageClient, Middleware } from 'vscode-languageclient';
import { Intent, ICompletionIntentResponse, CompletionIntentRequest } from '@gitlab-org/gitlab-lsp';
import { CodeSuggestionsStateManager } from '../code_suggestions/code_suggestions_state_manager';
import { waitForCancellationToken } from '../utils/wait_for_cancellation_token';
import { waitForMs } from '../utils/wait_for_ms';
import { log } from '../log';
import { COMMAND_CODE_SUGGESTION_STREAM_ACCEPTED } from '../code_suggestions/commands/code_suggestion_stream_accepted';
import { CompletionStream, getStreamContextId } from './completion_stream';
import { FeatureFlag, isEnabled } from '../feature_flags';
import { CONFIG_NAMESPACE } from '../constants';
import { serializeInlineCompletionContext, serializePosition } from './serialization_utils';

// We need to wait just a bit after cancellation, otherwise the loading icon flickers while someone types
const CANCELLATION_DELAY = 150;

export class LanguageClientMiddleware implements Middleware {
  #stateManager: CodeSuggestionsStateManager;

  #subscriptions: vscode.Disposable[] = [];

  #hasStreamingEnabled: boolean | undefined;

  #client?: BaseLanguageClient;

  #activeStreams: Record<string, CompletionStream> = {};

  constructor(stateManager: CodeSuggestionsStateManager) {
    this.#stateManager = stateManager;
    this.#hasStreamingEnabled = isEnabled(FeatureFlag.StreamCodeGenerations);
    this.#subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(CONFIG_NAMESPACE)) {
          this.#hasStreamingEnabled = isEnabled(FeatureFlag.StreamCodeGenerations);
        }
      }),
    );
  }

  dispose() {
    this.#subscriptions.forEach(s => s.dispose());
  }

  set client(client: BaseLanguageClient) {
    this.#client = client;
  }

  // we disable standard completion form LS and only use inline completion
  // eslint-disable-next-line class-methods-use-this
  provideCompletionItem = () => [];

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
    next: (
      document: vscode.TextDocument,
      position: vscode.Position,
      context: vscode.InlineCompletionContext,
      token: vscode.CancellationToken,
    ) => vscode.ProviderResult<vscode.InlineCompletionItem[] | vscode.InlineCompletionList>,
  ) {
    if (!this.#stateManager.isActive()) {
      return [];
    }

    const shouldStream = await this.#shouldStream(document, position);

    if (!shouldStream) {
      if (this.#hasStreamingEnabled) {
        this.#cancelAllStreams();
      }

      return this.#provideDefaultInlineCompletionItems(document, position, context, token, next);
    }

    try {
      return await this.#provideStreamingInlineCompletionItems(document, position, token);
    } catch (e) {
      log.error(e);
      return [];
    }
  }

  async #provideDefaultInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
    next: (
      document: vscode.TextDocument,
      position: vscode.Position,
      context: vscode.InlineCompletionContext,
      token: vscode.CancellationToken,
    ) => vscode.ProviderResult<vscode.InlineCompletionItem[] | vscode.InlineCompletionList>,
  ) {
    this.#stateManager.setLoading(true);

    // Short circuit after both cancellation and time have passed
    const shortCircuit = waitForCancellationToken(token)
      .then(() => waitForMs(CANCELLATION_DELAY))
      .then(() => []);

    try {
      return await Promise.race([
        shortCircuit,
        next(document, position, serializeInlineCompletionContext(context), token),
      ]);
    } finally {
      this.#stateManager.setLoading(false);
    }
  }

  async #provideStreamingInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | undefined> {
    if (!this.#client) {
      log.error(
        'Invoking LanguageServer client without initializing the inline completion middleware',
      );
      return [];
    }

    let stream = this.#getStreamAt(document, position);

    if (!stream) {
      stream = new CompletionStream(this.#client, document, position);

      // Add new loading state __before__ canceling old streams so that icon doesn't flicker
      this.#stateManager.setLoadingResource(stream, true);
      this.#cancelAllStreams();

      try {
        await stream.start();
      } catch (e) {
        this.#stateManager.setLoadingResource(stream, false);
        throw e;
      }

      this.#saveStreamAt(document, position, stream);
    }

    if (token.isCancellationRequested) {
      stream.cancel();
    }

    token.onCancellationRequested(() => stream!.cancel());

    const streamResult = await stream.iterator.next();
    log.debug(`streamResult.done = ${streamResult.done}`);

    const acceptedCommand: vscode.Command = {
      title: 'Code Suggestion Stream Accepted',
      command: COMMAND_CODE_SUGGESTION_STREAM_ACCEPTED,
      arguments: [stream],
    };
    const { completion } = streamResult.value;

    if (streamResult.done) {
      if (streamResult.value.canceled) {
        await waitForMs(CANCELLATION_DELAY);
      }

      this.#stateManager.setLoadingResource(stream, false);
      this.#deleteStreamAt(document, position);
    } else {
      setTimeout(() => {
        LanguageClientMiddleware.forceTriggerInlineCompletion().catch(e => log.error(e));
      }, 0);
    }

    return [
      new vscode.InlineCompletionItem(
        completion,
        new vscode.Range(position, position),
        acceptedCommand,
      ),
    ];
  }

  static async forceTriggerInlineCompletion(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const { document } = editor;
    const activePosition = editor.selection.active;
    const activeOffset = document.offsetAt(activePosition);

    if (activeOffset === 0) {
      return;
    }

    const prevCharPosition = document.positionAt(activeOffset - 1);
    const replaceRange = new vscode.Range(prevCharPosition, activePosition);
    const value = document.getText(replaceRange);

    await editor.edit(edit => edit.replace(replaceRange, value));
    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
  }

  #getStreamAt(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): CompletionStream | undefined {
    return this.#activeStreams[getStreamContextId(document, position)];
  }

  #saveStreamAt(
    document: vscode.TextDocument,
    position: vscode.Position,
    stream: CompletionStream,
  ): void {
    this.#activeStreams[getStreamContextId(document, position)] = stream;
  }

  #deleteStreamAt(document: vscode.TextDocument, position: vscode.Position): void {
    delete this.#activeStreams[getStreamContextId(document, position)];
  }

  #cancelAllStreams(): void {
    Object.entries(this.#activeStreams).forEach(([contextId, oldStream]) => {
      oldStream.cancel();
      this.#stateManager.setLoadingResource(oldStream, false);
      delete this.#activeStreams[contextId];
    });
  }

  async #shouldStream(document: vscode.TextDocument, position: vscode.Position): Promise<boolean> {
    if (!this.#hasStreamingEnabled) {
      return false;
    }
    if (this.#getStreamAt(document, position)) {
      return true;
    }

    const intent = await this.#getIntent(document, position);
    return intent === 'generation';
  }

  async #getIntent(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<Intent | undefined> {
    let intentTypeResponse: ICompletionIntentResponse | undefined;

    try {
      intentTypeResponse = await this.#client?.sendRequest(CompletionIntentRequest, {
        documentUri: document.uri.toString(),
        position: serializePosition(position),
      });
    } catch (error) {
      log.warn(`Failed to detect completion intent`, error);
    }

    log.debug(`INTENT: ${intentTypeResponse?.intent}`);
    return intentTypeResponse?.intent;
  }
}
