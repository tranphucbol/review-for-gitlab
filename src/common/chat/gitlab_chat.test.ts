import * as vscode from 'vscode';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { GitLabChatView } from './gitlab_chat_view';
import { activateChat } from './gitlab_chat';

jest.mock('vscode');

describe('activateChat', () => {
  let context: vscode.ExtensionContext;
  let platformManager: GitLabPlatformManager;

  beforeEach(() => {
    context = {
      subscriptions: [],
    } as Partial<vscode.ExtensionContext> as vscode.ExtensionContext;

    vscode.window.registerWebviewViewProvider = jest.fn();

    vscode.commands.registerCommand = jest.fn().mockReturnValueOnce('command1');
  });

  it('registers view provider', () => {
    activateChat(context, platformManager);

    expect(vscode.window.registerWebviewViewProvider).toHaveBeenCalledWith(
      'gl.chatView',
      expect.any(GitLabChatView),
    );
  });

  it('registers commands', () => {
    activateChat(context, platformManager);

    expect(vscode.commands.registerCommand).toHaveBeenNthCalledWith(
      1,
      'gl.openChat',
      expect.any(Function),
    );

    expect(context.subscriptions[1]).toEqual('command1');
  });
});
