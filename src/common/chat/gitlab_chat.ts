import * as vscode from 'vscode';
import { GitLabChatController } from './gitlab_chat_controller';
import { COMMAND_OPEN_GITLAB_CHAT, openGitLabChat } from './commands/open_gitlab_chat';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { CHAT_SIDEBAR_VIEW_ID } from './gitlab_chat_view';

export const activateChat = (context: vscode.ExtensionContext, manager: GitLabPlatformManager) => {
  const controller = new GitLabChatController(context, manager);

  // sidebar view
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(CHAT_SIDEBAR_VIEW_ID, controller.view, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // commands
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_OPEN_GITLAB_CHAT, async () => {
      await openGitLabChat(controller);
    }),
  );
};

export const GITLAB_CHAT_FEATURE_FLAG = 'chat';
