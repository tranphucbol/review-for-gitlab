import vscode from 'vscode';
import { BaseLanguageClient } from 'vscode-languageclient';
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

  #iterator: IteratorType;

  constructor(
    client: BaseLanguageClient,
    document: vscode.TextDocument,
    position: vscode.Position,
    streamId: string,
  ) {
    this.#id = streamId;
    this.#client = client;
    this.#cancellationTokenSource = new vscode.CancellationTokenSource();
    this.#iterator = createStreamIterator(
      this.#client,
      this.#id,
      this.#cancellationTokenSource.token,
    );
    log.debug(`Listening to stream ${this.#id}`);
  }

  get iterator() {
    return this.#iterator;
  }

  cancel() {
    log.debug(`Cancellation requested for stream ${this.#id}`);
    return this.#cancellationTokenSource.cancel();
  }
}
