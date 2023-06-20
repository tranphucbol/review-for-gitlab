import * as vscode from 'vscode';
import { USER_COMMANDS } from './command_names';
import { DetailedError } from '../common/errors/common';
import { HelpError } from './errors/help_error';
import { WarningError } from './errors/warning_error';
import { Help, HelpMessageSeverity } from './utils/help';
import { log } from '../common/log';

export const handleError = (e: Error | DetailedError): { onlyForTesting: Thenable<unknown> } => {
  log.error(e);
  // This is probably the only place where we want to ignore a floating promise.
  // We don't want to block the app and wait for user click on the "Show Logs"
  // button or close the message However, for testing this method, we need to
  // keep the promise.
  if (HelpError.isHelpError(e)) {
    return { onlyForTesting: Help.showError(e, HelpMessageSeverity.Error) };
  }
  if (e instanceof WarningError) {
    return {
      onlyForTesting: vscode.window.showWarningMessage(e.message),
    };
  }
  const showErrorMessage = async () => {
    const choice = await vscode.window.showErrorMessage(e.message, 'Show Logs');
    if (choice === 'Show Logs') {
      await vscode.commands.executeCommand(USER_COMMANDS.SHOW_OUTPUT);
    }
  };
  return { onlyForTesting: showErrorMessage() };
};
