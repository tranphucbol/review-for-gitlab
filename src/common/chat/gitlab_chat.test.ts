import * as vscode from 'vscode';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { createFakePartial } from '../test_utils/create_fake_partial';
import { activateChat } from './gitlab_chat';
import { GitLabChatController } from './gitlab_chat_controller';
import { isDuoChatAvailable } from './utils/chat_availability_utils';

jest.mock('vscode');
jest.mock('./utils/chat_availability_utils');

describe('activateChat', () => {
  let context: vscode.ExtensionContext;
  let gitlabPlatformManager: GitLabPlatformManager;

  beforeEach(() => {
    gitlabPlatformManager = createFakePartial<GitLabPlatformManager>({
      onAccountChange: jest.fn(handler => handler()),
    });
    context = {
      subscriptions: [],
    } as Partial<vscode.ExtensionContext> as vscode.ExtensionContext;

    vscode.window.registerWebviewViewProvider = jest.fn();

    vscode.commands.executeCommand = jest.fn();

    vscode.commands.registerCommand = jest
      .fn()
      .mockReturnValueOnce('command1')
      .mockReturnValueOnce('command2')
      .mockReturnValueOnce('command3')
      .mockReturnValueOnce('command4')
      .mockReturnValueOnce('command5');
  });

  it('registers view provider', async () => {
    await activateChat(context, gitlabPlatformManager);

    expect(vscode.window.registerWebviewViewProvider).toHaveBeenCalledWith(
      'gl.chatView',
      expect.any(GitLabChatController),
    );
  });

  it('registers commands', async () => {
    await activateChat(context, gitlabPlatformManager);

    expect(vscode.commands.registerCommand).toHaveBeenNthCalledWith(
      1,
      'gl.openChat',
      expect.any(Function),
    );

    expect(vscode.commands.registerCommand).toHaveBeenNthCalledWith(
      2,
      'gl.explainSelectedCode',
      expect.any(Function),
    );
    expect(vscode.commands.registerCommand).toHaveBeenNthCalledWith(
      3,
      'gl.generateTests',
      expect.any(Function),
    );
    expect(vscode.commands.registerCommand).toHaveBeenNthCalledWith(
      4,
      'gl.refactorCode',
      expect.any(Function),
    );
    expect(vscode.commands.registerCommand).toHaveBeenNthCalledWith(
      5,
      'gl.newChatConversation',
      expect.any(Function),
    );

    expect(context.subscriptions[1]).toEqual('command1');
    expect(context.subscriptions[2]).toEqual('command2');
    expect(context.subscriptions[3]).toEqual('command3');
    expect(context.subscriptions[4]).toEqual('command4');
    expect(context.subscriptions[5]).toEqual('command5');
  });

  it('listens to the account changes', async () => {
    jest.mocked(isDuoChatAvailable).mockResolvedValueOnce(true);

    await activateChat(context, gitlabPlatformManager);
    expect(gitlabPlatformManager.onAccountChange).toHaveBeenCalled();
  });

  describe('gitlab:chatAvailable', () => {
    it.each([
      [true, true],
      [false, false],
    ])('is %s when isDuoChatAvailable is %s', async (available, expected) => {
      jest.mocked(isDuoChatAvailable).mockResolvedValueOnce(available);

      await activateChat(context, gitlabPlatformManager);
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'setContext',
        'gitlab:chatAvailable',
        expected,
      );
    });
  });
});
