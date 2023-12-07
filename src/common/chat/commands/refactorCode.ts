import { GitLabChatController } from '../gitlab_chat_controller';
import { GitLabChatRecord } from '../gitlab_chat_record';

export const COMMAND_REFACTOR_CODE = 'gl.refactorCode';

/**
 * Command will refactor currently selected code with GitLab Chat
 */
export const refactorCode = async (controller: GitLabChatController) => {
  const record = GitLabChatRecord.buildWithContext({
    role: 'user',
    type: 'refactorCode',
    content: `/refactor`,
  });

  if (!record.context?.currentFile.selectedText) return;

  await controller.processNewUserRecord(record);
};
