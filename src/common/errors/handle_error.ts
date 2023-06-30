import * as vscode from 'vscode';
import { log } from '../log';
import { isUiError } from './ui_error';
import { COMMAND_SHOW_OUTPUT } from '../show_output_command';

export const handleError = (e: Error): void => {
  log.error(e);
  if (isUiError(e)) {
    e.showUi().catch(log.error);
  }
  const showErrorMessage = async () => {
    const choice = await vscode.window.showErrorMessage(e.message, 'Show Logs');
    if (choice === 'Show Logs') {
      await vscode.commands.executeCommand(COMMAND_SHOW_OUTPUT);
    }
  };
  // This is probably the only place where we want to ignore a floating promise.
  // We don't want to block the app and wait for user click on the "Show Logs"
  // button or close the message However, for testing this method, we need to
  // keep the promise.
  showErrorMessage().catch(log.error);
};
