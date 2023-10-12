import fetch from 'cross-fetch';
import { setupTelemetry } from './setup_telemetry_browser';
import { WebIDEExtension } from '../common/platform/web_ide';
import { createFakePartial } from '../common/test_utils/create_fake_partial';
import { getWebIdeExports } from './get_web_ide_exports';

jest.mock('cross-fetch');
jest.mock('./get_web_ide_exports');

const structEvent = {
  category: 'test',
  action: 'test',
  label: 'test',
  value: 1,
};

describe('setupTelemetry.browser', () => {
  const webIDEExtension: jest.Mocked<WebIDEExtension> = {
    isTelemetryEnabled: jest.fn(),
  };

  beforeEach(() => {
    jest.mocked(fetch).mockResolvedValue(
      createFakePartial<Response>({
        status: 200,
        statusText: 'OK',
      }),
    );
    jest.mocked(fetch).mockClear();


    jest.mocked(getWebIdeExports).mockReturnValue(webIDEExtension);
  });
  afterEach(() => {
    webIDEExtension.isTelemetryEnabled.mockReset();
  });

  it('should return an instance of the snowplow telemetry provider', async () => {
    const sp = setupTelemetry();
    expect(sp).toBeDefined();
    await sp.stop();
  });

  it.each`
    isTelemetryEnabled | calls
    ${true}            | ${1}
    ${false}           | ${0}
  `('sends events based on telemetry status', async ({ isTelemetryEnabled, calls }) => {
    webIDEExtension.isTelemetryEnabled.mockReturnValueOnce(isTelemetryEnabled);

    const sp = setupTelemetry();
    await sp.trackStructEvent(structEvent);
    await sp.trackStructEvent(structEvent);
    await sp.trackStructEvent(structEvent);
    await sp.trackStructEvent(structEvent);
    await sp.trackStructEvent(structEvent);
    await sp.trackStructEvent(structEvent);
    await sp.trackStructEvent(structEvent);
    await sp.trackStructEvent(structEvent);
    await sp.trackStructEvent(structEvent);
    await sp.trackStructEvent(structEvent);
    expect(fetch).toHaveBeenCalledTimes(calls);
    await sp.stop();
  });
});
