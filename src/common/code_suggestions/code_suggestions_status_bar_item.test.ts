import * as vscode from 'vscode';
import { CodeSuggestionsStatusBarItem } from './code_suggestions_status_bar_item';
import { CodeSuggestionsStateManager, GlobalCodeSuggestionsState } from './code_suggestions_state';

jest.mock('./code_suggestions');

const createFakeItem = (): vscode.StatusBarItem =>
  ({
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
  }) as unknown as vscode.StatusBarItem;

describe('code suggestions status bar item', () => {
  let fakeStatusBarItem: vscode.StatusBarItem;
  let codeSuggestionsStateManager: CodeSuggestionsStateManager;
  let codeSuggestionsStatusBarItem: CodeSuggestionsStatusBarItem;

  beforeEach(() => {
    jest.mocked(vscode.window.createStatusBarItem).mockImplementation(() => {
      fakeStatusBarItem = createFakeItem();
      return fakeStatusBarItem;
    });

    codeSuggestionsStateManager = new CodeSuggestionsStateManager();
    codeSuggestionsStatusBarItem = new CodeSuggestionsStatusBarItem(codeSuggestionsStateManager);
  });

  afterEach(() => {
    codeSuggestionsStatusBarItem.dispose();
  });

  it('renders as disabled by default', () => {
    expect(fakeStatusBarItem.text).toBe('$(gitlab-code-suggestions-disabled)');
  });

  it('updates when state manager changes state', () => {
    codeSuggestionsStateManager.setGlobalState(GlobalCodeSuggestionsState.READY);
    expect(fakeStatusBarItem.text).toBe('$(gitlab-code-suggestions-enabled)');
  });
});
