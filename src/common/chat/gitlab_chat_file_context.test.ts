import { getActiveFileContext } from './gitlab_chat_file_context';

let selectedTextValue: string | null = 'selectedText';
let filenameValue: string | null = 'filename';

jest.mock('./utils/editor_text_utils', () => ({
  getSelectedText: jest.fn().mockImplementation(() => selectedTextValue),
  getActiveFileName: jest.fn().mockImplementation(() => filenameValue),
  getTextAfterSelected: jest.fn().mockReturnValue('textAfterSelection'),
  getTextBeforeSelected: jest.fn().mockReturnValue('textBeforeSelection'),
}));

describe('getActiveFileContext', () => {
  it('returns null when no text is selected', () => {
    selectedTextValue = null;

    expect(getActiveFileContext()).toBe(undefined);
  });

  it('returns null when no file is selected', () => {
    filenameValue = null;

    expect(getActiveFileContext()).toBe(undefined);
  });

  it('sets values text is selected', () => {
    selectedTextValue = 'selectedText';
    filenameValue = 'filename';

    const context = getActiveFileContext();

    expect(context?.selectedText).toBe('selectedText');
    expect(context?.fileName).toBe('filename');
    expect(context?.contentAboveCursor).toBe('textBeforeSelection');
    expect(context?.contentBelowCursor).toBe('textAfterSelection');
  });
});
