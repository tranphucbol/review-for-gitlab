import WebSocket from 'isomorphic-ws';
import { createCable } from '@anycable/core';
import { log } from '../../log';

export const connectToCable = async (instanceUrl: string, websocketOptions?: object) => {
  const cableUrl = new URL('/-/cable', instanceUrl);
  cableUrl.protocol = cableUrl.protocol === 'http:' ? 'ws:' : 'wss:';

  const cable = createCable(cableUrl.href, {
    websocketImplementation: WebSocket,
    websocketOptions,
  });

  try {
    await cable.connect();
  } catch (e) {
    log.error(e);
  }

  return cable;
};
