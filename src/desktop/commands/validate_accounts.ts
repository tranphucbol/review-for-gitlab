import vscode from 'vscode';
import { currentUserRequest } from '../../common/gitlab/api/get_current_user';
import { accountService } from '../accounts/account_service';
import { RefreshingGitLabService } from '../gitlab/refreshing_gitlab_service';
import { Account } from '../../common/platform/gitlab_account';
import { handleError } from '../../common/errors/handle_error';
import { FetchError } from '../errors/fetch_error';

const DELETE_ACCOUNT = 'Delete Account';
const DELETE_AND_AUTH = 'Re-authenticate';
const IGNORE = 'Ignore Error';

/** ignored accounts are stored in memory and so after extension restarts, user needs to ignore them again */
const ignoredAccounts: string[] = [];

type AccountStatus = 'valid' | 'ignored' | 'invalid';

const validateAccount = async (
  account: Account,
): Promise<{ account: Account; status: AccountStatus }> => {
  const service = new RefreshingGitLabService(account);
  try {
    await service.fetchFromApi(currentUserRequest);
    return { account, status: 'valid' };
  } catch (e) {
    if (e instanceof FetchError && e.isInvalidToken()) {
      if (ignoredAccounts.some(id => id === account.id)) {
        return { account, status: 'ignored' };
      }
      const isOAuth = account.type === 'oauth';
      const message = `Account for instance ${account.instanceUrl} and username ${account.username} has expired or revoked token.`;
      const choice = await vscode.window.showErrorMessage(
        message,
        isOAuth ? DELETE_AND_AUTH : DELETE_ACCOUNT,
        IGNORE,
      );
      switch (choice) {
        case DELETE_ACCOUNT:
          await accountService.removeAccount(account.id);
          break;
        case DELETE_AND_AUTH:
          await accountService.removeAccount(account.id);
          // trigger VS Code OAuth flow
          await vscode.authentication.getSession('gitlab', ['api', 'read_user'], {
            createIfNone: true,
          });
          break;
        case IGNORE:
          ignoredAccounts.push(account.id);
          break;
        default:
      }
      return { account, status: 'invalid' };
    }
    handleError(e);
    return { account, status: 'invalid' };
  }
};

/**
 * command to validate that accounts don't have expired tokens
 * @param showOnlyErrors is used when we invoke the command during extension startup and we don't want to spam user with success messages
 */
export const validateAccounts = async (showOnlyErrors = false) => {
  const accounts = accountService.getAllAccounts();
  const accountsWithStatus = await Promise.all(accounts.map(validateAccount));

  if (showOnlyErrors) {
    return;
  }

  if (accounts.length === 0) {
    const command = await vscode.window.showInformationMessage(
      'There are no GitLab accounts set up.',
      { title: 'Authenticate to GitLab.com', command: 'gl.authenticate' },
      { title: 'Add GitLab Account', command: 'gl.addAccount' },
    );
    command && (await vscode.commands.executeCommand(command.command));
    return;
  }

  const ignored = accountsWithStatus.filter(a => a.status === 'ignored');
  await Promise.all(
    ignored.map(async i => {
      await vscode.window.showWarningMessage(
        `Account ${i.account.instanceUrl}(${i.account.username}) has issues but it's ignored for this session. Restart VS Code to stop ignoring it.`,
      );
    }),
  );
  if (accountsWithStatus.every(f => f.status === 'valid')) {
    await vscode.window.showInformationMessage('All accounts are valid!');
  }
};
