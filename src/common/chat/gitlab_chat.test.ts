import * as vscode from 'vscode';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { activateChat } from './gitlab_chat';
import { GitLabChatController } from './gitlab_chat_controller';

jest.mock('vscode');

describe('activateChat', () => {
  let context: vscode.ExtensionContext;
  let platformManager: GitLabPlatformManager;

  beforeEach(() => {
    context = {
      subscriptions: [],
    } as Partial<vscode.ExtensionContext> as vscode.ExtensionContext;

    vscode.window.registerWebviewViewProvider = jest.fn();

    vscode.commands.registerCommand = jest
      .fn()
      .mockReturnValueOnce('command1')
      .mockReturnValueOnce('command2')
      .mockReturnValueOnce('command3')
      .mockReturnValueOnce('command4');
  });

  it('registers view provider', () => {
    activateChat(context, platformManager);

    expect(vscode.window.registerWebviewViewProvider).toHaveBeenCalledWith(
      'gl.chatView',
      expect.any(GitLabChatController),
    );
  });

  it('registers commands', () => {
    activateChat(context, platformManager);

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
      'gl.newChatConversation',
      expect.any(Function),
    );

    expect(context.subscriptions[1]).toEqual('command1');
    expect(context.subscriptions[2]).toEqual('command2');
    expect(context.subscriptions[3]).toEqual('command3');
    expect(context.subscriptions[4]).toEqual('command4');
  });
});
