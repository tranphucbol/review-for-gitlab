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
import { GitLabPlatformManagerForChat } from './get_platform_manager_for_chat';
import { CHAT_SIDEBAR_VIEW_ID } from './gitlab_chat_view';
import { COMMAND_REFACTOR_CODE, refactorCode } from './commands/refactorCode';
import { isDuoChatAvailable } from './utils/chat_availability_utils';

const setChatAvailable = async (manager: GitLabPlatformManager) => {
  await vscode.commands.executeCommand(
    'setContext',
    'gitlab:chatAvailable',
    await isDuoChatAvailable(manager),
  );
};

export const activateChat = async (
  context: vscode.ExtensionContext,
  manager: GitLabPlatformManager,
) => {
  const platformManagerForChat = new GitLabPlatformManagerForChat(manager);
  const controller = new GitLabChatController(platformManagerForChat, context);

  await setChatAvailable(manager);

  manager.onAccountChange(async () => {
    await setChatAvailable(manager);
  });

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
    vscode.commands.registerCommand(COMMAND_REFACTOR_CODE, async () => {
      await refactorCode(controller);
    }),
    vscode.commands.registerCommand(COMMAND_NEW_CHAT_CONVERSATION, async () => {
      await newChatConversation(controller);
    }),
  );
};
