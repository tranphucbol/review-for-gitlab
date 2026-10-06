import * as vscode from 'vscode';
import {
  customizationRules,
  loadTokenRules,
  parseJsonc,
  TextMateRule,
  toMonacoRules,
} from './color_theme_tokens';

jest.mock('../../../common/log');

const ruleFor = (rules: ReturnType<typeof toMonacoRules>, token: string) =>
  rules.find(r => r.token === token);

describe('parseJsonc', () => {
  it('ignores comments and trailing commas outside strings', () => {
    const text = `{
      // a comment
      "name": "One // Dark", /* block */
      "url": "http://x/*y*/",
      "list": [1, 2,],
      "quote": "a\\"b,}",
    }`;

    expect(parseJsonc(text)).toEqual({
      name: 'One // Dark',
      url: 'http://x/*y*/',
      list: [1, 2],
      quote: 'a"b,}',
    });
  });
});

describe('toMonacoRules', () => {
  const oneDark: TextMateRule[] = [
    { settings: { foreground: '#abb2bf' } },
    { scope: 'comment', settings: { foreground: '#5c6370', fontStyle: 'italic' } },
    { scope: ['string', 'string.quoted'], settings: { foreground: '#98c379' } },
    { scope: 'keyword, storage.type', settings: { foreground: '#c678dd' } },
    { scope: 'keyword.operator', settings: { foreground: '#56b6c2' } },
    { scope: 'constant.numeric', settings: { foreground: '#D19A66FF' } },
    { scope: 'entity.name.type', settings: { foreground: '#e5c07b' } },
    { scope: 'source.ts entity.name.type', settings: { foreground: '#ff0000' } },
    { scope: 'variable - variable.parameter', settings: { foreground: '#ff0000' } },
    { scope: 'variable', settings: { foreground: '#e06c75' } },
    { scope: 'variable.other.readwrite', settings: { foreground: '#fff' } },
  ];

  it('maps the theme scopes to the token names of Monaco tokenizers', () => {
    const rules = toMonacoRules(oneDark);

    expect(ruleFor(rules, 'comment')).toEqual({
      token: 'comment',
      foreground: '5c6370',
      fontStyle: 'italic',
    });
    expect(ruleFor(rules, 'string')?.foreground).toBe('98c379');
    expect(ruleFor(rules, 'keyword')?.foreground).toBe('c678dd');
    expect(ruleFor(rules, 'operator')?.foreground).toBe('56b6c2');
    expect(ruleFor(rules, 'type.identifier')?.foreground).toBe('e5c07b');
    expect(ruleFor(rules, 'variable')?.foreground).toBe('e06c75');
  });

  it('drops alpha and expands short colours', () => {
    const rules = toMonacoRules(oneDark);

    expect(ruleFor(rules, 'number')?.foreground).toBe('D19A66');
    expect(ruleFor(rules, 'identifier')?.foreground).toBe('ffffff');
  });

  it('lets the most specific selector win, and the later rule between equals', () => {
    const rules = toMonacoRules([
      { scope: 'string', settings: { foreground: '#111111' } },
      { scope: 'string.regexp', settings: { foreground: '#222222' } },
      { scope: 'string', settings: { foreground: '#333333' } },
    ]);

    expect(ruleFor(rules, 'string')?.foreground).toBe('333333');
    expect(ruleFor(rules, 'regexp')?.foreground).toBe('222222');
  });

  it('skips descendant and excluding selectors and tokens the theme does not colour', () => {
    const rules = toMonacoRules(oneDark);

    expect(ruleFor(rules, 'tag')).toBeUndefined();
    expect(rules.map(r => r.foreground)).not.toContain('ff0000');
  });
});

describe('customizationRules', () => {
  it('reads the shorthands and TextMate rules, the theme section last', () => {
    const rules = customizationRules(
      {
        comments: '#010101',
        textMateRules: [{ scope: 'string', settings: { foreground: '#020202' } }],
        '[One Dark Pro]': { keywords: { foreground: '#030303', fontStyle: 'bold' } },
        '[Other]': { keywords: '#040404' },
      },
      'One Dark Pro',
    );

    expect(toMonacoRules(rules)).toEqual(
      expect.arrayContaining([
        { token: 'comment', foreground: '010101' },
        { token: 'string', foreground: '020202' },
        { token: 'keyword', foreground: '030303', fontStyle: 'bold' },
      ]),
    );
  });
});

describe('loadTokenRules', () => {
  const extensionUri = vscode.Uri.file('/ext/one-dark');
  const files: Record<string, string> = {
    '/ext/one-dark/themes/one-dark.json': `{
      // the theme
      "include": "./base.json",
      "tokenColors": [{ "scope": "keyword", "settings": { "foreground": "#c678dd" } },],
    }`,
    '/ext/one-dark/themes/base.json': `{
      "tokenColors": [
        { "scope": "keyword", "settings": { "foreground": "#000000" } },
        { "scope": "comment", "settings": { "foreground": "#5c6370" } }
      ]
    }`,
  };

  beforeEach(() => {
    (vscode.extensions as unknown as { all: unknown[] }).all = [
      {
        extensionUri,
        packageJSON: {
          contributes: {
            themes: [{ label: 'One Dark Pro', uiTheme: 'vs-dark', path: './themes/one-dark.json' }],
          },
        },
      },
    ];
    jest.mocked(vscode.workspace.fs.readFile).mockImplementation(async uri => {
      const text = files[uri.path];
      if (!text) throw new Error(`no file ${uri.path}`);
      return new TextEncoder().encode(text);
    });
    jest.mocked(vscode.workspace.getConfiguration).mockImplementation(
      section =>
        ({
          get: (key: string) => {
            if (section === 'workbench' && key === 'colorTheme') return 'One Dark Pro';
            if (section === 'editor' && key === 'tokenColorCustomizations')
              return { comments: '#999999' };
            return undefined;
          },
        }) as unknown as vscode.WorkspaceConfiguration,
    );
  });

  afterEach(() => {
    (vscode.extensions as unknown as { all: unknown[] }).all = [];
    jest
      .mocked(vscode.workspace.getConfiguration)
      .mockReturnValue({} as vscode.WorkspaceConfiguration);
  });

  it('reads the active theme with its includes and the user customizations', async () => {
    const rules = await loadTokenRules();

    expect(ruleFor(rules, 'keyword')?.foreground).toBe('c678dd');
    expect(ruleFor(rules, 'comment')?.foreground).toBe('999999');
  });

  it('falls back to the customizations when the theme is not installed', async () => {
    (vscode.extensions as unknown as { all: unknown[] }).all = [];

    const rules = await loadTokenRules();

    expect(rules).toEqual([
      { token: 'comment', foreground: '999999' },
      { token: 'comment.doc', foreground: '999999' },
    ]);
  });

  it('falls back to the customizations when the theme file cannot be read', async () => {
    jest.mocked(vscode.workspace.fs.readFile).mockRejectedValue(new Error('gone'));

    const rules = await loadTokenRules();

    expect(rules).toEqual([
      { token: 'comment', foreground: '999999' },
      { token: 'comment.doc', foreground: '999999' },
    ]);
  });
});
