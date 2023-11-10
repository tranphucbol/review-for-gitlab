import { GitLabChatFileContext } from './gitlab_chat_file_context';

let selectedTextValue: string | null = 'selectedText';
let filenameValue: string | null = 'filename';

jest.mock('./utils/editor_text_utils', () => ({
  getSelectedText: jest.fn().mockImplementation(() => selectedTextValue),
  getActiveFileName: jest.fn().mockImplementation(() => filenameValue),
  getTextAfterSelected: jest.fn().mockReturnValue('textAfterSelection'),
  getTextBeforeSelected: jest.fn().mockReturnValue('textBeforeSelection'),
}));

describe('GitlabChatFileContext', () => {
  describe('forActiveFile', () => {
    it('returns null when no text is selected', () => {
      selectedTextValue = null;

      expect(GitLabChatFileContext.forActiveFile()).toBe(null);
    });

    it('returns null when no file is selected', () => {
      filenameValue = null;

      expect(GitLabChatFileContext.forActiveFile()).toBe(null);
    });

    it('sets values text is selected', () => {
      selectedTextValue = 'selectedText';
      filenameValue = 'filename';

      const context = GitLabChatFileContext.forActiveFile();

      expect(context?.selectedText).toBe('selectedText');
      expect(context?.fileName).toBe('filename');
      expect(context?.contentAboveCursor).toBe('textBeforeSelection');
      expect(context?.contentBelowCursor).toBe('textAfterSelection');
    });
  });
});
