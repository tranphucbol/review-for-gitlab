/**
 * Emoji for reactions. The host sends the instance's whole list on request;
 * the common ones below stand in when it can't.
 */

/** the reactions GitLab offers first, as its own picker does */
export const COMMON_EMOJI = [
  { name: 'thumbsup', emoji: '👍', description: 'thumbs up sign', category: 'people' },
  { name: 'thumbsdown', emoji: '👎', description: 'thumbs down sign', category: 'people' },
  {
    name: 'smile',
    emoji: '😄',
    description: 'smiling face with open mouth and smiling eyes',
    category: 'people',
  },
  { name: 'tada', emoji: '🎉', description: 'party popper', category: 'activity' },
  { name: 'confused', emoji: '😕', description: 'confused face', category: 'people' },
  { name: 'heart', emoji: '❤', description: 'heavy black heart', category: 'symbols' },
  { name: 'rocket', emoji: '🚀', description: 'rocket', category: 'travel' },
  { name: 'eyes', emoji: '👀', description: 'eyes', category: 'people' },
];

const CATEGORY_TITLES = {
  people: 'Smileys & people',
  nature: 'Animals & nature',
  food: 'Food & drink',
  activity: 'Activity',
  travel: 'Travel & places',
  objects: 'Objects',
  symbols: 'Symbols',
  flags: 'Flags',
};

export const MAX_SEARCH_RESULTS = 120;

/**
 * The sections the picker shows: the common emoji, then every category in the
 * order the host sent them; or, for a search, one section of matches, names
 * that start with the query first.
 */
export const emojiSections = (emojis, query = '') => {
  const term = query.trim().toLowerCase().replace(/^:|:$/g, '');
  if (term) {
    const starts = [];
    const contains = [];
    emojis.forEach(entry => {
      if (entry.name.startsWith(term)) starts.push(entry);
      else if (entry.name.includes(term) || entry.description.toLowerCase().includes(term))
        contains.push(entry);
    });
    return [
      {
        id: 'search',
        title: 'Search results',
        emojis: [...starts, ...contains].slice(0, MAX_SEARCH_RESULTS),
      },
    ];
  }
  const byName = new Map(emojis.map(entry => [entry.name, entry]));
  const common = COMMON_EMOJI.map(entry => byName.get(entry.name) ?? entry);
  const sections = [{ id: 'common', title: 'Common', emojis: common }];
  emojis.forEach(entry => {
    let section = sections[sections.length - 1];
    if (section.id !== entry.category) {
      section = {
        id: entry.category,
        title: CATEGORY_TITLES[entry.category] ?? entry.category,
        emojis: [],
      };
      sections.push(section);
    }
    section.emojis.push(entry);
  });
  return sections;
};

/**
 * Wraps `load: () => Promise<EmojiEntry[]>` so the list is asked for once per
 * webview. A failure is not kept, so the next open asks again, and answers
 * with the common emoji and `error`.
 */
export const createEmojiLoader = load => {
  let loaded;
  return async () => {
    if (!loaded) {
      loaded = Promise.resolve()
        .then(load)
        .then(emojis => {
          if (!emojis?.length) throw new Error('no emoji');
          return { emojis };
        });
      loaded.catch(() => {
        loaded = undefined;
      });
    }
    try {
      return await loaded;
    } catch (e) {
      return { emojis: COMMON_EMOJI, error: 'Only common emoji are available.' };
    }
  };
};

const joinNames = names => {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

/** "You, Alice and Bob reacted with :thumbsup:" */
export const reactionTitle = group => {
  // `users` are the others; the host leaves the current user out
  const names = group.mine ? ['You', ...group.users] : group.users;
  const hidden = group.count - names.length;
  const listed = hidden > 0 ? [...names, `${hidden} more`] : names;
  return `${joinNames(listed) || 'Nobody'} reacted with :${group.name}:`;
};

/** the groups as they will be once `name` is turned `on` or off by the current user */
export const toggleGroups = (groups, name, on, emoji) => {
  const index = groups.findIndex(group => group.name === name);
  if (on) {
    if (index === -1) return [...groups, { name, emoji, count: 1, users: [], mine: true }];
    if (groups[index].mine) return groups;
    return groups.map((g, i) => (i === index ? { ...g, count: g.count + 1, mine: true } : g));
  }
  if (index === -1 || !groups[index].mine) return groups;
  if (groups[index].count <= 1) return groups.filter((_, i) => i !== index);
  return groups.map((g, i) => (i === index ? { ...g, count: g.count - 1, mine: false } : g));
};
