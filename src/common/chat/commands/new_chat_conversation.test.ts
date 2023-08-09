import { GitLabChatController } from '../gitlab_chat_controller';
import { newChatConversation } from './new_chat_conversation';

describe('newChatConversation', () => {
  let controller: GitLabChatController;

  beforeEach(() => {
    controller = {
      processNewUserRecord: jest.fn(),
    } as unknown as Partial<GitLabChatController> as GitLabChatController;
  });

  it('triggers new "/reset" record', async () => {
    await newChatConversation(controller);
    expect(controller.processNewUserRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '/reset',
        role: 'user',
        type: 'newConversation',
      }),
    );
  });
});
