import * as vscode from 'vscode';
import { GitLabChatController } from './gitlab_chat_controller';
import { COMMAND_OPEN_GITLAB_CHAT, openGitLabChat } from './commands/open_gitlab_chat';
import {
  COMMAND_EXPLAIN_SELECTED_CODE,
  explainSelectedCode,
} from './commands/explain_selected_code';
import { COMMAND_GENERATE_TESTS, generateTests } from './commands/generate_tests';
import {
  COMMAND_NEW_CHAT_CONVERSATION,
  newChatConversation,
} from './commands/new_chat_conversation';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { CHAT_SIDEBAR_VIEW_ID } from './gitlab_chat_view';

export const activateChat = (context: vscode.ExtensionContext, manager: GitLabPlatformManager) => {
  const controller = new GitLabChatController(manager, context);

  // sidebar view
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(CHAT_SIDEBAR_VIEW_ID, controller),
  );

  // commands
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_OPEN_GITLAB_CHAT, async () => {
      await openGitLabChat(controller);
    }),
    vscode.commands.registerCommand(COMMAND_EXPLAIN_SELECTED_CODE, async () => {
      await explainSelectedCode(controller);
    }),
    vscode.commands.registerCommand(COMMAND_GENERATE_TESTS, async () => {
      await generateTests(controller);
    }),
    vscode.commands.registerCommand(COMMAND_NEW_CHAT_CONVERSATION, async () => {
      await newChatConversation(controller);
    }),
  );
};
