import vscode from 'vscode';
import { BaseLanguageClient, TextDocumentPositionParams } from 'vscode-languageclient';
import { START_STREAMING_COMMAND, StreamingCompletionRequest } from '@gitlab-org/gitlab-lsp';
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
  let stateManager: CodeSuggestionsStateManager;

  beforeEach(() => {
    jest.useFakeTimers();

    stateManager = new CodeSuggestionsStateManager(createFakePartial<GitLabPlatformManager>({}));
    jest.spyOn(stateManager, 'setLoading');
    jest.spyOn(stateManager, 'isActive').mockReturnValue(true);
  });

  it('disables standard completion - provideCompletionItem always returns empty array', () => {
    const middleware = new LanguageClientMiddleware(stateManager);
    expect(middleware.provideCompletionItem()).toEqual([]);
  });

  describe('provideInlineCompletionItem', () => {
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
      beforeEach(() => {
        setFakeWorkspaceConfiguration({
          featureFlags: {
            streamCodeGenerations: false,
          },
        });
      });

      it('returns empty array if suggestions are not active', async () => {
        jest.spyOn(stateManager, 'isActive').mockReturnValue(false);
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
        let middleware: LanguageClientMiddleware;
        const client = createFakePartial<BaseLanguageClient>({
          sendRequest: jest.fn(),
        });

        beforeEach(() => {
          jest.spyOn(stateManager, 'isActive').mockReturnValue(true);
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

          expect(jest.mocked(stateManager.setLoading).mock.calls).toEqual([[true], [false]]);
        });

        it('sets loading to false even if fetching suggestions throws an error', async () => {
          const next = jest.fn().mockRejectedValue('Failed to fetch');
          await middleware.provideInlineCompletionItems(
            d,
            p,
            ctx,
            cancellationTokenSource.token,
            next,
          );

          expect(jest.mocked(stateManager.setLoading).mock.calls).toEqual([[true], [false]]);
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
          expect(jest.mocked(stateManager.setLoading).mock.calls).toEqual([[true], [false]]);
        });
      });
    });

    describe('when streaming is enabled', () => {
      let nextSpy: ProvideInlineCompletionItemsSignature;
      let middleware: LanguageClientMiddleware;
      const streamId = 'code-suggestion-stream-LS-id';

      const callMiddleware = async ({
        times = 1,
        position = p,
        cancellationToken = cancellationTokenSource.token,
        next = nextSpy,
      } = {}) =>
        Array.from({ length: times }).reduce<
          ReturnType<LanguageClientMiddleware['provideInlineCompletionItems']>
        >(
          acc =>
            acc.then(() =>
              middleware.provideInlineCompletionItems(d, position, ctx, cancellationToken, next),
            ),
          Promise.resolve(undefined),
        );

      beforeEach(() => {
        nextSpy = jest.fn().mockResolvedValue({
          items: [
            {
              insertText: '',
              command: {
                command: START_STREAMING_COMMAND,
                arguments: [streamId],
              },
            },
          ],
        });

        setFakeWorkspaceConfiguration({
          featureFlags: {
            streamCodeGenerations: true,
          },
        });

        middleware = new LanguageClientMiddleware(stateManager);
      });

      it('calls the inlineCompletion (next) if client is not set', async () => {
        const mockItem = createFakePartial<vscode.InlineCompletionItem>({});
        const nextReturnsItem = jest.fn().mockResolvedValue([mockItem]);
        const result = await callMiddleware({ next: nextReturnsItem });

        expect(result).toEqual([mockItem]);
        expect(nextSpy).not.toHaveBeenCalled();
      });

      describe('when the language client is set', () => {
        let client: BaseLanguageClient;

        beforeEach(() => {
          jest.useRealTimers();

          const asTextDocumentPositionParams = jest.fn();

          client = createFakePartial<BaseLanguageClient>({
            sendNotification: jest.fn().mockImplementation(() => Promise.resolve()),
            code2ProtocolConverter: {
              asTextDocumentPositionParams,
            },
            onNotification: jest.fn().mockImplementation(() => Promise.resolve()),
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

        describe('streaming', () => {
          it('starts with the request to the server', async () => {
            await callMiddleware();

            expect(client.sendNotification).toHaveBeenCalledWith(
              expect.objectContaining({
                method: StreamingCompletionRequest.method,
              }),
              expect.objectContaining({
                id: streamId,
              }),
            );
          });

          it('keeps receiving notifications until done', async () => {
            client.onNotification = invokeNotifications([
              { id: streamId, completion: 'test', done: false },
              { id: streamId, completion: '', done: true },
            ]);

            /* Here and further we need to make one additional call of the callMiddleware.
            The first one will imitate the first request to the LS
            that returns the response with the streaming command and starts the stream.
            Next calls imitate streaming of the chunks
            So there is always one additional call which detects and starts the stream
            and the next ones that actually receive the stream */
            const result = (await callMiddleware({ times: 2 })) as vscode.InlineCompletionItem[];

            expect(result[0].insertText).toEqual('test');
          });

          it('returns the existing response if position does not change', async () => {
            client.onNotification = invokeNotifications([
              { id: streamId, completion: 'test 123', done: false },
              { id: streamId, completion: '', done: true },
            ]);

            const result = (await callMiddleware({ times: 2 })) as vscode.InlineCompletionItem[];

            expect(result[0].insertText).toEqual('test 123');
          });

          it('returns the new stream if position does change', async () => {
            client.onNotification = invokeNotifications([
              { id: streamId, completion: 'test', done: false },
              { id: streamId, completion: '', done: true },
            ]);

            await callMiddleware({ times: 2 });

            const p2 = {
              line: 1,
              character: 0,
            } as vscode.Position;

            client.onNotification = invokeNotifications([
              { id: streamId, completion: 'test2', done: false },
              { id: streamId, completion: '', done: true },
            ]);

            const result = (await callMiddleware({
              times: 2,
              position: p2,
            })) as vscode.InlineCompletionItem[];

            expect(result[0].insertText).toEqual('test2');
          });

          it('handles `setLoading` gracefully', async () => {
            client.onNotification = invokeNotifications([
              { id: streamId, completion: 'test', done: false },
              { id: streamId, completion: 'test 123', done: false },
              { id: streamId, completion: 'test 123 abc', done: true },
            ]);

            await callMiddleware({ times: 4 });

            expect(jest.mocked(stateManager.setLoading).mock.calls).toEqual([
              [true], // request to detect streaming started
              [true], // stream started
              [false], // request to detect streaming ended (finally called)
              [false], // stream completed
            ]);
          });

          it('when canceled, handles `setLoading` gracefully', async () => {
            client.onNotification = invokeNotifications([
              { id: streamId, completion: 'test', done: false },
              { id: streamId, completion: 'test 123', done: false },
            ]);

            const result = callMiddleware({ times: 2 });

            cancellationTokenSource.cancel();

            await result;

            expect(jest.mocked(stateManager.setLoading).mock.calls).toEqual([
              [true], // request to detect streaming started
              [true], // stream started
              [false], // request to detect streaming ended (finally called)
              [false], // stream cancelled
            ]);
          });

          it('when position changes, handles loading stack gracefully', async () => {
            client.onNotification = invokeNotifications([
              { id: streamId, completion: 'test', done: false },
              { id: streamId, completion: 'test 123', done: true },
            ]);

            const firstCancellation = new vscode.CancellationTokenSource();
            const firstPosition = createFakePartial<vscode.Position>({
              line: 1,
              character: 0,
            });

            const firstStream = callMiddleware({
              times: 2,
              position: firstPosition,
              cancellationToken: firstCancellation.token,
            });

            firstCancellation.cancel();
            const streamWithNewPosition = callMiddleware({ times: 3 });
            await Promise.all([firstStream, streamWithNewPosition]);

            expect(jest.mocked(stateManager.setLoading).mock.calls).toEqual([
              [true], // request to detect streaming started for firstStream
              [true], // request to detect streaming started for streamWithNewPosition
              [true], // started firstStream
              [true], // started streamWithNewPosition
              [false], // request to detect streaming ended for firstStream (finally called)
              [false], // request to detect streaming ended for streamWithNewPosition (finally called)
              [false], // firstStream cancelled
              [false], // streamWithNewPosition completed
            ]);
          });
        });
      });
    });
  });
});
