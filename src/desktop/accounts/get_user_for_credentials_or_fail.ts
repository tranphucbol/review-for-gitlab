import { FetchError } from '../errors/fetch_error';
import { InsufficientScopesError } from '../errors/insufficient_scopes_error';
import { UserFriendlyError } from '../errors/user_friendly_error';
import { GitLabService } from '../gitlab/gitlab_service';
import { Credentials } from './credentials';

export const getUserForCredentialsOrFail = async (credentials: Credentials): Promise<RestUser> => {
  const gitlabService = new GitLabService(credentials);
  try {
    const tokenInfo = await gitlabService.getPersonalAccessTokenDetails();

    const REQUIRED_SCOPES = ['api', 'read_user'];

    const firstMissingScope = REQUIRED_SCOPES.find(scope => !tokenInfo.scopes.includes(scope));
    if (firstMissingScope) {
      throw new InsufficientScopesError(tokenInfo.scopes, REQUIRED_SCOPES);
    }

    return await new GitLabService(credentials).getCurrentUser();
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
