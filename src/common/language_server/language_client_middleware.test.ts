import vscode from 'vscode';
import { CodeSuggestionsStateManager } from '../code_suggestions/code_suggestions_state_manager';
import { createFakePartial } from '../test_utils/create_fake_partial';
import { LanguageClientMiddleware } from './language_client_middleware';

describe('LanguageClientMiddleware', () => {
  it('disables standard completion - provideCompletionItem always returns empty array', () => {
    const stateManager = new CodeSuggestionsStateManager();
    const middleware = new LanguageClientMiddleware(stateManager);
    expect(middleware.provideCompletionItem()).toEqual([]);
  });

  describe('provideInlineCompletionItem', () => {
    const document = createFakePartial<vscode.TextDocument>({});
    const position = createFakePartial<vscode.Position>({});
    const context = createFakePartial<vscode.InlineCompletionContext>({});
    const token = createFakePartial<vscode.CancellationToken>({});

    it('returns empty array if suggestions are in a disabled state', async () => {
      const stateManager = createFakePartial<CodeSuggestionsStateManager>({
        isEnabled: () => false,
      });
      const middleware = new LanguageClientMiddleware(stateManager);
      const next = jest.fn();

      const result = await middleware.provideInlineCompletionItems(
        document,
        position,
        context,
        token,
        next,
      );

      expect(result).toEqual([]);
      expect(next).not.toHaveBeenCalled();
    });

    it('calls through to default logic if suggestions are enabled', async () => {
      const stateManager = createFakePartial<CodeSuggestionsStateManager>({
        isEnabled: () => true,
      });
      const middleware = new LanguageClientMiddleware(stateManager);
      const item = createFakePartial<vscode.InlineCompletionItem>({});
      const next = jest.fn().mockResolvedValue([item]);

      const result = await middleware.provideInlineCompletionItems(
        document,
        position,
        context,
        token,
        next,
      );

      expect(result).toEqual([item]);
    });
  });
});
