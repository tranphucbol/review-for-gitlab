import WebSocket from 'ws';
import { createCable } from '@anycable/core';
import { connectToCable } from './action_cable';

const cableMock = {
  connect: jest.fn(),
};

jest.mock('@anycable/core', () => ({
  createCable: jest.fn().mockImplementation(() => cableMock),
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
});
