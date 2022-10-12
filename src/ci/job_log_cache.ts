import * as vscode from 'vscode';

export type JobTraceSection = {
  startLine: number;
  startTime: number;
  endLine?: number;
  endTime?: number;
};

export type CacheItem = {
  rawTrace: string;
  filtered?: string;
  decorations?: Map<string, vscode.DecorationOptions[]>;
  sections?: Map<string, JobTraceSection>;
};

type InnerCacheItem = CacheItem & { lastOpened: number }; // lastOpened is implementation detail

export class JobLogCache {
  #storage: Record<number, InnerCacheItem> = {};

  touch(jobId: number) {
    this.#storage[jobId].lastOpened = new Date().getTime();
  }

  get(jobId: number): CacheItem | undefined {
    return this.#storage[jobId];
  }

  set(jobId: number, rawTrace: string) {
    this.#storage[jobId] = {
      rawTrace,
      lastOpened: new Date().getTime(),
    };
  }

  addDecorations(
    jobId: number,
    sections: Map<string, JobTraceSection>,
    decorations: Map<string, vscode.DecorationOptions[]>,
    filtered: string,
  ) {
    this.#storage[jobId] = {
      ...this.#storage[jobId],
      sections,
      decorations,
      filtered,
    };
  }

  async delete(jobId: number) {
    if (!this.#storage[jobId]) return;

    // When a document changes its language, VS Code emits a close and open event in succession.
    // Delay the removal of the cache entry, and abort if the document was accessed during the timeout.
    const { lastOpened } = this.#storage[jobId];
    await new Promise<void>(accept => {
      setTimeout(accept, 2000);
    });

    if (this.#storage[jobId]?.lastOpened === lastOpened) {
      delete this.#storage[jobId];
    }
  }

  clearAll() {
    this.#storage = {};
  }
}

export const jobLogCache = new JobLogCache();
