import { getPersonalAccessTokenDetails } from './get_personal_access_token_details';

describe('getPersonalAccessTokenDetails', () => {
  it('creates request', async () => {
    const request = getPersonalAccessTokenDetails();

    expect(request).toEqual({
      type: 'rest',
      method: 'GET',
      path: '/personal_access_tokens/self',
    });
  });
});
