import * as vscode from 'vscode';
import {
  CODE_SUGGESTIONS_STATUSES,
  CodeSuggestionsStatusBarItem,
} from './code_suggestions_status_bar_item';
import {
  CodeSuggestionsStateManager,
  VisibleCodeSuggestionsState,
} from './code_suggestions_state_manager';
import { COMMAND_TOGGLE_CODE_SUGGESTIONS } from './commands/toggle';
import { createFakePartial } from '../test_utils/create_fake_partial';

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
  let visibleState: VisibleCodeSuggestionsState;
  let notifyStateChange: () => void;

  beforeEach(() => {
    jest.mocked(vscode.window.createStatusBarItem).mockImplementation(() => {
      fakeStatusBarItem = createFakeItem();
      return fakeStatusBarItem;
    });
    codeSuggestionsStateManager = createFakePartial<CodeSuggestionsStateManager>({
      getVisibleState: () => visibleState,
      onDidChangeVisibleState: l => {
        notifyStateChange = () => l(visibleState);
        return { dispose: () => {} };
      },
    });
    visibleState = VisibleCodeSuggestionsState.DISABLED_BY_USER;
    codeSuggestionsStatusBarItem = new CodeSuggestionsStatusBarItem(codeSuggestionsStateManager);
  });

  afterEach(() => {
    codeSuggestionsStatusBarItem.dispose();
  });

  it('renders as disabled by default', () => {
    expect(fakeStatusBarItem.text).toBe('$(gitlab-code-suggestions-disabled)');
  });

  it.each(Object.values(VisibleCodeSuggestionsState) as VisibleCodeSuggestionsState[])(
    'renders state %s',
    (state: VisibleCodeSuggestionsState) => {
      visibleState = state;
      notifyStateChange();

      expect(fakeStatusBarItem.text).toBe(CODE_SUGGESTIONS_STATUSES[state].text);
    },
  );

  it('uses correct command for toggling', () => {
    expect(fakeStatusBarItem.command).toBe(COMMAND_TOGGLE_CODE_SUGGESTIONS);
  });
});
