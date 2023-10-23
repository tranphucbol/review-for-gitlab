import { GitLabChatController } from '../gitlab_chat_controller';
import { GitLabChatRecord } from '../gitlab_chat_record';
import { getSelectedText } from '../utils/editor_text_utils';

export const COMMAND_EXPLAIN_SELECTED_CODE = 'gl.explainSelectedCode';

/**
 * Command will explain currently selected code with GitLab Chat
 */
export const explainSelectedCode = async (controller: GitLabChatController) => {
  const selectedText = getSelectedText();

  if (selectedText === null) return;

  const record = new GitLabChatRecord({
    role: 'user',
    type: 'explainCode',
    content: `Explain this code\n\n\`\`\`\n${selectedText}\n\`\`\``,
    payload: { selectedText },
  });

  await controller.processNewUserRecord(record);
};
