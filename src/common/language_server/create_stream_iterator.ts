import { Disposable } from 'vscode';
import {
  CANCEL_STREAMING_COMPLETION_NOTIFICATION,
  STREAMING_COMPLETION_RESPONSE_NOTIFICATION,
} from '@gitlab-org/gitlab-lsp';
import { BaseLanguageClient, CancellationToken } from 'vscode-languageclient';
import { log } from '../log';

interface CompletionPart {
  completion: string;
  canceled?: boolean;
  done: boolean;
}

export const createStreamIterator = (
  client: BaseLanguageClient,
  streamId: string,
  cancellationToken?: CancellationToken,
): AsyncIterator<{ completion: string }, { completion: string; canceled?: boolean }> => {
  let resolveWait: ((val: CompletionPart) => void) | null = null;
  let lastCompletion = '';

  const queue: CompletionPart[] = [];
  const subscriptions: Disposable[] = [];

  const waitForNext = (): Promise<CompletionPart> => {
    if (queue.length) {
      return Promise.resolve(queue.shift()!);
    }

    return new Promise<CompletionPart>(resolve => {
      resolveWait = resolve;
    });
  };

  const onComplete = () => {
    subscriptions.forEach(x => x.dispose());
  };

  const onNext = (part: CompletionPart): void => {
    lastCompletion = part.completion;

    if (resolveWait) {
      resolveWait(part);
      resolveWait = null;
    } else {
      queue.push(part);
    }
  };

  if (cancellationToken) {
    subscriptions.push(
      cancellationToken.onCancellationRequested(async () => {
        // TODO use CancelStreaming as the notification type (it is type safe)
        // ATM we can't do that because something is wrong with the LSP exporting types/constants
        await client.sendNotification(CANCEL_STREAMING_COMPLETION_NOTIFICATION, { id: streamId });
        onNext({ completion: lastCompletion, done: true, canceled: true });
      }),
    );
  }

  subscriptions.push(
    client.onNotification(
      // TODO use StreamingCompletionResponse as the notification type (it is type safe)
      // ATM we can't do that because something is wrong with the LSP exporting types/constants
      STREAMING_COMPLETION_RESPONSE_NOTIFICATION,
      ({ id, completion, done }) => {
        if (id !== streamId) {
          return;
        }

        let completionValue = completion || '';

        if (!completionValue && done) {
          completionValue = lastCompletion;
        }

        onNext({
          completion: completionValue,
          done,
        });
      },
    ),
  );

  return {
    async next() {
      const { completion, done, canceled = false } = await waitForNext();

      if (canceled) {
        onComplete();
        return {
          value: {
            completion,
            canceled,
          },
          done: true,
        };
      }

      log.debug(`Streaming Suggestion: ${completion}, Done is ${done}`);

      if (done) {
        onComplete();
      }

      return {
        value: {
          completion,
          canceled,
        },
        done,
      };
    },
  };
};
