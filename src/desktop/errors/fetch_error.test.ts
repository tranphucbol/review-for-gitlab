import { createFakePartial } from '../../common/test_utils/create_fake_partial';
import { FetchError } from './fetch_error';

describe('FetchError', () => {
  it('indicates invalid token', () => {
    const error = new FetchError(
      createFakePartial<Response>({
        ok: false,
        url: 'https://example.com/api/v4/project',
        status: 401,
      }),
      'resource name',
      `{ "error": "invalid_token" }`,
    );
    expect(error.isInvalidToken()).toBe(true);
    expect(error.message).toMatch(/token is expired or revoked/);
  });

  it('indicates invalid grant as invalid token', () => {
    const error = new FetchError(
      createFakePartial<Response>({
        ok: false,
        url: 'https://example.com/api/v4/project',
        status: 400,
      }),
      'resource name',
      `{ "error": "invalid_grant" }`,
    );
    expect(error.isInvalidToken()).toBe(true);
    expect(error.message).toMatch(/Request to refresh token failed/);
  });
});
