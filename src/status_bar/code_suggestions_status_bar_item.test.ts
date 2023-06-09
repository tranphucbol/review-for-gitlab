import * as vscode from 'vscode';
import { CodeSuggestionsStatusBarItem } from './code_suggestions_status_bar_item';
import {
  CodeCompletionState,
  CodeCompletionStateManager,
} from '../completion/code_completion_state';
import { asMock } from '../test_utils/as_mock';

jest.mock('../extension_state');
jest.mock('../completion/ai_code_completion');

const createFakeItem = (): vscode.StatusBarItem =>
  ({
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
  } as unknown as vscode.StatusBarItem);

describe('code suggestions status bar item', () => {
  let fakeStatusBarItem: vscode.StatusBarItem;
  let codeCompletionStateManager: CodeCompletionStateManager;
  let codeSuggestionsStatusBarItem: CodeSuggestionsStatusBarItem;

  beforeEach(() => {
    asMock(vscode.window.createStatusBarItem).mockImplementation(() => {
      fakeStatusBarItem = createFakeItem();
      return fakeStatusBarItem;
    });

    codeCompletionStateManager = new CodeCompletionStateManager();
    codeSuggestionsStatusBarItem = new CodeSuggestionsStatusBarItem(codeCompletionStateManager);
  });

  afterEach(() => {
    codeSuggestionsStatusBarItem.dispose();
  });

  it('renders as disabled by default', () => {
    expect(fakeStatusBarItem.text).toBe('$(gitlab-code-suggestions-disabled)');
  });

  it('updates when state manager changes state', () => {
    codeCompletionStateManager.setState(CodeCompletionState.OK);
    expect(fakeStatusBarItem.text).toBe('$(gitlab-code-suggestions-enabled)');
  });
});
