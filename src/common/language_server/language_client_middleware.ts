import vscode from 'vscode';
import { CompletionMiddleware } from 'vscode-languageclient';
import {
  InlineCompletionMiddleware,
  ProvideInlineCompletionItemsSignature,
} from 'vscode-languageclient/lib/common/inlineCompletion';
import { CodeSuggestionsStateManager } from '../code_suggestions/code_suggestions_state_manager';

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
    if (this.#stateManager.isDisabledByUser()) {
      return [];
    }
    return next(document, position, context, token);
  }
}
