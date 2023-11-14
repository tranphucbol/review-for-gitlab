import { currentUserRequest } from '../../common/gitlab/api/get_current_user';
import { FetchError } from '../errors/fetch_error';
import { InsufficientScopesError } from '../errors/insufficient_scopes_error';
import { UserFriendlyError } from '../errors/user_friendly_error';
import { personalAccessTokenDetailsRequest } from '../gitlab/api/get_personal_access_token_details';
import { GitLabService } from '../gitlab/gitlab_service';
import { Credentials } from './credentials';

export const getUserForCredentialsOrFail = async (credentials: Credentials): Promise<RestUser> => {
  const gitlabService = new GitLabService(credentials);
  try {
    const tokenInfo = await gitlabService.fetchFromApi(personalAccessTokenDetailsRequest);

    const REQUIRED_SCOPES = ['api', 'read_user'];

    const firstMissingScope = REQUIRED_SCOPES.find(scope => !tokenInfo.scopes.includes(scope));
    if (firstMissingScope) {
      throw new InsufficientScopesError(tokenInfo.scopes, REQUIRED_SCOPES);
    }

    return await gitlabService.fetchFromApi(currentUserRequest);
  } catch (e) {
    if (e instanceof InsufficientScopesError) {
      // We already made this as nice one, rethrowing
      throw e;
    }

    const message =
      e instanceof FetchError && e.status === 401
        ? `API Unauthorized: Can't add GitLab account for ${credentials.instanceUrl}. Is your token valid?`
        : `Request failed: Can't add GitLab account for ${credentials.instanceUrl}. Check your instance URL and network connection.`;

    throw new UserFriendlyError(message, e);
  }
};
