import vscode from 'vscode';
import { FetchError } from './errors/fetch_error';
import { GitLabService } from './gitlab/gitlab_service';
import { accountService } from './accounts/account_service';
import { asMock } from './test_utils/as_mock';
import { addAccount } from './token_input';
import { createFakePartial } from '../common/test_utils/create_fake_partial';
import { currentUserRequest } from '../common/gitlab/api/get_current_user';
import {
  PersonalAccessTokenDetails,
  personalAccessTokenDetailsRequest,
} from './gitlab/api/get_personal_access_token_details';
import { createFakeFetchFromApi } from '../common/test_utils/create_fake_fetch_from_api';
import { user } from './test_utils/entities';

jest.mock('./gitlab/gitlab_service');
jest.mock('./accounts/account_service');

describe('token input', () => {
  describe('addAccount', () => {
    const mockResponses = (
      currentUser: RestUser | Promise<RestUser>,
      scopesResponse: PersonalAccessTokenDetails,
    ) => {
      jest.mocked(GitLabService).mockImplementation(() =>
        createFakePartial<GitLabService>({
          fetchFromApi: createFakeFetchFromApi(
            { request: currentUserRequest, response: currentUser },
            { request: personalAccessTokenDetailsRequest, response: scopesResponse },
          ),
        }),
      );
    };

    beforeEach(() => {
      // simulate user filling in instance URL and token
      asMock(vscode.window.showInputBox).mockImplementation(async (options: any) =>
        options.password ? 'token' : 'https://gitlab.com',
      );
    });
    it('adds account', async () => {
      // simulate API returning user for the instance url and token
      mockResponses(user, { scopes: ['api', 'read_user'] });

      await addAccount();

      expect(GitLabService).toHaveBeenCalledWith({
        instanceUrl: 'https://gitlab.com',
        token: 'token',
      });
      expect(accountService.addAccount).toHaveBeenCalledWith({
        id: 'https://gitlab.com|123',
        token: 'token',
        instanceUrl: 'https://gitlab.com',
        username: 'test-user',
        type: 'token',
      });
    });

    it('removes trailing slash from the instanceUrl', async () => {
      // simulate user filling in instance URL and token
      asMock(vscode.window.showInputBox).mockImplementation(async (options: any) =>
        options.password ? 'token' : 'https://gitlab.com/',
      );
      // simulate API returning user for the instance url and token
      mockResponses(user, { scopes: ['api', 'read_user'] });

      await addAccount();

      expect(accountService.addAccount).toHaveBeenCalledWith({
        id: 'https://gitlab.com|123',
        instanceUrl: 'https://gitlab.com',
        token: 'token',
        username: 'test-user',
        type: 'token',
      });
    });

    it('handles Unauthorized error', async () => {
      // simulate API failing with Unauthorized
      mockResponses(Promise.reject(new FetchError({ status: 401 } as Response, '')), {
        scopes: ['api', 'read_user'],
      });

      await expect(addAccount()).rejects.toThrowError(/.*Unauthorized.*/);
    });
    it('handles fetch error', async () => {
      // simulate API returning error response
      mockResponses(Promise.reject(new FetchError({ status: 404 } as Response, '')), {
        scopes: ['api', 'read_user'],
      });

      await expect(addAccount()).rejects.toThrowError(/.*Request failed.*/);
    });

    it('handles insufficient scopes error', async () => {
      // simulate token with missing scopes
      mockResponses(user, { scopes: ['read_user', 'some_other_scope'] });

      await expect(addAccount()).rejects.toThrowError(/.*token is missing 'api' scope.*/);
    });
  });
});
