const vscode = acquireVsCodeApi();

let nextRequestId = 1;
const pending = new Map();

window.addEventListener('message', event => {
  const message = event.data;
  if (message?.command !== 'result' || !pending.has(message.requestId)) return;
  const { resolve, reject } = pending.get(message.requestId);
  pending.delete(message.requestId);
  if (message.error) reject(new Error(message.error));
  else resolve(message);
});

export const post = message => vscode.postMessage(message);

/** Sends a message that the host answers with a `result` carrying the same requestId. */
export const request = (command, payload) =>
  new Promise((resolve, reject) => {
    const requestId = nextRequestId;
    nextRequestId += 1;
    pending.set(requestId, { resolve, reject });
    vscode.postMessage({ command, requestId, ...payload });
  });

export const onMessage = listener => {
  const handler = event => listener(event.data);
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
};
