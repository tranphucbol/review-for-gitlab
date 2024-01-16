import * as vscode from 'vscode';
import { initializeFeatureFlagContext } from './feature_flags';
import {
  COMMAND_CODE_SUGGESTION_ACCEPTED,
  codeSuggestionAccepted,
} from './code_suggestions/commands/code_suggestion_accepted';
import { COMMAND_SHOW_OUTPUT, createShowOutputCommand } from './show_output_command';
import { activateChat } from './chat/gitlab_chat';
import { setupTelemetry } from './snowplow/setup_telemetry';
import { DependencyContainer } from './dependency_container';

export const activateCommon = async (
  context: vscode.ExtensionContext,
  container: DependencyContainer,
  outputChannel: vscode.OutputChannel,
) => {
  setupTelemetry(container.gitLabTelemetryEnvironment);

  context.subscriptions.push(initializeFeatureFlagContext());

  const commands = {
    [COMMAND_SHOW_OUTPUT]: createShowOutputCommand(outputChannel),
    [COMMAND_CODE_SUGGESTION_ACCEPTED]: codeSuggestionAccepted,
  };
  Object.entries(commands).forEach(([cmdName, cmd]) => {
    context.subscriptions.push(vscode.commands.registerCommand(cmdName, cmd));
  });

  await activateChat(context, container.gitLabPlatformManager);
};
