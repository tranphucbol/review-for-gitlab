import { GitLabChatController } from '../gitlab_chat_controller';
import { GitLabChatRecord } from '../gitlab_chat_record';

import { getActiveEditorText, getSelectedText } from '../utils/editor_text_utils';

export const COMMAND_GENERATE_TESTS = 'gl.generateTests';

/**
 * Command will explain currently selected code with GitLab Chat
 */
export const generateTests = async (controller: GitLabChatController) => {
  const editorText = getSelectedText() || getActiveEditorText();

  if (editorText === null) return;

  const record = new GitLabChatRecord({
    role: 'user',
    type: 'generateTests',
    content: `Write tests for this code\n\n\`\`\`\n${editorText}\n\`\`\``,
    payload: { editorText },
  });

  await controller.processNewUserRecord(record);
};
