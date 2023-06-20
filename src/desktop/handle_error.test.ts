import * as vscode from 'vscode';
import { initializeLogging } from '../common/log';
import { USER_COMMANDS } from './command_names';
import { WarningError } from './errors/warning_error';
import { handleError } from './handle_error';

describe('handleError', () => {
  const message = 'Uncaught TypeError: NetworkError when attempting to fetch resource.';
  const showErrorMessage = vscode.window.showErrorMessage as jest.Mock;

  let logFunction: jest.Mock;

  beforeEach(() => {
    logFunction = jest.fn();
    initializeLogging(logFunction);
  });

  const getLoggedMessage = () => logFunction.mock.calls[0][0];

  it('passes the argument to the handler', () => {
    handleError(new Error(message));

    expect(getLoggedMessage()).toContain(message);
  });

  it('prompts the user to show the logs', () => {
    handleError(new Error(message));

    expect(showErrorMessage).toBeCalledWith(message, 'Show Logs');
  });

  it('shows the logs when the user confirms the prompt', async () => {
    const executeCommand = vscode.commands.executeCommand as jest.Mock;
    showErrorMessage.mockResolvedValue('Show Logs');

    await handleError(new Error(message)).onlyForTesting;

    expect(executeCommand).toBeCalledWith(USER_COMMANDS.SHOW_OUTPUT);
  });

  it('shows WarningError as warning', async () => {
    await handleError(new WarningError(message)).onlyForTesting;

    expect(vscode.window.showWarningMessage).toBeCalledWith(message);
  });
});
