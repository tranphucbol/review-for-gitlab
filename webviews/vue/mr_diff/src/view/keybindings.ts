/**
 * The keys the panes take over, which the host resolves from VS Code's keybindings. Kept apart
 * from the Monaco runtime so the app can store them before Monaco loads.
 */
export type DiffAction =
  | 'nextChange'
  | 'previousChange'
  | 'commentOnLine'
  | 'goToDefinition'
  | 'findReferences'
  | 'goToSource';

export interface DiffKeybinding {
  /** VS Code's syntax for this platform: `cmd+b`, `shift+f7`, `ctrl+k ctrl+d` */
  key: string;
  action: DiffAction;
  /** only `editorLangId` comparisons, which Monaco checks itself */
  when?: string;
}

/** One chord of a key, with Monaco's names: `ctrlCmd` is Cmd on macOS and Ctrl elsewhere. */
export interface KeyChordParts {
  ctrlCmd: boolean;
  shift: boolean;
  alt: boolean;
  winCtrl: boolean;
  /** the name of the key in Monaco's `KeyCode` enum */
  keyCode: string;
}

let keybindings: DiffKeybinding[] = [];

const listeners = new Set<() => void>();

export const diffKeybindings = (): DiffKeybinding[] => keybindings;

export const setDiffKeybindings = (next: DiffKeybinding[]) => {
  keybindings = next;
  listeners.forEach(listener => listener());
};

export const onDiffKeybindingsChange = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const NAMED_KEYS: Record<string, string> = {
  enter: 'Enter',
  escape: 'Escape',
  space: 'Space',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  up: 'UpArrow',
  down: 'DownArrow',
  left: 'LeftArrow',
  right: 'RightArrow',
  ';': 'Semicolon',
  '=': 'Equal',
  ',': 'Comma',
  '-': 'Minus',
  '.': 'Period',
  '/': 'Slash',
  '`': 'Backquote',
  '[': 'BracketLeft',
  '\\': 'Backslash',
  ']': 'BracketRight',
  "'": 'Quote',
};

const keyCodeName = (key: string): string | undefined => {
  if (/^[a-z]$/.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  if (/^f([1-9]|1[0-9])$/.test(key)) return key.toUpperCase();
  if (/^numpad[0-9]$/.test(key)) return `Numpad${key.slice(-1)}`;
  return NAMED_KEYS[key];
};

/**
 * Splits a VS Code key into chords. `cmd` is the Command key on macOS; `ctrl` is the primary
 * modifier everywhere else. A key the panes cannot express gives `undefined`.
 */
export const parseKey = (key: string, isMac: boolean): KeyChordParts[] | undefined => {
  const chords = key.trim().toLowerCase().split(/\s+/);
  if (chords.length > 2) return undefined;
  const parsed: KeyChordParts[] = [];
  for (const chord of chords) {
    // `ctrl+-` and `ctrl++` end in the key itself
    const match = /^((?:[a-z]+\+)*)(.+)$/.exec(chord);
    const keyCode = match && keyCodeName(match[2]);
    if (!match || !keyCode) return undefined;
    const parts: KeyChordParts = {
      ctrlCmd: false,
      shift: false,
      alt: false,
      winCtrl: false,
      keyCode,
    };
    for (const modifier of match[1].split('+').filter(Boolean)) {
      if (modifier === 'shift') parts.shift = true;
      else if (modifier === 'alt') parts.alt = true;
      else if (modifier === 'ctrl') parts[isMac ? 'winCtrl' : 'ctrlCmd'] = true;
      else if (['cmd', 'meta', 'win'].includes(modifier))
        parts[isMac ? 'ctrlCmd' : 'winCtrl'] = true;
      else return undefined;
    }
    parsed.push(parts);
  }
  return parsed;
};
