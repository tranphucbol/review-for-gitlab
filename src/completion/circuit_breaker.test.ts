import { CircuitBreaker } from './circuit_breaker';

describe('CircuitBreaker', () => {
  it('does not break by default', () => {
    const cb = new CircuitBreaker(2, 1000);
    expect(cb.isBreaking()).toBe(false);
  });

  it('breaks after the max number of errors has been reached', () => {
    const cb = new CircuitBreaker(2, 1000);
    cb.error();
    expect(cb.isBreaking()).toBe(false);
    cb.error();
    expect(cb.isBreaking()).toBe(true);
  });

  it('success removes the break', () => {
    const cb = new CircuitBreaker(1, 1000);
    cb.error();
    expect(cb.isBreaking()).toBe(true);
    cb.success();
    expect(cb.isBreaking()).toBe(false);
  });

  it('removes the break after the breakTimeMs', () => {
    const errorDate = new Date();
    jest.useFakeTimers().setSystemTime(errorDate);
    const cb = new CircuitBreaker(1, 1000);
    cb.error();
    expect(cb.isBreaking()).toBe(true);
    // after 1001 ms, the break is removed
    jest.useFakeTimers().setSystemTime(new Date(errorDate.valueOf() + 1001));
    expect(cb.isBreaking()).toBe(false);
  });

  it('instantly breaks if an error comes after expired break', () => {
    const errorDate = new Date();
    jest.useFakeTimers().setSystemTime(errorDate);
    const cb = new CircuitBreaker(1, 1000);
    cb.error();
    // after 1001 ms, the break is removed
    jest.useFakeTimers().setSystemTime(new Date(errorDate.valueOf() + 1001));
    cb.error();
    expect(cb.isBreaking()).toBe(true);
  });
});
