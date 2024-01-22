import WebSocket from 'ws';
import { createCable } from '@anycable/core';
import { connectToCable } from './action_cable';
import { log } from '../../log';

const cableMock = {
  connect: jest.fn(),
};

jest.mock('@anycable/core', () => ({
  createCable: jest.fn().mockImplementation(() => cableMock),
}));

jest.mock('../../log', () => ({
  log: {
    error: jest.fn(),
  },
}));

describe('connectToCable', () => {
  it('creates new anycable cable and connects', async () => {
    const connection = await connectToCable('https://foo.bar');

    expect(createCable).toHaveBeenCalledWith('wss://foo.bar/-/cable', {
      websocketImplementation: WebSocket,
    });
    expect(cableMock.connect).toHaveBeenCalled();

    expect(connection).toStrictEqual(cableMock);
  });

  it('respects http protocol and port', async () => {
    await connectToCable('http://foo.bar:3000');

    expect(createCable).toHaveBeenCalledWith('ws://foo.bar:3000/-/cable', expect.anything());
  });

  it('adds additional websocket options if provided', async () => {
    const additionalOptions = { headers: 'foo' };

    await connectToCable('https://foo.bar', additionalOptions);

    expect(createCable).toHaveBeenCalledWith('wss://foo.bar/-/cable', {
      websocketImplementation: WebSocket,
      websocketOptions: additionalOptions,
    });
  });

  it('logs error is connection to cable fails', async () => {
    const err = new Error('Foo Bar');
    cableMock.connect = jest.fn(() => {
      throw err;
    });

    await connectToCable('http://foo.bar:3000');
    expect(log.error).toHaveBeenCalledWith(err);
  });
});
