import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codiconStyles';
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController';
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution';
import 'monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/goToCommands';
import 'monaco-editor/esm/vs/editor/contrib/gotoSymbol/browser/link/goToDefinitionAtPosition';
import 'monaco-editor/esm/vs/editor/standalone/browser/referenceSearch/standaloneReferenceSearch';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution';
import 'monaco-editor/esm/vs/basic-languages/go/go.contribution';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution';
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution';
import 'monaco-editor/esm/vs/basic-languages/shell/shell.contribution';
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker&inline';
import { onTokenRulesChange, tokenRules } from './token_theme';
import { editorFont } from './editor_font';

export { monaco };

export const PADDING_TOP = 6;
export const PADDING_BOTTOM = 6;

const THEME_NAME = 'gl-diff-theme';

(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

const EXTENSION_LANGUAGES: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'javascript',
  java: 'java',
  kt: 'java',
  go: 'go',
  py: 'python',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  markdown: 'markdown',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  xml: 'xml',
  pom: 'xml',
  xsd: 'xml',
  svg: 'xml',
};

export const languageForPath = (path: string): string => {
  const name = path.split('/').pop() ?? '';
  if (name === 'Dockerfile' || name === 'Makefile') return 'shell';
  const extension = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const language = EXTENSION_LANGUAGES[extension];
  const known = monaco.languages.getLanguages().some(l => l.id === language);
  return language && known ? language : 'plaintext';
};

const CODE_BLOCK_LANGUAGES: Record<string, string> = { golang: 'go', console: 'shell' };

/**
 * The registered language for a code block's language name (`java`, `ts`, `bash`, `golang`),
 * matched on Monaco's ids, aliases and extensions. Undefined for plain text and anything unknown.
 */
export const languageForName = (name: string): string | undefined => {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return undefined;
  const mapped = CODE_BLOCK_LANGUAGES[wanted] ?? EXTENSION_LANGUAGES[wanted] ?? wanted;
  const match = monaco.languages
    .getLanguages()
    .find(
      l =>
        l.id === mapped ||
        l.aliases?.some(alias => alias.toLowerCase() === mapped) ||
        l.extensions?.includes(`.${mapped}`),
    );
  return match && match.id !== 'plaintext' ? match.id : undefined;
};

export const cssVariable = (name: string, fallback = ''): string =>
  getComputedStyle(document.body).getPropertyValue(name).trim() || fallback;

const HEX_COLOR = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const THEME_COLORS: Record<string, string> = {
  'editor.background': '--vscode-editor-background',
  'editor.foreground': '--vscode-editor-foreground',
  'editorLineNumber.foreground': '--vscode-editorLineNumber-foreground',
  'editorLineNumber.activeForeground': '--vscode-editorLineNumber-activeForeground',
  'editor.selectionBackground': '--vscode-editor-selectionBackground',
  'editor.inactiveSelectionBackground': '--vscode-editor-inactiveSelectionBackground',
  'editor.lineHighlightBackground': '--vscode-editor-lineHighlightBackground',
  'editor.findMatchBackground': '--vscode-editor-findMatchBackground',
  'editor.findMatchHighlightBackground': '--vscode-editor-findMatchHighlightBackground',
  'editorWidget.background': '--vscode-editorWidget-background',
  'editorWidget.border': '--vscode-editorWidget-border',
  'input.background': '--vscode-input-background',
  'input.foreground': '--vscode-input-foreground',
  'scrollbarSlider.background': '--vscode-scrollbarSlider-background',
  'scrollbarSlider.hoverBackground': '--vscode-scrollbarSlider-hoverBackground',
  'scrollbarSlider.activeBackground': '--vscode-scrollbarSlider-activeBackground',
  'editorOverviewRuler.border': '--vscode-editorOverviewRuler-border',
  'editorBracketHighlight.foreground1': '--vscode-editorBracketHighlight-foreground1',
  'editorBracketHighlight.foreground2': '--vscode-editorBracketHighlight-foreground2',
  'editorBracketHighlight.foreground3': '--vscode-editorBracketHighlight-foreground3',
  'editorBracketHighlight.foreground4': '--vscode-editorBracketHighlight-foreground4',
  'editorBracketHighlight.foreground5': '--vscode-editorBracketHighlight-foreground5',
  'editorBracketHighlight.foreground6': '--vscode-editorBracketHighlight-foreground6',
  'editorBracketHighlight.unexpectedBracket.foreground':
    '--vscode-editorBracketHighlight-unexpectedBracket-foreground',
  'editorHoverWidget.background': '--vscode-editorHoverWidget-background',
  'editorHoverWidget.foreground': '--vscode-editorHoverWidget-foreground',
  'editorHoverWidget.border': '--vscode-editorHoverWidget-border',
  'editorHoverWidget.statusBarBackground': '--vscode-editorHoverWidget-statusBarBackground',
  'textLink.foreground': '--vscode-textLink-foreground',
  'textCodeBlock.background': '--vscode-textCodeBlock-background',
  'editorLink.activeForeground': '--vscode-editorLink-activeForeground',
  'peekView.border': '--vscode-peekView-border',
  'peekViewTitle.background': '--vscode-peekViewTitle-background',
  'peekViewTitleLabel.foreground': '--vscode-peekViewTitleLabel-foreground',
  'peekViewTitleDescription.foreground': '--vscode-peekViewTitleDescription-foreground',
  'peekViewResult.background': '--vscode-peekViewResult-background',
  'peekViewResult.fileForeground': '--vscode-peekViewResult-fileForeground',
  'peekViewResult.lineForeground': '--vscode-peekViewResult-lineForeground',
  'peekViewResult.matchHighlightBackground': '--vscode-peekViewResult-matchHighlightBackground',
  'peekViewResult.selectionBackground': '--vscode-peekViewResult-selectionBackground',
  'peekViewResult.selectionForeground': '--vscode-peekViewResult-selectionForeground',
  'peekViewEditor.background': '--vscode-peekViewEditor-background',
  'peekViewEditorGutter.background': '--vscode-peekViewEditorGutter-background',
  'peekViewEditor.matchHighlightBackground': '--vscode-peekViewEditor-matchHighlightBackground',
  focusBorder: '--vscode-focusBorder',
};

const baseTheme = (): monaco.editor.BuiltinTheme => {
  const { classList } = document.body;
  if (classList.contains('vscode-high-contrast-light')) return 'hc-light';
  if (classList.contains('vscode-high-contrast')) return 'hc-black';
  if (classList.contains('vscode-light')) return 'vs';
  return 'vs-dark';
};

const themeListeners = new Set<() => void>();

/** Calls the listener each time the theme is (re)applied, until the returned function is called. */
export const onThemeApplied = (listener: () => void): (() => void) => {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
};

/**
 * Builds a Monaco theme from the workbench colours the webview receives as CSS variables and
 * the syntax colours the host sends. Tokens without a colour from the theme keep Monaco's
 * colours for the theme kind.
 */
export const applyVsCodeTheme = () => {
  const colors: Record<string, string> = {};
  Object.entries(THEME_COLORS).forEach(([key, variable]) => {
    const value = cssVariable(variable);
    if (HEX_COLOR.test(value)) colors[key] = value;
  });
  monaco.editor.defineTheme(THEME_NAME, {
    base: baseTheme(),
    inherit: true,
    rules: tokenRules(),
    colors,
  });
  monaco.editor.setTheme(THEME_NAME);
  themeListeners.forEach(listener => listener());
};

/**
 * The font options of VS Code's editors: the settings the host sends, else the CSS variables
 * every webview gets (which carry no line height, ligatures or letter spacing).
 */
export const fontOptions = (): monaco.editor.IEditorOptions => {
  const font = editorFont();
  return {
    fontFamily: font?.fontFamily || cssVariable('--vscode-editor-font-family', 'monospace'),
    fontSize:
      font?.fontSize || Number.parseInt(cssVariable('--vscode-editor-font-size', '13'), 10) || 13,
    fontWeight: font?.fontWeight || cssVariable('--vscode-editor-font-weight', 'normal'),
    // Monaco derives a zero or small line height from the font size the way VS Code does
    lineHeight: font?.lineHeight ?? 0,
    letterSpacing: font?.letterSpacing ?? 0,
    fontLigatures: font?.fontLigatures ?? false,
  };
};

export const tabSize = (): number => editorFont()?.tabSize || 4;

/** The line height Monaco computed from the font options, in pixels. */
export const lineHeightOf = (editor: monaco.editor.ICodeEditor): number =>
  editor.getOption(monaco.editor.EditorOption.lineHeight);

export const createReadOnlyEditor = (
  container: HTMLElement,
  model: monaco.editor.ITextModel,
): monaco.editor.IStandaloneCodeEditor =>
  monaco.editor.create(container, {
    model,
    theme: THEME_NAME,
    readOnly: true,
    domReadOnly: true,
    // the references peek's preview copies these options, and automatic layout would size it
    // from its unsized container to 5x5 pixels; DiffView lays the panes out itself
    automaticLayout: false,
    padding: { top: PADDING_TOP, bottom: PADDING_BOTTOM },
    ...fontOptions(),
    minimap: { enabled: false },
    folding: false,
    glyphMargin: false,
    contextmenu: false,
    scrollBeyondLastLine: false,
    renderLineHighlight: 'none',
    occurrencesHighlight: 'off',
    selectionHighlight: false,
    links: false,
    // a peek needs a model of every target, the panes only have their own two
    gotoLocation: { multiple: 'goto', multipleDefinitions: 'goto' },
    hover: { enabled: true, delay: 300, sticky: true },
    lineDecorationsWidth: 14,
    overviewRulerLanes: 1,
    hideCursorInOverviewRuler: true,
    stickyScroll: { enabled: false },
    scrollbar: { alwaysConsumeMouseWheel: false, verticalScrollbarSize: 10 },
    ariaLabel: 'Merge request file',
  });

/** Re-applies the theme when VS Code changes the body's theme classes or sends new syntax colours. */
export const watchThemeChanges = (onChange: () => void): (() => void) => {
  const reapply = () => {
    applyVsCodeTheme();
    onChange();
  };
  const observer = new MutationObserver(reapply);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  const stopWatchingRules = onTokenRulesChange(reapply);
  return () => {
    observer.disconnect();
    stopWatchingRules();
  };
};
