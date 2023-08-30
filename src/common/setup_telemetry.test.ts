import fetch from 'cross-fetch';
import { setupTelemetry } from './setup_telemetry';

jest.mock('cross-fetch');

const structEvent = {
  category: 'test',
  action: 'test',
  label: 'test',
  value: 1,
};

describe('setupTelemetry', () => {
  beforeEach(() => {
    (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      status: 200,
      statusText: 'OK',
    } as Response);

    (fetch as jest.MockedFunction<typeof fetch>).mockClear();
  });

  it('should return an instance of the snowplow telemetry provider', async () => {
    const sp = setupTelemetry();
    expect(sp).toBeDefined();
    await sp.stop();
  });

  it('should call the api when telemetry is enabled', async () => {
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
    expect(fetch).toHaveBeenCalledTimes(1);
    await sp.stop();
  });
});
