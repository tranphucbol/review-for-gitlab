import { beforeEach, describe, expect, it, vi } from 'vitest';
import createReactionStore from './reactions';

const NOTE = 'gid://gitlab/Note/1';
const EYES = { name: 'eyes', emoji: '👀', count: 1, users: ['Alice'], mine: false };

describe('reaction store', () => {
  let vscode;
  let store;

  const lastRequest = () => vscode.postMessage.mock.calls.at(-1)[0];

  beforeEach(() => {
    vscode = { postMessage: vi.fn() };
    store = createReactionStore(vscode);
    store.onMessage({ type: 'reactions', reactions: { [NOTE]: [EYES] } });
  });

  it('keeps what the host sends, by note', () => {
    expect(store.groupsOf(NOTE)).toEqual([EYES]);
    expect(store.groupsOf('gid://gitlab/Note/2')).toEqual([]);
  });

  it('shows a toggle at once and then the host answer', () => {
    store.toggle(NOTE, 'eyes', true, '👀');

    expect(store.groupsOf(NOTE)).toEqual([{ ...EYES, count: 2, mine: true }]);
    const request = lastRequest();
    expect(request).toEqual({
      command: 'setReaction',
      requestId: expect.any(Number),
      noteId: NOTE,
      name: 'eyes',
      on: true,
    });

    const answer = [{ ...EYES, count: 2, users: ['Alice'], mine: true }];
    store.onMessage({ type: 'reactionSet', requestId: request.requestId, reactions: answer });
    expect(store.groupsOf(NOTE)).toEqual(answer);
  });

  it('undoes a toggle the host could not save', () => {
    store.toggle(NOTE, 'rocket', true, '🚀');

    store.onMessage({ type: 'reactionSet', requestId: lastRequest().requestId, error: true });

    expect(store.groupsOf(NOTE)).toEqual([EYES]);
  });

  it('ignores an answer to a request it did not make', () => {
    store.onMessage({ type: 'reactionSet', requestId: 9999, reactions: [] });

    expect(store.groupsOf(NOTE)).toEqual([EYES]);
  });

  it('asks the host for the emoji list once', async () => {
    const loading = store.loadEmojis();
    await new Promise(resolve => {
      setTimeout(resolve);
    });
    const request = lastRequest();
    expect(request).toEqual({ command: 'loadEmojis', requestId: expect.any(Number) });

    const emojis = [{ name: 'eyes', emoji: '👀', description: 'eyes', category: 'people' }];
    store.onMessage({ type: 'emojisLoaded', requestId: request.requestId, emojis });

    expect(await loading).toEqual({ emojis });
    await store.loadEmojis();
    expect(vscode.postMessage).toHaveBeenCalledTimes(1);
  });
});
