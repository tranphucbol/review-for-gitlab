import {
  getSelectedText,
  getActiveFileName,
  getTextAfterSelected,
  getTextBeforeSelected,
} from './utils/editor_text_utils';

type ChatFileContextAttributes = {
  fileName: string;
  selectedText: string;
  contentAboveCursor: string | null;
  contentBelowCursor: string | null;
};

export class GitLabChatFileContext {
  fileName: string;

  selectedText: string;

  contentAboveCursor: string | null;

  contentBelowCursor: string | null;

  constructor(attributes: ChatFileContextAttributes) {
    this.fileName = attributes.fileName;
    this.selectedText = attributes.selectedText;
    this.contentAboveCursor = attributes.contentAboveCursor;
    this.contentBelowCursor = attributes.contentBelowCursor;
  }

  static forActiveFile(): null | GitLabChatFileContext {
    const selectedText = getSelectedText();
    const fileName = getActiveFileName();

    if (!selectedText || !fileName) {
      return null;
    }

    return new GitLabChatFileContext({
      selectedText,
      fileName,
      contentAboveCursor: getTextBeforeSelected(),
      contentBelowCursor: getTextAfterSelected(),
    });
  }
}
