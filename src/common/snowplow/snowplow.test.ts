import fetch from 'cross-fetch';
import { Snowplow } from './snowplow';

jest.mock('cross-fetch');

const structEvent = {
  category: 'test',
  action: 'test',
  label: 'test',
  value: 1,
};

const enabledMock = jest.fn();

const sp = Snowplow.getInstance({
  appId: 'test',
  timeInterval: 1000,
  maxItems: 1,
  endpoint: 'http://localhost',
  enabled: enabledMock,
});

describe('Snowplow', () => {
  describe('Snowplow interface', () => {
    it('should initialize', async () => {
      const newSP = Snowplow.getInstance();
      expect(newSP).toBe(sp);
    });

    it('should let you track events', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        status: 200,
        statusText: 'OK',
      } as Response);
      enabledMock.mockReturnValue(true);
      await sp.trackStructEvent(structEvent);
      await sp.stop();
    });

    it('should let you stop when the program ends', async () => {
      enabledMock.mockReturnValue(true);
      await sp.stop();
    });
  });

  describe('should track and send events to snowplow', () => {
    beforeEach(() => {
      (fetch as jest.MockedFunction<typeof fetch>).mockClear();
      enabledMock.mockReturnValue(true);
    });

    afterEach(async () => {
      await sp.stop();
    });

    it('should send the events to snowplow', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockClear();
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        status: 200,
        statusText: 'OK',
      } as Response);

      const structEvent1 = { ...structEvent };
      structEvent1.action = 'action';

      await sp.trackStructEvent(structEvent);
      await sp.trackStructEvent(structEvent1);
      expect(fetch).toBeCalledTimes(2);
      await sp.stop();
    });
  });

  describe('enabled function', () => {
    it('should not send events to snowplow when disabled', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        status: 200,
        statusText: 'OK',
      } as Response);

      enabledMock.mockReturnValue(false);

      const structEvent1 = { ...structEvent };
      structEvent1.action = 'action';

      await sp.trackStructEvent(structEvent);
      expect(fetch).not.toBeCalled();
      await sp.stop();
    });

    it('should send events to snowplow when enabled', async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        status: 200,
        statusText: 'OK',
      } as Response);

      enabledMock.mockReturnValue(true);

      const structEvent1 = { ...structEvent };
      structEvent1.action = 'action';

      await sp.trackStructEvent(structEvent);
      expect(fetch).toBeCalled();
      await sp.stop();
    });
  });
});
