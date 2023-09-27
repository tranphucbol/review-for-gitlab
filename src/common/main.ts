import * as vscode from 'vscode';
import { isEnabled, FeatureFlag, initializeFeatureFlagContext } from './feature_flags';
import { GitLabPlatformManager } from './platform/gitlab_platform';
import {
  COMMAND_CODE_SUGGESTION_ACCEPTED,
  codeSuggestionAccepted,
} from './code_suggestions/commands/code_suggestion_accepted';
import { COMMAND_SHOW_OUTPUT, createShowOutputCommand } from './show_output_command';
import { activateChat } from './chat/gitlab_chat';

export const activateCommon = async (
  context: vscode.ExtensionContext,
  manager: GitLabPlatformManager,
  outputChannel: vscode.OutputChannel,
) => {
  context.subscriptions.push(initializeFeatureFlagContext());

  const commands = {
    [COMMAND_SHOW_OUTPUT]: createShowOutputCommand(outputChannel),
    [COMMAND_CODE_SUGGESTION_ACCEPTED]: codeSuggestionAccepted,
  };
  Object.entries(commands).forEach(([cmdName, cmd]) => {
    context.subscriptions.push(vscode.commands.registerCommand(cmdName, cmd));
  });

  if (isEnabled(FeatureFlag.GitLabChat)) {
    activateChat(context, manager);
  }
};
