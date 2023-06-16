import { GitLabPlatformManager } from '../common/platform/gitlab_platform';
import { project } from '../desktop/test_utils/entities';
import { CodeSuggestionsTokenManager, CompletionToken } from './code_suggestions_token_manager';

describe('CodeSuggestionsTokenManager', () => {
  describe('getToken', () => {
    let makeApiRequest: jest.Mock;

    const createPlatformManager = (response: CompletionToken): GitLabPlatformManager => {
      makeApiRequest = jest.fn(async <T>(): Promise<T> => response as unknown as T);
      return {
        getForActiveProject: async () => ({
          project,
          fetchFromApi: makeApiRequest,
        }),
      };
    };

    it('should return a token', async () => {
      const tokenManager = new CodeSuggestionsTokenManager(
        createPlatformManager({
          access_token: '123',
          expires_in: 0,
          created_at: 0,
        }),
      );
      const token = await tokenManager.getToken();
      expect(token).not.toBe(undefined);
      expect(token?.access_token).toBe('123');
      expect(token?.expires_in).toBe(0);
      expect(token?.created_at).toBe(0);
    });

    it('should not call the service again if the token has not expired', async () => {
      const unixTimestampNow = Math.floor(new Date().getTime() / 1000);
      const mf = createPlatformManager({
        access_token: '123',
        expires_in: 3000,
        created_at: unixTimestampNow,
      });

      const tokenManager = new CodeSuggestionsTokenManager(mf);

      await tokenManager.getToken();
      await tokenManager.getToken();

      expect(makeApiRequest).toHaveBeenCalledTimes(1);
    });

    it('should call the service again if the token has expired', async () => {
      const unixTimestampExpired = Math.floor(new Date().getTime() / 1000) - 3001;

      const mf = createPlatformManager({
        access_token: '123',
        expires_in: 3000,
        created_at: unixTimestampExpired,
      });

      const tokenManager = new CodeSuggestionsTokenManager(mf);

      await tokenManager.getToken();
      await tokenManager.getToken();

      expect(makeApiRequest).toHaveBeenCalledTimes(2);
    });
  });
});
