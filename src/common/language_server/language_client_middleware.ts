import vscode from 'vscode';
import { CompletionMiddleware } from 'vscode-languageclient';
import {
  InlineCompletionMiddleware,
  ProvideInlineCompletionItemsSignature,
} from 'vscode-languageclient/lib/common/inlineCompletion';
import { CodeSuggestionsStateManager } from '../code_suggestions/code_suggestions_state_manager';
import { waitForCancellationToken } from '../utils/wait_for_cancellation_token';
import { waitForMs } from '../utils/wait_for_ms';

// We need to wait just a bit after cancellation, otherwise the loading icon flickers while someone types
const CANCELLATION_DELAY = 150;

export class LanguageClientMiddleware implements InlineCompletionMiddleware, CompletionMiddleware {
  #stateManager: CodeSuggestionsStateManager;

  constructor(stateManager: CodeSuggestionsStateManager) {
    this.#stateManager = stateManager;
  }

  // we disable standard completion form LS and only use inline completion
  // eslint-disable-next-line class-methods-use-this
  provideCompletionItem = () => [];

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
    next: ProvideInlineCompletionItemsSignature,
  ) {
    if (!this.#stateManager.isActive()) {
      return [];
    }

    this.#stateManager.setLoading(true);

    // Short circuit after both cancellation and time have passed
    const shortCircuit = waitForCancellationToken(token)
      .then(() => waitForMs(CANCELLATION_DELAY))
      .then(() => []);

    try {
      return await Promise.race([shortCircuit, next(document, position, context, token)]);
    } finally {
      this.#stateManager.setLoading(false);
    }
  }
}
