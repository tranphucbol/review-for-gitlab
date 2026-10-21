// The same rule the host uses for the native comment box: an `@` that starts a
// word, followed by the part of a username typed so far.
const MENTION_BEFORE_CARET = /(^|[\s([{>])@([\w.-]*)$/;

/**
 * The mention being typed at the caret, or null.
 * `start` is the index of its `@`, `query` what follows it.
 */
export const findMentionQuery = (text, caret) => {
  const match = MENTION_BEFORE_CARET.exec(text.slice(0, caret));
  if (!match) return null;
  const query = match[2];
  return { start: caret - query.length - 1, query };
};

/** Replaces the mention from `start` to `caret` with `@username ` and returns the new text and caret. */
export const applyMention = (text, start, caret, username) => {
  const after = text.slice(caret);
  // finishing a username typed in the middle of a word replaces its rest too
  const rest = /^[\w.-]*/.exec(after)[0];
  const tail = after.slice(rest.length);
  const insert = `@${username}${tail.startsWith(' ') ? '' : ' '}`;
  return {
    text: `${text.slice(0, start)}${insert}${tail}`,
    caret: start + insert.length + (tail.startsWith(' ') ? 1 : 0),
  };
};
