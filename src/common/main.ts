import * as vscode from 'vscode';
import { GitLabPlatformManager } from './platform/gitlab_platform';
import { CodeSuggestions } from './code_suggestions/code_suggestions';
import {
  COMMAND_CODE_SUGGESTION_ACCEPTED,
  codeSuggestionAccepted,
} from './code_suggestions/commands/code_suggestion_accepted';

export const activateCommon = async (
  context: vscode.ExtensionContext,
  manager: GitLabPlatformManager,
) => {
  // TODO use the wrapWithCatch that is defined in the `extension.ts`
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_CODE_SUGGESTION_ACCEPTED, codeSuggestionAccepted),
  );
  context.subscriptions.push(new CodeSuggestions(manager));
};
