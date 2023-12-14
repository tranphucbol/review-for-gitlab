import vscode from 'vscode';
import { CodeSuggestionsStateManager } from '../code_suggestions/code_suggestions_state_manager';
import { createFakePartial } from '../test_utils/create_fake_partial';
import { LanguageClientMiddleware } from './language_client_middleware';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { waitForCancellationToken } from '../utils/wait_for_cancellation_token';

describe('LanguageClientMiddleware', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  it('disables standard completion - provideCompletionItem always returns empty array', () => {
    const stateManager = new CodeSuggestionsStateManager(
      createFakePartial<GitLabPlatformManager>({}),
    );
    const middleware = new LanguageClientMiddleware(stateManager);
    expect(middleware.provideCompletionItem()).toEqual([]);
  });

  describe('provideInlineCompletionItem', () => {
    const d = createFakePartial<vscode.TextDocument>({});
    const p = createFakePartial<vscode.Position>({});
    const ctx = createFakePartial<vscode.InlineCompletionContext>({});

    let cancellationTokenSource: vscode.CancellationTokenSource;

    beforeEach(() => {
      cancellationTokenSource = new vscode.CancellationTokenSource();
    });

    it('returns empty array if suggestions are not active', async () => {
      const stateManager = createFakePartial<CodeSuggestionsStateManager>({
        isActive: () => false,
      });
      const middleware = new LanguageClientMiddleware(stateManager);
      const next = jest.fn();

      const result = await middleware.provideInlineCompletionItems(
        d,
        p,
        ctx,
        cancellationTokenSource.token,
        next,
      );

      expect(result).toEqual([]);
      expect(next).not.toHaveBeenCalled();
    });

    describe('when suggestions are active', () => {
      let stateManager: CodeSuggestionsStateManager;
      let middleware: LanguageClientMiddleware;

      let setLoading: jest.Func;

      beforeEach(() => {
        setLoading = jest.fn();
        stateManager = createFakePartial<CodeSuggestionsStateManager>({
          isActive: () => true,
          setLoading,
        });
        middleware = new LanguageClientMiddleware(stateManager);
      });

      it('calls through to default logic if suggestions are enabled', async () => {
        const mockItem = createFakePartial<vscode.InlineCompletionItem>({});
        const next = jest.fn().mockResolvedValue([mockItem]);

        const result = await middleware.provideInlineCompletionItems(
          d,
          p,
          ctx,
          cancellationTokenSource.token,
          next,
        );

        expect(result).toEqual([mockItem]);
      });

      it('sets suggestions to loading state', async () => {
        const next = jest.fn().mockResolvedValue([]);

        await middleware.provideInlineCompletionItems(
          d,
          p,
          ctx,
          cancellationTokenSource.token,
          next,
        );

        expect(setLoading).toHaveBeenCalledTimes(2);
        expect(setLoading).toHaveBeenCalledWith(true);
        expect(setLoading).toHaveBeenLastCalledWith(false);
      });

      it('sets loading to false even if fetching suggestions throws an error', async () => {
        const next = jest.fn().mockRejectedValue(new Error());

        await expect(
          middleware.provideInlineCompletionItems(d, p, ctx, cancellationTokenSource.token, next),
        ).rejects.toThrow();

        expect(setLoading).toHaveBeenCalledTimes(2);
        expect(setLoading).toHaveBeenCalledWith(true);
        expect(setLoading).toHaveBeenLastCalledWith(false);
      });

      it('sets loading to false if token is canceled and next never resolves', async () => {
        const next = jest.fn().mockReturnValue(new Promise(() => {}));

        const result = middleware.provideInlineCompletionItems(
          d,
          p,
          ctx,
          cancellationTokenSource.token,
          next,
        );

        // We need to flush promises after canceling, so we use our waitFor helper here
        const waitForCanceled = waitForCancellationToken(cancellationTokenSource.token);

        cancellationTokenSource.cancel();
        await waitForCanceled;
        jest.advanceTimersByTime(150);

        await expect(result).resolves.toEqual([]);
        expect(jest.mocked(setLoading).mock.calls).toEqual([[true], [false]]);
      });
    });
  });
});
