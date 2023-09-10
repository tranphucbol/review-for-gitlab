import fetch from 'cross-fetch';
import * as vscode from 'vscode';
import { setupTelemetry } from './setup_telemetry_desktop';
import { Snowplow } from '../common/snowplow/snowplow';

jest.mock('cross-fetch');

const structEvent = {
  category: 'test',
  action: 'test',
  label: 'test',
  value: 1,
};

describe('setupTelemetry.desktop', () => {
  let sp: Snowplow;
  let onDidChangeTelementryCallback: (e: boolean) => unknown;

  const setTelemetryEnabled = (value: boolean) => {
    // @ts-expect-error vscode is mocked, so it is writable here
    vscode.env.isTelemetryEnabled = value;

    onDidChangeTelementryCallback(value);
  };

  beforeAll(() => {
    // note: Snowplow is a singleton so we have to test it as such
    sp = setupTelemetry();
    [[onDidChangeTelementryCallback]] = jest.mocked(
      vscode.env.onDidChangeTelemetryEnabled,
    ).mock.calls;
  });

  beforeEach(() => {
    (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      status: 200,
      statusText: 'OK',
    } as Response);

    (fetch as jest.MockedFunction<typeof fetch>).mockClear();
  });

  afterEach(async () => {
    await sp.stop();
  });

  it.each`
    isTelemetryEnabled | calls
    ${true}            | ${1}
    ${false}           | ${0}
  `('sends events based on telemetry status', async ({ isTelemetryEnabled, calls }) => {
    setTelemetryEnabled(isTelemetryEnabled);

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
