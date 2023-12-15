import WebSocket from 'isomorphic-ws';
import { createCable } from '@anycable/core';

export const connectToCable = async (instanceUrl: string, websocketOptions?: object) => {
  const cableUrl = new URL('/-/cable', instanceUrl);
  cableUrl.protocol = cableUrl.protocol === 'http:' ? 'ws:' : 'wss:';

  const cable = createCable(cableUrl.href, {
    websocketImplementation: WebSocket,
    websocketOptions,
  });

  await cable.connect();

  return cable;
};
