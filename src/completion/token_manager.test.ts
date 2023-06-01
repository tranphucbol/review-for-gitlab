import { GitLabPlatform, GitLabPlatformProject } from '../gitlab/gitlab_platform';
import { CodeCompletionTokenManager, CompletionToken } from './token_manager';

describe('CodeCompletionTokenManager', () => {
  describe('getToken', () => {
    let makeApiRequest: jest.Mock;

    const createPlatform = (response: CompletionToken): GitLabPlatform => {
      makeApiRequest = jest.fn(async <T>(): Promise<T> => response as unknown as T);

      return {
        getProject: async () => ({ project: 'gitlab' } as GitLabPlatformProject),
        fetchFromApi: makeApiRequest,
      };
    };

    it('should return a token', async () => {
      const tokenManager = new CodeCompletionTokenManager(
        createPlatform({
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
      const mf = createPlatform({
        access_token: '123',
        expires_in: 3000,
        created_at: unixTimestampNow,
      });

      const tokenManager = new CodeCompletionTokenManager(mf);

      await tokenManager.getToken();
      await tokenManager.getToken();

      expect(makeApiRequest).toHaveBeenCalledTimes(1);
    });

    it('should call the service again if the token has expired', async () => {
      const unixTimestampExpired = Math.floor(new Date().getTime() / 1000) - 3001;

      const mf = createPlatform({
        access_token: '123',
        expires_in: 3000,
        created_at: unixTimestampExpired,
      });

      const tokenManager = new CodeCompletionTokenManager(mf);

      await tokenManager.getToken();
      await tokenManager.getToken();

      expect(makeApiRequest).toHaveBeenCalledTimes(2);
    });
  });
});
