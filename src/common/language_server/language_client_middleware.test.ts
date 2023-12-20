import vscode from 'vscode';
import { BaseLanguageClient, TextDocumentPositionParams } from 'vscode-languageclient';
import { GET_COMPLETION_INTENT_REQUEST } from '@gitlab-org/gitlab-lsp';
import { ProvideInlineCompletionItemsSignature } from 'vscode-languageclient/lib/common/inlineCompletion';
import { CodeSuggestionsStateManager } from '../code_suggestions/code_suggestions_state_manager';
import { createFakePartial } from '../test_utils/create_fake_partial';
import { LanguageClientMiddleware } from './language_client_middleware';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { setFakeWorkspaceConfiguration } from '../test_utils/vscode_fakes';

jest.mock('lodash', () => {
  const allLodash = jest.requireActual('lodash');

  return {
    ...allLodash,
    uniqueId: (prefix: string) => `${prefix}uniqueId`,
  };
});

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
    const documentFilePath = 'file:///home/user/dev/test.md';
    const d = createFakePartial<vscode.TextDocument>({
      uri: vscode.Uri.parse('file:///home/user/dev/test.md'),
    });
    const p = createFakePartial<vscode.Position>({
      character: 7,
      line: 77,
    });
    const ctx = createFakePartial<vscode.InlineCompletionContext>({});

    let cancellationTokenSource: vscode.CancellationTokenSource;

    beforeEach(() => {
      cancellationTokenSource = new vscode.CancellationTokenSource();
    });

    describe('when streaming is disabled', () => {
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
        const client = createFakePartial<BaseLanguageClient>({
          sendRequest: jest.fn(),
        });

        let setLoading: jest.Func;

        beforeEach(() => {
          setLoading = jest.fn();
          stateManager = createFakePartial<CodeSuggestionsStateManager>({
            isActive: () => true,
            setLoading,
          });
          middleware = new LanguageClientMiddleware(stateManager);
          middleware.client = client;
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

          // why: We need to flush some promises before we cancel
          await jest.runOnlyPendingTimersAsync();
          cancellationTokenSource.cancel();
          await jest.advanceTimersByTimeAsync(150);

          await expect(result).resolves.toEqual([]);
          expect(jest.mocked(setLoading).mock.calls).toEqual([[true], [false]]);
        });

        it('should not make a call to detect intent', async () => {
          const mockItem = createFakePartial<vscode.InlineCompletionItem>({});
          const next = jest.fn().mockResolvedValue([mockItem]);

          await middleware.provideInlineCompletionItems(
            d,
            p,
            ctx,
            cancellationTokenSource.token,
            next,
          );

          expect(client.sendRequest).not.toHaveBeenCalled();
        });
      });
    });

    describe('when streaming is enabled', () => {
      let next: ProvideInlineCompletionItemsSignature;
      let stateManager: CodeSuggestionsStateManager;
      let middleware: LanguageClientMiddleware;
      let setLoading;

      beforeEach(() => {
        jest.useRealTimers();
        next = jest.fn().mockRejectedValue(new Error()); // we shouldn't be calling next for streaming

        setFakeWorkspaceConfiguration({
          featureFlags: {
            streamCodeGenerations: true,
          },
        });

        setLoading = jest.fn();
        stateManager = createFakePartial<CodeSuggestionsStateManager>({
          isActive: () => true,
          setLoading,
        });
        middleware = new LanguageClientMiddleware(stateManager);
      });

      it('calls the inlineCompletion (next) if client is not set', async () => {
        const mockItem = createFakePartial<vscode.InlineCompletionItem>({});
        const nextReturnsItem = jest.fn().mockResolvedValue([mockItem]);
        const result = await middleware.provideInlineCompletionItems(
          d,
          p,
          ctx,
          cancellationTokenSource.token,
          nextReturnsItem,
        );

        expect(result).toEqual([mockItem]);
        expect(next).not.toHaveBeenCalled();
      });

      describe('when the language client is set', () => {
        let client: BaseLanguageClient;

        beforeEach(() => {
          const asTextDocumentPositionParams = jest.fn();

          client = createFakePartial<BaseLanguageClient>({
            sendNotification: jest.fn().mockImplementation(() => Promise.resolve()),
            code2ProtocolConverter: {
              asTextDocumentPositionParams,
            },
            onNotification: jest.fn().mockImplementation(() => Promise.resolve()),
            sendRequest: jest.fn(),
          });

          middleware.client = client;

          asTextDocumentPositionParams.mockReturnValue({
            textDocument: {
              uri: 'uri',
            },
            position: {
              line: 0,
              character: 0,
            },
          } as TextDocumentPositionParams);
        });

        function invokeNotifications(list: unknown[]) {
          return jest.fn((_, callback) => {
            for (const element of list) {
              setTimeout(() => {
                const notificationData = element;
                callback(notificationData);
              }, 0);
            }

            return {
              dispose: () => {},
            };
          });
        }

        describe('Intent detection', () => {
          const nonStreamingCompletionHandler = jest.fn().mockResolvedValue([]);

          const triggerInlineCompletion = async () => {
            await middleware.provideInlineCompletionItems(
              d,
              p,
              ctx,
              cancellationTokenSource.token,
              nonStreamingCompletionHandler,
            );
          };

          beforeEach(() => {
            client.onNotification = invokeNotifications([
              { id: 'code-suggestion-stream-uniqueId', completion: '', done: false },
            ]);
          });

          it('should make a call to detect intent', async () => {
            await triggerInlineCompletion();
            expect(client.sendRequest).toHaveBeenCalledWith(GET_COMPLETION_INTENT_REQUEST, {
              documentUri: documentFilePath,
              position: p,
            });
          });

          it('should proceed to non-streaming completion when intent is not `generation`', async () => {
            jest.mocked(client.sendRequest).mockResolvedValue({
              intent: 'completion',
            });
            await triggerInlineCompletion();
            expect(nonStreamingCompletionHandler).toHaveBeenCalled();
            expect(client.sendNotification).not.toHaveBeenCalled();
          });

          it('should proceed to streaming completion when intent is `generation`', async () => {
            jest.mocked(client.sendRequest).mockResolvedValue({
              intent: 'generation',
            });
            await triggerInlineCompletion();
            jest.advanceTimersByTime(10);
            expect(nonStreamingCompletionHandler).not.toHaveBeenCalled();
            expect(client.sendNotification).toHaveBeenCalledWith(
              'streamingCompletionRequest',
              expect.anything(),
            );
          });
        });

        describe('generation', () => {
          beforeEach(() => {
            jest.mocked(client.sendRequest).mockResolvedValue({
              intent: 'generation',
            });
          });
          it('calls getStreamingCompletion on language client', async () => {
            client.onNotification = invokeNotifications([
              { id: 'code-suggestion-stream-uniqueId', completion: '', done: false },
            ]);
            const result = (await middleware.provideInlineCompletionItems(
              d,
              p,
              ctx,
              cancellationTokenSource.token,
              next,
            )) as vscode.InlineCompletionItem[];

            expect(client.sendNotification).toHaveBeenCalledTimes(1);
            expect(result[0].insertText).toEqual('');
          });

          it('getStreamingCompletion keeps receiving notifications until done', async () => {
            client.onNotification = invokeNotifications([
              { id: 'code-suggestion-stream-uniqueId', completion: 'test', done: false },
              { id: 'code-suggestion-stream-uniqueId', completion: '', done: true },
            ]);

            const result = (await middleware.provideInlineCompletionItems(
              d,
              p,
              ctx,
              cancellationTokenSource.token,
              next,
            )) as vscode.InlineCompletionItem[];
            expect(result[0].insertText).toEqual('test');
          });

          it('if position does not change. Returns the existing response', async () => {
            client.onNotification = invokeNotifications([
              { id: 'code-suggestion-stream-uniqueId', completion: 'test 123', done: false },
              { id: 'code-suggestion-stream-uniqueId', completion: '', done: true },
            ]);

            await middleware.provideInlineCompletionItems(
              d,
              p,
              ctx,
              cancellationTokenSource.token,
              next,
            );
            const result = (await middleware.provideInlineCompletionItems(
              d,
              p,
              ctx,
              cancellationTokenSource.token,
              next,
            )) as vscode.InlineCompletionItem[];
            expect(result[0].insertText).toEqual('test 123');
          });

          it('if position does change. Returns the new stream', async () => {
            client.onNotification = invokeNotifications([
              { id: 'code-suggestion-stream-uniqueId', completion: 'test', done: false },
              { id: 'code-suggestion-stream-uniqueId', completion: '', done: true },
            ]);

            await middleware.provideInlineCompletionItems(
              d,
              p,
              ctx,
              cancellationTokenSource.token,
              next,
            );
            await middleware.provideInlineCompletionItems(
              d,
              p,
              ctx,
              cancellationTokenSource.token,
              next,
            );
            const p2 = {
              line: 1,
              character: 0,
            } as vscode.Position;

            client.onNotification = invokeNotifications([
              { id: 'code-suggestion-stream-uniqueId', completion: 'test2', done: false },
              { id: 'code-suggestion-stream-uniqueId', completion: '', done: true },
            ]);
            const result = (await middleware.provideInlineCompletionItems(
              d,
              p2,
              ctx,
              cancellationTokenSource.token,
              next,
            )) as vscode.InlineCompletionItem[];
            expect(result[0].insertText).toEqual('test2');
          });
        });
      });
    });
  });
});
