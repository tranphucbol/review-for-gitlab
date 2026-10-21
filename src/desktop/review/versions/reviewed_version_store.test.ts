import { InMemoryMemento } from '../../../../test/integration/test_infrastructure/in_memory_memento';
import { createTokenAccount, mr } from '../../test_utils/entities';
import {
  MAX_REVIEWED_VERSIONS,
  REVIEWED_VERSIONS_KEY,
  ReviewedVersionStore,
} from './reviewed_version_store';

describe('ReviewedVersionStore', () => {
  const account = createTokenAccount('https://gitlab.example.com', 7);
  let memento: InMemoryMemento;
  let store: ReviewedVersionStore;

  beforeEach(() => {
    memento = new InMemoryMemento();
    store = new ReviewedVersionStore();
    store.init(memento);
  });

  it('returns nothing for a merge request never marked', () => {
    expect(store.get(account, mr)).toBeUndefined();
  });

  it('remembers the head per account, project and merge request', async () => {
    const now = new Date('2026-10-21T10:00:00Z');

    await store.record(account, mr, 'abc', now);

    expect(store.get(account, mr)).toEqual({ headSha: 'abc', reviewedAt: now.toISOString() });
    expect(store.get(createTokenAccount('https://gitlab.example.com', 8), mr)).toBeUndefined();
    expect(store.get(account, { ...mr, iid: mr.iid + 1 })).toBeUndefined();
    expect(store.get(account, { ...mr, project_id: mr.project_id + 1 })).toBeUndefined();
  });

  it('replaces the head when the merge request is marked again', async () => {
    await store.record(account, mr, 'abc');
    await store.record(account, mr, 'def');

    expect(store.get(account, mr)?.headSha).toBe('def');
  });

  it(`forgets the oldest reviews beyond ${MAX_REVIEWED_VERSIONS}`, async () => {
    const start = Date.UTC(2026, 0, 1);
    const old = Object.fromEntries(
      Array.from({ length: MAX_REVIEWED_VERSIONS }, (_, i) => [
        `key-${i}`,
        { headSha: `sha-${i}`, reviewedAt: new Date(start + i * 1000).toISOString() },
      ]),
    );
    await memento.update(REVIEWED_VERSIONS_KEY, old);

    await store.record(account, mr, 'abc', new Date(start + 10_000_000));

    const all = memento.get<Record<string, unknown>>(REVIEWED_VERSIONS_KEY) ?? {};
    expect(Object.keys(all)).toHaveLength(MAX_REVIEWED_VERSIONS);
    expect(all['key-0']).toBeUndefined();
    expect(all['key-1']).toBeDefined();
    expect(store.get(account, mr)?.headSha).toBe('abc');
  });

  it('refuses to record before it is initialized', async () => {
    await expect(new ReviewedVersionStore().record(account, mr, 'abc')).rejects.toThrow(
      'not initialized',
    );
  });
});
