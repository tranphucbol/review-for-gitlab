import { reactive } from 'vue';
import { createEmojiLoader, toggleGroups } from '@shared/utils/emoji';

let nextRequestId = 0;

/**
 * The reactions on the Overview's notes, by note ID. The host sends them after
 * the discussions; a toggle shows at once and is replaced by the host's answer,
 * or undone when the host could not save it (the host shows why).
 */
const createReactionStore = vscode => {
  const state = reactive({ byNote: {} });
  const pendingToggles = new Map();
  const pendingEmojis = new Map();

  const request = (command, payload, pending, value) => {
    nextRequestId += 1;
    const requestId = nextRequestId;
    pending.set(requestId, value);
    vscode.postMessage({ command, requestId, ...payload });
  };

  const loadEmojis = createEmojiLoader(
    () =>
      new Promise((resolve, reject) => {
        request('loadEmojis', {}, pendingEmojis, { resolve, reject });
      }),
  );

  return {
    state,
    loadEmojis,
    groupsOf(noteId) {
      return state.byNote[noteId] ?? [];
    },
    toggle(noteId, name, on, emoji) {
      state.byNote[noteId] = toggleGroups(state.byNote[noteId] ?? [], name, on, emoji);
      request('setReaction', { noteId, name, on }, pendingToggles, { noteId, name, on, emoji });
    },
    onMessage(data) {
      if (data?.type === 'reactions') {
        state.byNote = { ...data.reactions };
      } else if (data?.type === 'reactionSet' && pendingToggles.has(data.requestId)) {
        const { noteId, name, on, emoji } = pendingToggles.get(data.requestId);
        pendingToggles.delete(data.requestId);
        state.byNote[noteId] = data.error
          ? toggleGroups(state.byNote[noteId] ?? [], name, !on, emoji)
          : data.reactions ?? [];
      } else if (data?.type === 'emojisLoaded' && pendingEmojis.has(data.requestId)) {
        const { resolve, reject } = pendingEmojis.get(data.requestId);
        pendingEmojis.delete(data.requestId);
        if (data.error) reject(new Error('emoji list'));
        else resolve(data.emojis);
      }
    },
  };
};

export default createReactionStore;
