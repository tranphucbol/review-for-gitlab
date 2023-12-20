import vscode from 'vscode';
import { uniqueId } from 'lodash';
import {
  BaseLanguageClient,
  InlineCompletionTriggerKind,
  Position,
  TextDocumentIdentifier,
} from 'vscode-languageclient';
import { STREAMING_COMPLETION_REQUEST_NOTIFICATION } from '@gitlab-org/gitlab-lsp';
import { createStreamIterator } from './create_stream_iterator';
import { log } from '../log';

/** identifies the document and position for this stream */
export const getStreamContextId = (document: vscode.TextDocument, position: vscode.Position) =>
  `${document.uri.toString()}|${position.line}|${position.character}`;

export class CompletionStream {
  #client: BaseLanguageClient;

  #id: string;

  #cancellationTokenSource: vscode.CancellationTokenSource;

  #textDocument: TextDocumentIdentifier;

  #position: Position;

  #iterator?: AsyncIterator<string>;

  // FIXME: this is terrible
  // we use this flag from the clients of this stream to identify if we should set the loading icon or not
  loading = false;

  #lastValue = '';

  constructor(
    client: BaseLanguageClient,
    document: vscode.TextDocument,
    position: vscode.Position,
  ) {
    this.#id = uniqueId('code-suggestion-stream-');
    this.#client = client;
    const protocolDocument = this.#client.code2ProtocolConverter.asTextDocumentPositionParams(
      document,
      position,
    );
    this.#textDocument = protocolDocument.textDocument;
    this.#position = protocolDocument.position;
    this.#cancellationTokenSource = new vscode.CancellationTokenSource();
  }

  async start() {
    // TODO: use StreamingCompletionRequest (which contains the expected notification type)
    // unfortunately the const doesn't get through from LS for some reason
    await this.#client.sendNotification(STREAMING_COMPLETION_REQUEST_NOTIFICATION, {
      textDocument: this.#textDocument,
      position: this.#position,
      context: { triggerKind: InlineCompletionTriggerKind.Automatic },
      id: this.#id,
    });

    this.#iterator = createStreamIterator(
      this.#client,
      this.#id,
      this.#cancellationTokenSource.token,
    );
  }

  get iterator() {
    if (!this.#iterator) {
      throw new Error(`Stream ${this.#id}, has not been started.`);
    }
    return {
      next: async () => {
        const { value, done } = await this.#iterator!.next();
        if (!done) {
          this.#lastValue = value;
        }
        return { done, value };
      },
    };
  }

  cancel() {
    log.debug(`Cancellation requested for stream ${this.#id}`);
    return this.#cancellationTokenSource.cancel();
  }

  get lastSuggestion() {
    return this.#lastValue;
  }
}
