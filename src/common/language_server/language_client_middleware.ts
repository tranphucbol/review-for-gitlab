import vscode from 'vscode';
import { BaseLanguageClient, Middleware } from 'vscode-languageclient';
import { START_STREAMING_COMMAND } from '@gitlab-org/gitlab-lsp';
import { CodeSuggestionsStateManager } from '../code_suggestions/code_suggestions_state_manager';
import { waitForCancellationToken } from '../utils/wait_for_cancellation_token';
import { waitForMs } from '../utils/wait_for_ms';
import { log } from '../log';
import { COMMAND_CODE_SUGGESTION_STREAM_ACCEPTED } from '../code_suggestions/commands/code_suggestion_stream_accepted';
import { CompletionStream, getStreamContextId } from './completion_stream';
import { serializeInlineCompletionContext } from './serialization_utils';
import { isInlineCompletionList } from '../utils/code_suggestions';

// We need to wait just a bit after cancellation, otherwise the loading icon flickers while someone types
const CANCELLATION_DELAY = 150;

export class LanguageClientMiddleware implements Middleware {
  #stateManager: CodeSuggestionsStateManager;

  #subscriptions: vscode.Disposable[] = [];

  #client?: BaseLanguageClient;

  #activeStreams: Record<string, CompletionStream> = {};

  constructor(stateManager: CodeSuggestionsStateManager) {
    this.#stateManager = stateManager;
  }

  dispose() {
    this.#subscriptions.forEach(s => s.dispose());
  }

  set client(client: BaseLanguageClient) {
    this.#client = client;
  }

  // we disable standard completion from LS and only use inline completion
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

    const activeStream = this.#getStreamAt(document, position);
    if (activeStream) {
      return this.#provideStreamingInlineCompletionItems(document, position, token, activeStream);
    }

    try {
      this.#stateManager.setLoading(true);
      this.#cancelAllStreams();

      // Short circuit after both cancellation and time have passed
      const shortCircuit = waitForCancellationToken(token)
        .then(() => waitForMs(CANCELLATION_DELAY))
        .then(() => []);

      const response = await Promise.race([
        shortCircuit,
        next(document, position, serializeInlineCompletionContext(context), token),
      ]);

      if (isInlineCompletionList(response)) {
        const command = response.items?.[0]?.command?.command;
        if (command === START_STREAMING_COMMAND) {
          const streamId = response.items?.[0]?.command?.arguments?.[0];

          await this.#listenToIncomingStream(document, position, streamId);
          return [];
        }
      }

      return response;
    } catch (e) {
      log.error(e);
      return [];
    } finally {
      this.#stateManager.setLoading(false);
    }
  }

  async #listenToIncomingStream(
    document: vscode.TextDocument,
    position: vscode.Position,
    streamId: string,
  ) {
    if (!this.#client) {
      log.error(
        'Invoking LanguageServer client without initializing the inline completion middleware',
      );
      return;
    }

    const stream = new CompletionStream(this.#client, document, position, streamId);

    try {
      this.#stateManager.setLoadingResource(stream, true);
    } catch (e) {
      this.#stateManager.setLoadingResource(stream, false);
      throw e;
    }

    this.#saveStreamAt(document, position, stream);

    LanguageClientMiddleware.forceTriggerInlineCompletion().catch(e => log.error(e));
  }

  async #provideStreamingInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    stream: CompletionStream,
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | undefined> {
    if (!this.#client) {
      log.error(
        'Invoking LanguageServer client without initializing the inline completion middleware',
      );
      return [];
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
}
