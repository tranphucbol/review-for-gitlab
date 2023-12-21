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

type IteratorType = ReturnType<typeof createStreamIterator>;

/** identifies the document and position for this stream */
export const getStreamContextId = (document: vscode.TextDocument, position: vscode.Position) =>
  `${document.uri.toString()}|${position.line}|${position.character}`;

export class CompletionStream {
  #client: BaseLanguageClient;

  #id: string;

  #cancellationTokenSource: vscode.CancellationTokenSource;

  #textDocument: TextDocumentIdentifier;

  #position: Position;

  #iterator: IteratorType;

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
    this.#iterator = createStreamIterator(
      this.#client,
      this.#id,
      this.#cancellationTokenSource.token,
    );
  }

  async start() {
    log.debug(`Start of stream ${this.#id}`);

    // TODO: use StreamingCompletionRequest (which contains the expected notification type)
    // unfortunately the const doesn't get through from LS for some reason
    await this.#client.sendNotification(STREAMING_COMPLETION_REQUEST_NOTIFICATION, {
      textDocument: this.#textDocument,
      position: this.#position,
      context: { triggerKind: InlineCompletionTriggerKind.Automatic },
      id: this.#id,
    });
  }

  get iterator() {
    return this.#iterator;
  }

  cancel() {
    log.debug(`Cancellation requested for stream ${this.#id}`);
    return this.#cancellationTokenSource.cancel();
  }
}
