import * as vscode from 'vscode';
import { log } from '../../../common/log';
import { TokenRule } from './messages';

/** A `tokenColors` entry of a VS Code colour theme. */
export interface TextMateRule {
  scope?: string | string[];
  settings?: { foreground?: string; fontStyle?: string };
}

interface ThemeContribution {
  id?: string;
  label?: string;
  uiTheme?: string;
  path?: string;
}

interface ThemeFile {
  include?: string;
  tokenColors?: TextMateRule[] | string;
  settings?: TextMateRule[];
}

/**
 * The TextMate scopes that VS Code's grammars give the code Monaco's tokenizers call by these
 * names, most fitting first. Monaco matches a rule by prefix, so `keyword` also colours
 * `keyword.ts`, and a rule with a language suffix wins over one without.
 */
const MONARCH_SCOPES: Record<string, string[]> = {
  comment: ['comment'],
  'comment.doc': ['comment.block.documentation', 'comment'],
  string: ['string'],
  'string.escape': ['constant.character.escape', 'string'],
  'string.link': ['markup.underline.link', 'string'],
  regexp: ['string.regexp', 'string'],
  number: ['constant.numeric'],
  keyword: ['keyword', 'storage.type', 'keyword.control'],
  operator: ['keyword.operator'],
  type: ['support.type', 'entity.name.type', 'storage.type'],
  'type.identifier': ['entity.name.type', 'entity.name.class', 'support.class'],
  identifier: ['variable.other.readwrite', 'variable'],
  variable: ['variable'],
  'variable.predefined': ['variable.language', 'variable'],
  predefined: ['support.function', 'entity.name.function'],
  constant: ['constant.language', 'constant'],
  annotation: ['entity.name.function.decorator', 'storage.type.annotation', 'meta.decorator'],
  tag: ['entity.name.tag'],
  metatag: ['entity.name.tag', 'meta.tag'],
  'attribute.name': ['entity.other.attribute-name'],
  'attribute.value': ['string'],
  delimiter: ['punctuation'],
  strong: ['markup.bold'],
  emphasis: ['markup.italic'],
  'keyword.md': ['markup.heading', 'entity.name.section'],
  // Monaco's YAML tokenizer calls a key a type
  'type.yaml': ['entity.name.tag.yaml', 'entity.name.tag'],
};

/** The scopes VS Code colours for each shorthand of `editor.tokenColorCustomizations`. */
const CUSTOMIZATION_SCOPES: Record<string, string[]> = {
  comments: ['comment', 'punctuation.definition.comment'],
  strings: ['string', 'meta.embedded.assembly'],
  keywords: ['keyword', 'keyword.control', 'storage', 'storage.type'],
  numbers: ['constant.numeric'],
  types: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class'],
  functions: ['entity.name.function', 'support.function'],
  variables: ['variable', 'entity.name.variable'],
};

const HEX_COLOR = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Monaco wants `rrggbb` without the hash; alpha is dropped. */
const toMonacoColor = (color: string): string | undefined => {
  if (!HEX_COLOR.test(color)) return undefined;
  const hex = color.slice(1);
  if (hex.length <= 4) return [...hex.slice(0, 3)].map(c => c + c).join('');
  return hex.slice(0, 6);
};

const skipString = (text: string, start: number): number => {
  let i = start + 1;
  while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
  return i + 1;
};

/** Parses JSON with comments and trailing commas, the format of VS Code theme files. */
export const parseJsonc = (text: string): unknown => {
  let withoutComments = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '"') {
      const end = skipString(text, i);
      withoutComments += text.slice(i, end);
      i = end;
    } else if (text.startsWith('//', i)) {
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end;
    } else if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 2;
    } else {
      withoutComments += text[i];
      i += 1;
    }
  }
  let json = '';
  i = 0;
  while (i < withoutComments.length) {
    const char = withoutComments[i];
    if (char === '"') {
      const end = skipString(withoutComments, i);
      json += withoutComments.slice(i, end);
      i = end;
    } else {
      const trailingComma = char === ',' && /^\s*[}\]]/.test(withoutComments.slice(i + 1));
      if (!trailingComma) json += char;
      i += 1;
    }
  }
  return JSON.parse(json);
};

/** Plain selectors only: a descendant (`a b`) or excluding (`a - b`) one could colour code the grammar would not. */
const selectorsOf = (rule: TextMateRule): string[] => {
  const scopes = typeof rule.scope === 'string' ? rule.scope.split(',') : rule.scope ?? [];
  return scopes.map(s => s.trim()).filter(s => s && !/[\s-]/.test(s));
};

const matches = (selector: string, scope: string) =>
  scope === selector || scope.startsWith(`${selector}.`);

/**
 * Resolves one scope the way TextMate does for single-scope selectors: the most specific
 * selector wins, and of equally specific ones the later rule.
 */
const resolveScope = (rules: TextMateRule[], scope: string) => {
  let foreground: { value: string; specificity: number } | undefined;
  let fontStyle: { value: string; specificity: number } | undefined;
  rules.forEach(rule => {
    selectorsOf(rule)
      .filter(selector => matches(selector, scope))
      .forEach(selector => {
        const specificity = selector.split('.').length;
        const color = rule.settings?.foreground && toMonacoColor(rule.settings.foreground);
        if (color && (!foreground || specificity >= foreground.specificity))
          foreground = { value: color, specificity };
        const style = rule.settings?.fontStyle;
        if (style !== undefined && (!fontStyle || specificity >= fontStyle.specificity))
          fontStyle = { value: style.trim(), specificity };
      });
  });
  return { foreground: foreground?.value, fontStyle: fontStyle?.value };
};

/** Turns a theme's TextMate rules into rules for the token names of Monaco's tokenizers. */
export const toMonacoRules = (rules: TextMateRule[]): TokenRule[] =>
  Object.entries(MONARCH_SCOPES).flatMap(([token, scopes]) => {
    const resolved = scopes.map(scope => resolveScope(rules, scope));
    const foreground = resolved.find(r => r.foreground)?.foreground;
    const fontStyle = resolved.find(r => r.fontStyle !== undefined)?.fontStyle;
    if (!foreground && fontStyle === undefined) return [];
    return [{ token, ...(foreground ? { foreground } : {}), ...(fontStyle ? { fontStyle } : {}) }];
  });

type Customization = string | { foreground?: string; fontStyle?: string };

/**
 * The rules of `editor.tokenColorCustomizations`, general ones first and those for the
 * theme, under `[Theme Name]`, after them.
 */
export const customizationRules = (
  customizations: Record<string, unknown> | undefined,
  themeName: string | undefined,
): TextMateRule[] => {
  const rulesOf = (section: Record<string, unknown> | undefined): TextMateRule[] => {
    if (!section) return [];
    const shorthands = Object.entries(CUSTOMIZATION_SCOPES).flatMap(([key, scopes]) => {
      const value = section[key] as Customization | undefined;
      if (!value) return [];
      const settings = typeof value === 'string' ? { foreground: value } : value;
      return [{ scope: scopes, settings }];
    });
    const textMateRules = Array.isArray(section.textMateRules)
      ? (section.textMateRules as TextMateRule[])
      : [];
    return [...shorthands, ...textMateRules];
  };
  const themeSection = themeName
    ? (customizations?.[`[${themeName}]`] as Record<string, unknown> | undefined)
    : undefined;
  return [...rulesOf(customizations), ...rulesOf(themeSection)];
};

const UI_THEME_KINDS: Record<string, vscode.ColorThemeKind> = {
  vs: vscode.ColorThemeKind.Light,
  'vs-dark': vscode.ColorThemeKind.Dark,
  'hc-black': vscode.ColorThemeKind.HighContrast,
  'hc-light': vscode.ColorThemeKind.HighContrastLight,
};

const PREFERRED_THEME_SETTING: Record<number, string> = {
  [vscode.ColorThemeKind.Light]: 'preferredLightColorTheme',
  [vscode.ColorThemeKind.Dark]: 'preferredDarkColorTheme',
  [vscode.ColorThemeKind.HighContrast]: 'preferredHighContrastColorTheme',
  [vscode.ColorThemeKind.HighContrastLight]: 'preferredHighContrastLightColorTheme',
};

interface FoundTheme {
  name: string;
  uri: vscode.Uri;
  kind?: vscode.ColorThemeKind;
}

const findTheme = (name: string): FoundTheme | undefined => {
  const found = vscode.extensions.all
    .flatMap(extension => {
      const themes = (extension.packageJSON?.contributes?.themes ?? []) as ThemeContribution[];
      return themes.map(theme => ({ extension, theme }));
    })
    .find(({ theme }) => theme.path && (theme.id === name || theme.label === name));
  if (!found?.theme.path) return undefined;
  return {
    name,
    uri: vscode.Uri.joinPath(found.extension.extensionUri, found.theme.path),
    kind: UI_THEME_KINDS[found.theme.uiTheme ?? ''],
  };
};

/**
 * The theme VS Code shows: `workbench.colorTheme`, unless VS Code follows the operating
 * system and switched to the preferred theme of another kind.
 */
const findActiveTheme = (): FoundTheme | undefined => {
  const workbench = vscode.workspace.getConfiguration('workbench');
  const { kind } = vscode.window.activeColorTheme;
  const candidates = [
    workbench.get<string>('colorTheme'),
    workbench.get<string>(PREFERRED_THEME_SETTING[kind] ?? ''),
  ].filter((name): name is string => Boolean(name));
  const themes = candidates.map(findTheme).filter((t): t is FoundTheme => Boolean(t));
  return themes.find(t => t.kind === kind) ?? themes[0];
};

const MAX_INCLUDE_DEPTH = 5;

const readJsonc = async (uri: vscode.Uri) =>
  parseJsonc(new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)));

/** The TextMate rules of a theme file, after those of the files it includes. */
const readThemeRules = async (uri: vscode.Uri, depth = 0): Promise<TextMateRule[]> => {
  if (depth > MAX_INCLUDE_DEPTH || !uri.path.endsWith('.json')) return [];
  const theme = (await readJsonc(uri)) as ThemeFile;
  const included = theme.include
    ? await readThemeRules(vscode.Uri.joinPath(uri, '..', theme.include), depth + 1)
    : [];
  if (Array.isArray(theme.tokenColors)) return [...included, ...theme.tokenColors];
  if (typeof theme.tokenColors === 'string' && theme.tokenColors.endsWith('.json')) {
    const tokenColors = (await readJsonc(vscode.Uri.joinPath(uri, '..', theme.tokenColors))) as
      | TextMateRule[]
      | ThemeFile;
    if (Array.isArray(tokenColors)) return [...included, ...tokenColors];
    const own = Array.isArray(tokenColors.tokenColors)
      ? tokenColors.tokenColors
      : tokenColors.settings;
    return [...included, ...(own ?? [])];
  }
  // a .tmTheme property list is not read; Monaco's own colours for the theme kind stay
  return included;
};

/**
 * The syntax colours of the active VS Code theme, for Monaco. A webview only receives the
 * workbench colours as CSS variables; the token colours live in the theme's file. Semantic
 * highlighting is not reproduced.
 */
export const loadTokenRules = async (): Promise<TokenRule[]> => {
  const theme = findActiveTheme();
  let rules: TextMateRule[] = [];
  if (theme) {
    try {
      rules = await readThemeRules(theme.uri);
    } catch (e) {
      log.warn(`Side-by-side diff couldn't read the colour theme ${theme.name}.`, e as Error);
    }
  }
  const customizations = vscode.workspace
    .getConfiguration('editor')
    .get<Record<string, unknown>>('tokenColorCustomizations');
  return toMonacoRules([...rules, ...customizationRules(customizations, theme?.name)]);
};
