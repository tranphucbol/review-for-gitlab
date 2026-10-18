import { UserFriendlyError } from '../errors/user_friendly_error';
import { isUnauthorized } from './is_unauthorized';

describe('isUnauthorized', () => {
  it.each`
    description                         | error                                               | expected
    ${'an error with status 401'}       | ${Object.assign(new Error('401'), { status: 401 })} | ${true}
    ${'a response with status 401'}     | ${{ response: { status: 401 } }}                    | ${true}
    ${'an error with status 404'}       | ${Object.assign(new Error('404'), { status: 404 })} | ${false}
    ${'a response with status 500'}     | ${{ response: { status: 500 } }}                    | ${false}
    ${'an error without a status'}      | ${new Error('network')}                             | ${false}
    ${'something that is not an error'} | ${'401'}                                            | ${false}
    ${'nothing'}                        | ${undefined}                                        | ${false}
  `('returns $expected for $description', ({ error, expected }) => {
    expect(isUnauthorized(error)).toBe(expected);
  });

  it('looks through the errors that wrap the response', () => {
    const unauthorized = Object.assign(new Error('Response not successful'), {
      response: { status: 401 },
    });

    expect(isUnauthorized(new UserFriendlyError("Couldn't upload.", unauthorized))).toBe(true);
  });
});
