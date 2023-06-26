import crossFetch from 'cross-fetch';
import { log } from './log';

function extractURL(input: RequestInfo | URL): string {
  if (input instanceof URL) {
    return input.toString();
  }

  if (typeof input === 'string') {
    return input;
  }

  return input.url;
}

async function fetchLogged(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const start = Date.now();
  const url = extractURL(input);

  try {
    const resp = await crossFetch(input, init);
    const duration = Date.now() - start;

    log.debug(`fetch: request to ${url} returned HTTP ${resp.status} after ${duration} ms`);

    return resp;
  } catch (e) {
    const duration = Date.now() - start;
    log.debug(`fetch: request to ${url} threw an exception after ${duration} ms`);
    log.debug(`fetch: request to ${url} failed with:`, e);

    throw e;
  }
}

export default fetchLogged;
