import { currentUserRequest } from '../../common/gitlab/api/get_current_user';
import { createFakeFetchFromApi } from '../../common/test_utils/create_fake_fetch_from_api';
import { createFakePartial } from '../../common/test_utils/create_fake_partial';
import { FetchError } from '../errors/fetch_error';
import {
  PersonalAccessTokenDetails,
  personalAccessTokenDetailsRequest,
} from '../gitlab/api/get_personal_access_token_details';
import { GitLabService } from '../gitlab/gitlab_service';
import { user } from '../test_utils/entities';
import { getUserForCredentialsOrFail } from './get_user_for_credentials_or_fail';

jest.mock('../gitlab/gitlab_service');

describe('getUserForCredentialsOrFail', () => {
  const credentials = { instanceUrl: 'https://gitlab.example.com', token: 'token' };

  const fetchError = (status: number) =>
    new FetchError(createFakePartial<Response>({ status }), 'resource name');

  const mockResponses = (
    tokenDetails: PersonalAccessTokenDetails | Promise<PersonalAccessTokenDetails>,
    currentUser: RestUser | Promise<RestUser> = user,
  ) => {
    jest.mocked(GitLabService).mockImplementation(() =>
      createFakePartial<GitLabService>({
        fetchFromApi: createFakeFetchFromApi(
          { request: personalAccessTokenDetailsRequest, response: tokenDetails },
          { request: currentUserRequest, response: currentUser },
        ),
      }),
    );
  };

  it('returns the user when the token has the required scopes', async () => {
    mockResponses({ scopes: ['api'] });

    await expect(getUserForCredentialsOrFail(credentials)).resolves.toEqual(user);
  });

  it('throws InsufficientScopesError when the token is missing the api scope', async () => {
    mockResponses({ scopes: ['read_user'] });

    await expect(getUserForCredentialsOrFail(credentials)).rejects.toThrowError(
      /.*token is missing 'api' scope.*/,
    );
  });

  describe('when the instance does not support GET /personal_access_tokens/self', () => {
    // GitLab < 15.5 doesn't have the route and responds 404
    it('skips the scope check and returns the user', async () => {
      mockResponses(Promise.reject(fetchError(404)));

      await expect(getUserForCredentialsOrFail(credentials)).resolves.toEqual(user);
    });

    it('still fails if fetching the current user fails', async () => {
      mockResponses(Promise.reject(fetchError(404)), Promise.reject(fetchError(401)));

      await expect(getUserForCredentialsOrFail(credentials)).rejects.toThrowError(
        /.*Unauthorized.*/,
      );
    });
  });

  it('reports an invalid token when the scope request is Unauthorized', async () => {
    mockResponses(Promise.reject(fetchError(401)));

    await expect(getUserForCredentialsOrFail(credentials)).rejects.toThrowError(/.*Unauthorized.*/);
  });

  it('reports a failed request when the scope request fails for any other reason', async () => {
    mockResponses(Promise.reject(fetchError(500)));

    await expect(getUserForCredentialsOrFail(credentials)).rejects.toThrowError(
      /.*Request failed.*/,
    );
  });
});
