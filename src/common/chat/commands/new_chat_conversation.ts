import { GitLabChatController } from '../gitlab_chat_controller';
import { GitLabChatRecord } from '../gitlab_chat_record';

export const COMMAND_NEW_CHAT_CONVERSATION = 'gl.newChatConversation';

/**
 * Command will start new chat conversation
 */
export const newChatConversation = async (controller: GitLabChatController) => {
  const record = new GitLabChatRecord({
    role: 'user',
    type: 'newConversation',
    content: `/reset`,
  });

  await controller.processNewUserRecord(record);
};
