import { currentUserRequest } from '../../common/gitlab/api/get_current_user';
import { log } from '../../common/log';
import { FetchError } from '../errors/fetch_error';
import { InsufficientScopesError } from '../errors/insufficient_scopes_error';
import { UserFriendlyError } from '../errors/user_friendly_error';
import { personalAccessTokenDetailsRequest } from '../gitlab/api/get_personal_access_token_details';
import { GitLabService } from '../gitlab/gitlab_service';
import { Credentials } from './credentials';

const REQUIRED_SCOPES = ['api'];

/**
 * `GET /personal_access_tokens/self` was only introduced in GitLab 15.5, but this
 * extension supports instances from `MINIMUM_VERSION` (13.6) up. Older instances
 * respond 404 because the route doesn't exist, which we must not report as a broken
 * instance URL or an invalid token.
 *
 * When we can't read the token's scopes, we skip the check and let the individual API
 * calls fail later if the token turns out to be under-scoped.
 */
const fetchTokenScopes = async (
  gitlabService: GitLabService,
  instanceUrl: string,
): Promise<string[] | undefined> => {
  try {
    const { scopes } = await gitlabService.fetchFromApi(personalAccessTokenDetailsRequest);
    return scopes;
  } catch (e) {
    if (e instanceof FetchError && e.status === 404) {
      log.warn(
        `${instanceUrl} doesn't support GET /personal_access_tokens/self (added in GitLab 15.5). Skipping the token scope check.`,
      );
      return undefined;
    }
    throw e;
  }
};

export const getUserForCredentialsOrFail = async (credentials: Credentials): Promise<RestUser> => {
  const gitlabService = new GitLabService(credentials);
  try {
    const scopes = await fetchTokenScopes(gitlabService, credentials.instanceUrl);

    if (scopes) {
      const firstMissingScope = REQUIRED_SCOPES.find(scope => !scopes.includes(scope));
      if (firstMissingScope) {
        throw new InsufficientScopesError(scopes, REQUIRED_SCOPES);
      }
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
