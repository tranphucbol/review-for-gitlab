import { reactive } from 'vue';
import { createEmojiLoader, toggleGroups } from '@shared/utils/emoji';
import { request } from './vscode_bridge';

/**
 * The reactions on the notes of this file, by note ID. The host sends them after the
 * discussions; a toggle shows at once and is replaced by the host's answer, or undone when
 * the host could not save it (the host shows why).
 */
const state = reactive({ byNote: {} });

export const loadEmojis = createEmojiLoader(async () => (await request('loadEmojis', {})).emojis);

export const reactionsOf = noteId => state.byNote[noteId] ?? [];

export const setReactions = reactions => {
  state.byNote = { ...reactions };
};

export const toggleReaction = async (noteId, name, on, emoji) => {
  state.byNote[noteId] = toggleGroups(reactionsOf(noteId), name, on, emoji);
  try {
    const { reactions } = await request('setReaction', { noteId, name, on });
    state.byNote[noteId] = reactions ?? [];
  } catch {
    state.byNote[noteId] = toggleGroups(reactionsOf(noteId), name, !on, emoji);
  }
};
