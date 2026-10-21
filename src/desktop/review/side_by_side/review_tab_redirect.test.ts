import * as vscode from 'vscode';
import { handleError } from '../../../common/errors/handle_error';
import { toReviewUri } from '../review_uri';
import { expectPlainReviewEditor, registerReviewTabRedirect } from './review_tab_redirect';

jest.mock('../../../common/errors/handle_error');

const reviewUri = (path: string) =>
  toReviewUri({
    path,
    exists: true,
    commit: 'abc',
    repositoryRoot: '/repo',
    projectId: 1,
    mrId: 2,
  });

const plainTab = (uri: vscode.Uri) => ({ input: new vscode.TabInputText(uri) }) as vscode.Tab;
const diffTab = (uri: vscode.Uri) =>
  ({ input: new vscode.TabInputTextDiff(uri, uri) }) as vscode.Tab;

const editorOn = (uri: vscode.Uri, line: number) =>
  ({
    document: { uri },
    selection: { active: { line } },
  }) as unknown as vscode.TextEditor;

describe('registerReviewTabRedirect', () => {
  let onTabs: (e: Partial<vscode.TabChangeEvent>) => void;
  let openSideBySide: jest.Mock;
  const { window } = vscode as unknown as {
    window: {
      visibleTextEditors: vscode.TextEditor[];
      tabGroups: { all: { tabs: vscode.Tab[] }[] };
    };
  };

  const flush = () =>
    new Promise(resolve => {
      setImmediate(resolve);
    });

  beforeEach(() => {
    openSideBySide = jest.fn().mockResolvedValue(undefined);
    jest.mocked(vscode.window.tabGroups.onDidChangeTabs).mockImplementation(listener => {
      onTabs = listener as typeof onTabs;
      return { dispose: jest.fn() };
    });
    jest.mocked(vscode.window.tabGroups.close).mockReset();
    window.visibleTextEditors = [];
    window.tabGroups.all = [];
    registerReviewTabRedirect(openSideBySide);
  });

  it('replaces a plain review tab with the side-by-side view on its line', async () => {
    const uri = reviewUri('/src/a.ts');
    const tab = plainTab(uri);
    window.visibleTextEditors = [editorOn(uri, 41)];
    window.tabGroups.all = [{ tabs: [tab] }];

    onTabs({ opened: [tab] });
    await flush();

    expect(openSideBySide).toHaveBeenCalledWith(uri, 42);
    expect(vscode.window.tabGroups.close).toHaveBeenCalledWith([tab]);
  });

  it('waits for the editor of a tab that has none yet', async () => {
    const uri = reviewUri('/src/a.ts');
    let onEditors: () => void = () => {};
    jest.mocked(vscode.window.onDidChangeVisibleTextEditors).mockImplementation(listener => {
      onEditors = listener as () => void;
      return { dispose: jest.fn() };
    });

    onTabs({ opened: [plainTab(uri)] });
    await flush();
    expect(openSideBySide).not.toHaveBeenCalled();

    window.visibleTextEditors = [editorOn(uri, 9)];
    onEditors();
    await flush();

    expect(openSideBySide).toHaveBeenCalledWith(uri, 10);
  });

  it('waits for the selection of an editor that opens at the top', async () => {
    const uri = reviewUri('/src/a.ts');
    const editor = editorOn(uri, 0);
    window.visibleTextEditors = [editor];
    let onSelection: () => void = () => {};
    jest.mocked(vscode.window.onDidChangeTextEditorSelection).mockImplementation(listener => {
      onSelection = listener as () => void;
      return { dispose: jest.fn() };
    });

    onTabs({ opened: [plainTab(uri)] });
    await flush();
    expect(openSideBySide).not.toHaveBeenCalled();

    (editor.selection.active as { line: number }).line = 475;
    onSelection();
    await flush();

    expect(openSideBySide).toHaveBeenCalledWith(uri, 476);
  });

  it('opens a thread on the first line once no selection comes', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const uri = reviewUri('/src/a.ts');
      window.visibleTextEditors = [editorOn(uri, 0)];

      onTabs({ opened: [plainTab(uri)] });
      await flush();
      expect(openSideBySide).not.toHaveBeenCalled();

      jest.advanceTimersByTime(500);
      await flush();

      expect(openSideBySide).toHaveBeenCalledWith(uri, 1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('leaves a diff tab alone', async () => {
    onTabs({ opened: [diffTab(reviewUri('/src/a.ts'))] });
    await flush();

    expect(openSideBySide).not.toHaveBeenCalled();
  });

  it('leaves a plain tab of another scheme alone', async () => {
    onTabs({ opened: [plainTab(vscode.Uri.file('/repo/src/a.ts'))] });
    await flush();

    expect(openSideBySide).not.toHaveBeenCalled();
  });

  it('leaves a tab the extension opened on purpose alone', async () => {
    const uri = reviewUri('/src/a.ts');
    window.visibleTextEditors = [editorOn(uri, 0)];

    expectPlainReviewEditor(uri);
    onTabs({ opened: [plainTab(uri)] });
    await flush();

    expect(openSideBySide).not.toHaveBeenCalled();
  });

  it('keeps the tab and reports the error when the view cannot open', async () => {
    const uri = reviewUri('/src/a.ts');
    const error = new Error('not loaded');
    openSideBySide.mockRejectedValue(error);
    window.visibleTextEditors = [editorOn(uri, 3)];

    onTabs({ opened: [plainTab(uri)] });
    await flush();

    expect(handleError).toHaveBeenCalledWith(error);
    expect(vscode.window.tabGroups.close).not.toHaveBeenCalled();
  });
});
