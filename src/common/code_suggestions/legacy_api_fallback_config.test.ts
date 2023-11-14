import { LegacyApiFallbackConfig } from './legacy_api_fallback_config';
import { GitLabPlatformManagerForCodeSuggestions } from './gitlab_platform_manager_for_code_suggestions';
import { GitLabPlatformManager } from '../platform/gitlab_platform';
import { gitlabPlatformForAccount } from '../test_utils/entities';

const fetchFromApiMock = jest.fn();

const manager = new GitLabPlatformManagerForCodeSuggestions({} as unknown as GitLabPlatformManager);

describe('LegacyApiFallbackConfig', () => {
  let config: LegacyApiFallbackConfig;

  beforeEach(() => {
    jest.spyOn(manager, 'getGitLabPlatform').mockResolvedValue({
      ...gitlabPlatformForAccount,
      fetchFromApi: fetchFromApiMock,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('for non legacy api', () => {
    beforeEach(async () => {
      const apiResponse = {
        version: '16.2',
      };
      fetchFromApiMock.mockResolvedValue(apiResponse);
      config = new LegacyApiFallbackConfig(manager);
      await config.verifyGitLabVersion();
    });

    it('does fallback by default', () => {
      expect(config.shouldUseModelGateway()).toBe(true);
    });
  });

  describe('for non legacy api', () => {
    beforeEach(async () => {
      const apiResponse = {
        version: '16.3',
      };
      fetchFromApiMock.mockResolvedValue(apiResponse);
      config = new LegacyApiFallbackConfig(manager);
      await config.verifyGitLabVersion();
    });

    it('does not fallback by default', () => {
      expect(config.shouldUseModelGateway()).toBe(false);
    });

    it('fallbacks after flag is set', () => {
      expect(config.shouldUseModelGateway()).toBe(false);
      config.fallbackToModelGateway();
      expect(config.shouldUseModelGateway()).toBe(true);
    });

    it('removes the fallbacks after the retryDelayMS', async () => {
      const errorDate = new Date();
      jest.useFakeTimers().setSystemTime(errorDate);

      config = new LegacyApiFallbackConfig(manager);
      await config.verifyGitLabVersion();
      config.fallbackToModelGateway();

      expect(config.shouldUseModelGateway()).toBe(true);
      // after 3600001 ms, the falback is removed
      jest.useFakeTimers().setSystemTime(new Date(errorDate.valueOf() + 3600001));
      expect(config.shouldUseModelGateway()).toBe(false);
    });
  });
});
