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
    const d = createFakePartial<vscode.TextDocument>({});
    const p = createFakePartial<vscode.Position>({});
    const ctx = createFakePartial<vscode.InlineCompletionContext>({});
    const tkn = createFakePartial<vscode.CancellationToken>({});

    it('returns empty array if suggestions are in a disabled state', async () => {
      const stateManager = createFakePartial<CodeSuggestionsStateManager>({
        isDisabledByUser: () => true,
      });
      const middleware = new LanguageClientMiddleware(stateManager);
      const next = jest.fn();

      const result = await middleware.provideInlineCompletionItems(d, p, ctx, tkn, next);

      expect(result).toEqual([]);
      expect(next).not.toHaveBeenCalled();
    });

    describe('when suggestions enabled', () => {
      let stateManager: CodeSuggestionsStateManager;
      let middleware: LanguageClientMiddleware;

      let setLoading: jest.Func;

      beforeEach(() => {
        setLoading = jest.fn();
        stateManager = createFakePartial<CodeSuggestionsStateManager>({
          isDisabledByUser: () => false,
          setLoading,
        });
        middleware = new LanguageClientMiddleware(stateManager);
      });

      it('calls through to default logic if suggestions are enabled', async () => {
        const mockItem = createFakePartial<vscode.InlineCompletionItem>({});
        const next = jest.fn().mockResolvedValue([mockItem]);

        const result = await middleware.provideInlineCompletionItems(d, p, ctx, tkn, next);

        expect(result).toEqual([mockItem]);
      });

      it('sets suggestions to loading state', async () => {
        const next = jest.fn().mockResolvedValue([]);

        await middleware.provideInlineCompletionItems(d, p, ctx, tkn, next);

        expect(setLoading).toHaveBeenCalledTimes(2);
        expect(setLoading).toHaveBeenCalledWith(true);
        expect(setLoading).toHaveBeenLastCalledWith(false);
      });

      it('sets loading to false even if fetching suggestions throws an error', async () => {
        const next = jest.fn().mockRejectedValue(new Error());

        await expect(
          middleware.provideInlineCompletionItems(d, p, ctx, tkn, next),
        ).rejects.toThrow();

        expect(setLoading).toHaveBeenCalledTimes(2);
        expect(setLoading).toHaveBeenCalledWith(true);
        expect(setLoading).toHaveBeenLastCalledWith(false);
      });
    });
  });
});
