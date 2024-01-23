import { stackToArray, DetailedError } from '../../common/errors/common';

const getErrorType = (body: string): string | unknown => {
  try {
    const parsedBody = JSON.parse(body);
    return parsedBody?.error;
  } catch {
    return undefined;
  }
};

const isInvalidTokenError = (response: Response, body?: string) =>
  Boolean(response.status === 401 && body && getErrorType(body) === 'invalid_token');

const isInvalidRefresh = (response: Response, body?: string) =>
  Boolean(response.status === 400 && body && getErrorType(body) === 'invalid_grant');

export class FetchError extends Error implements DetailedError {
  response: Response;

  #body?: string;

  constructor(response: Response, resourceName: string, body?: string) {
    let message = `Fetching ${resourceName} from ${response.url} failed`;
    if (isInvalidTokenError(response, body)) {
      message = `Request for ${resourceName} failed because the token is expired or revoked.`;
    }
    if (isInvalidRefresh(response, body)) {
      message = `Request to refresh token failed, because it's revoked or already refreshed.`;
    }
    super(message);
    this.response = response;
    this.#body = body;
  }

  get status() {
    return this.response.status;
  }

  isInvalidToken(): boolean {
    return (
      isInvalidTokenError(this.response, this.#body) || isInvalidRefresh(this.response, this.#body)
    );
  }

  get details() {
    const { message, stack } = this;
    return {
      message,
      stack: stackToArray(stack),
      response: {
        status: this.response.status,
        headers: this.response.headers,
        body: this.#body,
      },
    };
  }
}
