import {
  evaluateWhen,
  normalizeKey,
  parseJsonc,
  resolveDiffKeybindings,
  KeybindingEntry,
} from './diff_keybindings';

describe('diff keybindings', () => {
  describe('evaluateWhen', () => {
    it.each`
      when                                                      | expected
      ${undefined}                                              | ${{ matches: true }}
      ${'editorTextFocus'}                                      | ${{ matches: true }}
      ${'textCompareEditorVisible && !inReferenceSearchEditor'} | ${{ matches: true }}
      ${"activeWebviewPanelId == 'gitlab.mergeRequestDiff'"}    | ${{ matches: true }}
      ${'editorTextFocus && !editorReadonly'}                   | ${{ matches: false }}
      ${"activeWebviewPanelId == 'somethingElse'"}              | ${{ matches: false }}
      ${'editorLangId == java && editorTextFocus'}              | ${{ matches: true, when: "editorLangId == 'java'" }}
      ${"debugState != 'inactive'"}                             | ${undefined}
      ${'editorTextFocus || terminalFocus'}                     | ${undefined}
      ${'javaLSReady && editorTextFocus'}                       | ${undefined}
    `('decides $when for a pane', ({ when, expected }) => {
      expect(evaluateWhen(when)).toEqual(expected);
    });
  });

  it('spells a key one way', () => {
    expect(normalizeKey('Shift+Ctrl+F7')).toBe('ctrl+shift+f7');
    expect(normalizeKey('cmd+k  cmd+d')).toBe('cmd+k cmd+d');
  });

  describe('resolveDiffKeybindings', () => {
    const own: KeybindingEntry[] = [
      {
        command: 'gl.sideBySideNextChange',
        key: 'f7',
        when: "activeWebviewPanelId == 'gitlab.mergeRequestDiff'",
      },
      {
        command: 'gl.sideBySideCommentOnLine',
        key: 'ctrl+enter',
        mac: 'cmd+enter',
        when: "activeWebviewPanelId == 'gitlab.mergeRequestDiff'",
      },
    ];

    it('takes the key for the platform', () => {
      expect(resolveDiffKeybindings([own], 'mac')).toEqual([
        { key: 'f7', action: 'nextChange' },
        { key: 'cmd+enter', action: 'commentOnLine' },
      ]);
      expect(resolveDiffKeybindings([own], 'linux')).toContainEqual({
        key: 'ctrl+enter',
        action: 'commentOnLine',
      });
    });

    it("follows a keymap extension's diff and navigation keys", () => {
      const keymap: KeybindingEntry[] = [
        {
          command: 'editor.action.goToDeclaration',
          key: 'ctrl+b',
          mac: 'cmd+b',
          when: 'editorTextFocus',
        },
        {
          command: 'workbench.action.debug.stepInto',
          key: 'f7',
          when: "debugState != 'inactive'",
        },
        {
          command: 'editor.action.referenceSearch.trigger',
          key: 'alt+ctrl+f7',
          mac: 'alt+cmd+f7',
          when: 'editorHasReferenceProvider && editorTextFocus && !inReferenceSearchEditor',
        },
      ];

      expect(resolveDiffKeybindings([own, keymap], 'mac')).toEqual([
        { key: 'f7', action: 'nextChange' },
        { key: 'cmd+enter', action: 'commentOnLine' },
        { key: 'cmd+b', action: 'goToDefinition' },
        { key: 'alt+cmd+f7', action: 'findReferences' },
      ]);
    });

    it('applies the user keybindings last, with removals', () => {
      const user: KeybindingEntry[] = [
        { command: '-gl.sideBySideNextChange', key: 'f7' },
        { command: 'workbench.action.compareEditor.nextChange', key: 'alt+down' },
        { command: 'workbench.action.toggleSidebarVisibility', key: 'cmd+enter' },
      ];

      expect(resolveDiffKeybindings([own, user], 'mac')).toEqual([
        { key: 'alt+down', action: 'nextChange' },
      ]);
    });

    it('keeps a language condition for the pane to check', () => {
      const entries: KeybindingEntry[] = [
        { command: 'editor.action.revealDefinition', key: 'f4', when: 'editorLangId == go' },
      ];

      expect(resolveDiffKeybindings([entries], 'linux')).toEqual([
        { key: 'f4', action: 'goToDefinition', when: "editorLangId == 'go'" },
      ]);
    });
  });

  it('reads keybindings.json with comments and trailing commas', () => {
    const text = `// Place your key bindings in this file
[
  /* next */ { "key": "alt+down", "command": "gl.sideBySideNextChange", },
  { "key": "ctrl+/", "command": "a//b" },
]`;

    expect(parseJsonc(text)).toEqual([
      { key: 'alt+down', command: 'gl.sideBySideNextChange' },
      { key: 'ctrl+/', command: 'a//b' },
    ]);
  });
});
