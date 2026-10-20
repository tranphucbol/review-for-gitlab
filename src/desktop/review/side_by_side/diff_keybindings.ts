import * as path from 'path';
import * as vscode from 'vscode';
import { log } from '../../../common/log';
import { WEBVIEW_MR_DIFF } from '../../constants';
import { DiffAction, DiffKeybinding } from './messages';

/** A keybinding as `contributes.keybindings` and `keybindings.json` write it. */
export interface KeybindingEntry {
  key?: string;
  mac?: string;
  linux?: string;
  win?: string;
  command?: string;
  when?: string;
}

export type KeyPlatform = 'mac' | 'linux' | 'win';

/**
 * The commands whose keys the panes take over, and what each does there. VS Code's own diff and
 * code navigation commands are listed so that a keymap extension, or a key the user rebound,
 * reaches the side-by-side diff the way it reaches the native one.
 */
const ACTIONS: Record<string, DiffAction> = {
  'gl.sideBySideNextChange': 'nextChange',
  'gl.sideBySidePreviousChange': 'previousChange',
  'gl.sideBySideCommentOnLine': 'commentOnLine',
  'gl.sideBySideGoToDefinition': 'goToDefinition',
  'workbench.action.compareEditor.nextChange': 'nextChange',
  'workbench.action.compareEditor.previousChange': 'previousChange',
  'editor.action.revealDefinition': 'goToDefinition',
  'editor.action.revealDeclaration': 'goToDefinition',
  'editor.action.goToDeclaration': 'goToDefinition',
  'editor.action.goToReferences': 'findReferences',
  'editor.action.referenceSearch.trigger': 'findReferences',
  'references-view.findReferences': 'findReferences',
};

/** VS Code's default keys for the listed commands that no extension contributes. */
const VS_CODE_DEFAULTS: KeybindingEntry[] = [
  {
    key: 'alt+f5',
    command: 'workbench.action.compareEditor.nextChange',
    when: 'textCompareEditorVisible',
  },
  {
    key: 'shift+alt+f5',
    command: 'workbench.action.compareEditor.previousChange',
    when: 'textCompareEditorVisible',
  },
];

/**
 * What a `when` clause can rely on while a pane of the side-by-side diff has focus: a focused,
 * read-only text editor that stands for a diff. A clause naming anything else cannot be decided
 * here, so its binding is left to VS Code.
 */
const PANE_CONTEXT: Record<string, boolean | string> = {
  activeWebviewPanelId: WEBVIEW_MR_DIFF,
  sideBarFocus: false,
  panelFocus: false,
  editorFocus: true,
  editorTextFocus: true,
  textInputFocus: true,
  editorReadonly: true,
  textCompareEditorVisible: true,
  isInDiffEditor: true,
  editorHasDefinitionProvider: true,
  editorHasDeclarationProvider: true,
  editorHasReferenceProvider: true,
  inReferenceSearchEditor: false,
  referenceSearchVisible: false,
  isInEmbeddedEditor: false,
};

/** The one context key a pane decides itself: the language of the file it shows. */
const LANGUAGE_KEY = 'editorLangId';

const TERM = /^(!?)\s*([\w.:-]+)$/;
const COMPARISON = /^([\w.:-]+)\s*(==|!=)\s*(?:'([^']*)'|"([^"]*)"|([\w.:/-]+))$/;

type WhenResult = { matches: false } | { matches: true; when?: string };

/**
 * Decides a `when` clause for a pane. Only `&&` of known keys is understood; `editorLangId`
 * comparisons are kept for the pane to check against its file.
 */
export const evaluateWhen = (when: string | undefined): WhenResult | undefined => {
  if (!when?.trim()) return { matches: true };
  if (/\|\||[()]|=~|<|>|\bin\b/.test(when)) return undefined;
  const languageTerms: string[] = [];
  let matches = true;
  for (const raw of when.split('&&')) {
    const term = raw.trim();
    const comparison = COMPARISON.exec(term);
    if (comparison) {
      const [, key, operator, single, double, bare] = comparison;
      const value = single ?? double ?? bare;
      if (key === LANGUAGE_KEY) {
        languageTerms.push(`${LANGUAGE_KEY} ${operator} '${value}'`);
      } else if (key in PANE_CONTEXT) {
        const equal = String(PANE_CONTEXT[key]) === value;
        if (equal !== (operator === '==')) matches = false;
      } else {
        return undefined;
      }
    } else {
      const simple = TERM.exec(term);
      if (!simple || !(simple[2] in PANE_CONTEXT)) return undefined;
      const value = Boolean(PANE_CONTEXT[simple[2]]);
      if (value === Boolean(simple[1])) matches = false;
    }
  }
  if (!matches) return { matches: false };
  return languageTerms.length ? { matches: true, when: languageTerms.join(' && ') } : { matches };
};

const MODIFIER_ORDER = ['ctrl', 'shift', 'alt', 'cmd', 'meta', 'win'];

/** One spelling per key, so `shift+ctrl+f7` and `ctrl+shift+f7` are the same key. */
export const normalizeKey = (key: string): string =>
  key
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(chord => {
      const parts = chord.split('+');
      const keyCode = parts.pop() ?? '';
      const modifiers = parts.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b));
      return [...modifiers, keyCode].join('+');
    })
    .join(' ');

const keyFor = (entry: KeybindingEntry, platform: KeyPlatform) => entry[platform] ?? entry.key;

/**
 * Works out the keys a pane handles, in VS Code's order: its defaults, then extensions, then the
 * user's `keybindings.json`. A later binding of a key the pane can decide replaces the earlier
 * ones; `-command` removes a binding. A key whose last binding runs some other command is not
 * taken, so VS Code still runs that command.
 */
export const resolveDiffKeybindings = (
  layers: KeybindingEntry[][],
  platform: KeyPlatform,
): DiffKeybinding[] => {
  let resolved: (DiffKeybinding & { command: string })[] = [];
  layers.flat().forEach(entry => {
    const rawKey = keyFor(entry, platform);
    const { command } = entry;
    if (!command) return;
    if (command.startsWith('-')) {
      const removed = command.slice(1);
      const key = rawKey && normalizeKey(rawKey);
      resolved = resolved.filter(b => b.command !== removed || (key && b.key !== key));
      return;
    }
    if (!rawKey) return;
    const result = evaluateWhen(entry.when);
    if (!result?.matches) return;
    const key = normalizeKey(rawKey);
    const action = ACTIONS[command];
    if (!result.when) resolved = resolved.filter(b => b.key !== key);
    if (action) resolved.push({ key, action, command, ...(result.when && { when: result.when }) });
  });
  return resolved.map(({ key, action, when }) => ({ key, action, ...(when && { when }) }));
};

/** `keybindings.json` is JSON with comments and trailing commas. */
export const parseJsonc = (text: string): unknown => {
  let result = '';
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === '"') {
      const start = i;
      i += 1;
      while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
      i += 1;
      result += text.slice(start, i);
    } else if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
    } else if (char === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
    } else {
      result += char;
      i += 1;
    }
  }
  return JSON.parse(result.replace(/,(\s*[}\]])/g, '$1'));
};

const currentPlatform = (): KeyPlatform => {
  if (process.platform === 'darwin') return 'mac';
  if (process.platform === 'win32') return 'win';
  return 'linux';
};

let userKeybindingsUri: vscode.Uri | undefined;

/**
 * Remembers where the user's `keybindings.json` is: two folders above the extension's global
 * storage. A profile with its own keybindings keeps them elsewhere, and those are not read.
 */
export const initDiffKeybindings = (context: vscode.ExtensionContext): void => {
  const storage = context.globalStorageUri;
  userKeybindingsUri =
    storage?.scheme === 'file'
      ? vscode.Uri.file(path.join(storage.fsPath, '..', '..', 'keybindings.json'))
      : undefined;
};

const readUserKeybindings = async (): Promise<KeybindingEntry[]> => {
  if (!userKeybindingsUri) return [];
  let text: string;
  try {
    text = new TextDecoder().decode(await vscode.workspace.fs.readFile(userKeybindingsUri));
  } catch {
    return [];
  }
  try {
    const parsed = parseJsonc(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    log.warn(
      "Side-by-side diff couldn't read keybindings.json; it uses the default keys.",
      e as Error,
    );
    return [];
  }
};

const contributedKeybindings = (): KeybindingEntry[] =>
  vscode.extensions.all.flatMap(extension => {
    const keybindings = extension.packageJSON?.contributes?.keybindings;
    if (Array.isArray(keybindings)) return keybindings;
    return keybindings ? [keybindings] : [];
  });

/** The keys the panes of a side-by-side diff handle, as VS Code would resolve them in a diff. */
export const loadDiffKeybindings = async (): Promise<DiffKeybinding[]> =>
  resolveDiffKeybindings(
    [VS_CODE_DEFAULTS, contributedKeybindings(), await readUserKeybindings()],
    currentPlatform(),
  );
