import * as vscode from 'vscode';
import { Account } from '../../common/platform/gitlab_account';
import { accountService } from '../accounts/account_service';
import { validateAccounts } from './validate_accounts';
import { RefreshingGitLabService } from '../gitlab/refreshing_gitlab_service';
import { createFakePartial } from '../../common/test_utils/create_fake_partial';
import { FetchError } from '../errors/fetch_error';
import { account } from '../../common/test_utils/entities';
import { handleError } from '../../common/errors/handle_error';
import { createOAuthAccount } from '../test_utils/entities';

jest.mock('../gitlab/refreshing_gitlab_service');
jest.mock('../../common/errors/handle_error');

describe('validateAccounts', () => {
  let mockedAccounts: Account[] = [];

  beforeEach(() => {
    jest.resetAllMocks();
    accountService.getAllAccounts = () => mockedAccounts;
    accountService.removeAccount = jest.fn();
  });

  it('shows message with authentication buttons when there are no accounts', async () => {
    mockedAccounts = [];
    await validateAccounts();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      'No GitLab accounts are set up.',
      { title: 'Authenticate to GitLab.com', command: 'gl.authenticate' },
      { title: 'Add GitLab Account', command: 'gl.addAccount' },
    );
  });

  it('executes a command from the no account message', async () => {
    mockedAccounts = [];
    jest
      .mocked(vscode.window.showInformationMessage as jest.Func)
      .mockResolvedValue({ title: 'Authenticate to GitLab.com', command: 'gl.authenticate' });
    await validateAccounts();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('gl.authenticate');
  });

  describe('with invalid account', () => {
    let error: FetchError;
    beforeEach(() => {
      jest.mocked(RefreshingGitLabService).mockReturnValue(
        createFakePartial<RefreshingGitLabService>({
          fetchFromApi: jest.fn().mockImplementation(async () => {
            throw error;
          }),
        }),
      );
    });
    describe('with generic error', () => {
      beforeEach(() => {
        error = new FetchError(createFakePartial<Response>({ status: 500 }), 'resource name');
      });

      it('show directly the error', async () => {
        mockedAccounts = [account];
        await validateAccounts();
        expect(handleError).toHaveBeenCalledWith(error);
      });
    });

    describe('with invalid token error', () => {
      beforeEach(() => {
        error = new FetchError(
          createFakePartial<Response>({ status: 401 }),
          'resource name',
          '{"error":"invalid_token"}',
        );
      });

      describe('for PAT account', () => {
        beforeEach(() => {
          mockedAccounts = [account];
        });

        it('shows invalid token error and offers to delete or ignore account', async () => {
          await validateAccounts();
          expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            expect.stringMatching('expired or been revoked'),
            'Delete Account',
            'Ignore Error',
          );
        });

        it('ignores account', async () => {
          mockedAccounts = [{ ...account, id: 'id-to-ignore' }];
          jest
            .mocked(vscode.window.showErrorMessage as jest.Func) // I wasn't able to make TS choose the correct overloaded signature
            .mockResolvedValue('Ignore Error');
          await validateAccounts();
          await validateAccounts();

          expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringMatching("has issues but it's ignored"),
          );
        });

        it('deletes account', async () => {
          jest
            .mocked(vscode.window.showErrorMessage as jest.Func) // I wasn't able to make TS choose the correct overloaded signature
            .mockResolvedValue('Delete Account');
          await validateAccounts();

          expect(accountService.removeAccount).toHaveBeenCalledWith(account.id);
        });
      });

      describe('for OAuth account', () => {
        beforeEach(() => {
          mockedAccounts = [createOAuthAccount()];
        });

        it('shows invalid token error and offers to re-authenticate or ignore error for OAuth account', async () => {
          await validateAccounts();
          expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            expect.stringMatching('expired or been revoked'),
            'Re-authenticate',
            'Ignore Error',
          );
        });

        it('ignores account', async () => {
          mockedAccounts = [{ ...createOAuthAccount(), id: 'oauth-id-to-ignore' }];
          jest
            .mocked(vscode.window.showErrorMessage as jest.Func) // I wasn't able to make TS choose the correct overloaded signature
            .mockResolvedValue('Ignore Error');
          await validateAccounts();
          await validateAccounts();

          expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringMatching("has issues but it's ignored"),
          );
        });

        it('deletes account and creates a new session', async () => {
          jest
            .mocked(vscode.window.showErrorMessage as jest.Func) // I wasn't able to make TS choose the correct overloaded signature
            .mockResolvedValue('Re-authenticate');
          await validateAccounts();

          expect(accountService.removeAccount).toHaveBeenCalledWith(mockedAccounts[0].id);
          expect(vscode.authentication.getSession).toHaveBeenCalledWith(
            'gitlab',
            ['api', 'read_user'],
            {
              createIfNone: true,
            },
          );
        });
      });
    });
  });
});
