import WebSocket from 'isomorphic-ws';

export const connectToCable = async (instanceUrl: string, websocketOptions?: object) => {
  const { createCable } = await import('@anycable/core');

  const cableUrl = new URL('/-/cable', instanceUrl);
  cableUrl.protocol = cableUrl.protocol === 'http:' ? 'ws:' : 'wss:';

  const cable = createCable(cableUrl.href, {
    websocketImplementation: WebSocket,
    websocketOptions,
  });

  await cable.connect();

  return cable;
};
