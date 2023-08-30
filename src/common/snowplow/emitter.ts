import { PayloadBuilder } from '@snowplow/tracker-core';

export type SendEventCallback = (events: PayloadBuilder[]) => Promise<void>;

// eslint-disable-next-line no-shadow
enum EmitterState {
  STARTED,
  STOPPING,
  STOPPED,
}

export class Emitter {
  private trackingQueue: PayloadBuilder[] = [];

  private callback: SendEventCallback;

  private timeInterval: number;

  private maxItems: number;

  private currentState: EmitterState;

  private timeout: NodeJS.Timeout | undefined;

  constructor(timeInterval: number, maxItems: number, callback: SendEventCallback) {
    this.maxItems = maxItems;
    this.timeInterval = timeInterval;
    this.callback = callback;
    this.currentState = EmitterState.STOPPED;
  }

  add(data: PayloadBuilder) {
    this.trackingQueue.push(data);

    if (this.trackingQueue.length >= this.maxItems) {
      this.drainQueue().catch(() => {});
    }
  }

  private async drainQueue(): Promise<void> {
    if (this.trackingQueue.length > 0) {
      await this.callback(this.trackingQueue);
      this.trackingQueue = [];
    }
  }

  start() {
    this.timeout = setTimeout(async () => {
      await this.drainQueue();

      if (this.currentState !== EmitterState.STOPPING) {
        this.start();
      }
    }, this.timeInterval);
    this.currentState = EmitterState.STARTED;
  }

  async stop() {
    this.currentState = EmitterState.STOPPING;
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    this.timeout = undefined;
    await this.drainQueue();
  }
}
