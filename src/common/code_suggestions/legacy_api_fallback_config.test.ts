import { LegacyApiFallbackConfig } from './legacy_api_fallback_config';

describe('LegacyApiFallbackConfig', () => {
  it('does not fallback by default', () => {
    const config = new LegacyApiFallbackConfig();
    expect(config.shouldUseModelGateway()).toBe(false);
  });

  it('fallbacks after flag is set', () => {
    const config = new LegacyApiFallbackConfig();
    expect(config.shouldUseModelGateway()).toBe(false);
    config.fallbackToModelGateway();
    expect(config.shouldUseModelGateway()).toBe(true);
  });

  it('removes the fallbacks after the retryDelayMS', () => {
    const errorDate = new Date();
    jest.useFakeTimers().setSystemTime(errorDate);
    const config = new LegacyApiFallbackConfig();
    config.fallbackToModelGateway();
    expect(config.shouldUseModelGateway()).toBe(true);
    // after 3600001 ms, the falback is removed
    jest.useFakeTimers().setSystemTime(new Date(errorDate.valueOf() + 3600001));
    expect(config.shouldUseModelGateway()).toBe(false);
  });
});
