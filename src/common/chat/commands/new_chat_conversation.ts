import { GitLabChatController } from '../gitlab_chat_controller';
import { GitLabChatRecord } from '../gitlab_chat_record';
import { SPECIAL_MESSAGES } from '../constants';

export const COMMAND_NEW_CHAT_CONVERSATION = 'gl.newChatConversation';

/**
 * Command will start new chat conversation
 */
export const newChatConversation = async (controller: GitLabChatController) => {
  const record = GitLabChatRecord.buildWithContext({
    role: 'user',
    type: 'newConversation',
    content: SPECIAL_MESSAGES.RESET,
  });

  await controller.processNewUserRecord(record);
};
