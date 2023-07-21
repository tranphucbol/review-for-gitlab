import { openGitLabChat } from './open_gitlab_chat';
import { GitLabChatController } from '../gitlab_chat_controller';

describe('openGitLabChat', () => {
  let controller: GitLabChatController;

  beforeEach(() => {
    controller = {
      showChat: jest.fn(),
    } as unknown as Partial<GitLabChatController> as GitLabChatController;
  });

  it('shows the view when command is executed', async () => {
    await openGitLabChat(controller);

    expect(controller.showChat).toHaveBeenCalled();
  });
});
