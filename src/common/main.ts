import * as vscode from 'vscode';
import { GitLabPlatformManager } from './platform/gitlab_platform';
import { CodeSuggestions } from './code_suggestions/code_suggestions';
import {
  COMMAND_CODE_SUGGESTION_ACCEPTED,
  codeSuggestionAccepted,
} from './code_suggestions/commands/code_suggestion_accepted';
import { COMMAND_SHOW_OUTPUT, createShowOutputCommand } from './show_output_command';
import { activateChat, GITLAB_CHAT_FEATURE_FLAG } from './chat/gitlab_chat';
import { getExtensionConfiguration } from './utils/extension_configuration';

export const activateCommon = async (
  context: vscode.ExtensionContext,
  manager: GitLabPlatformManager,
  outputChannel: vscode.OutputChannel,
) => {
  const commands = {
    [COMMAND_SHOW_OUTPUT]: createShowOutputCommand(outputChannel),
    [COMMAND_CODE_SUGGESTION_ACCEPTED]: codeSuggestionAccepted,
  };
  Object.entries(commands).forEach(([cmdName, cmd]) => {
    context.subscriptions.push(vscode.commands.registerCommand(cmdName, cmd));
  });
  context.subscriptions.push(new CodeSuggestions(manager));

  if (getExtensionConfiguration().featureFlags[GITLAB_CHAT_FEATURE_FLAG]) {
    activateChat(context, manager);
  }
};
