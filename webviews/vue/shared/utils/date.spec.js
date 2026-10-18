import { describe, expect, it } from 'vitest';
import { absoluteDate, isoDate, relativeDate } from './date';

const created = '2024-01-05T07:30:00.000Z';

describe('date', () => {
  it('formats a date relative to now', () => {
    expect(relativeDate(created, '2024-01-05T10:30:00.000Z')).toBe('3 hours ago');
    expect(relativeDate(created, '2024-01-08T07:30:00.000Z')).toBe('3 days ago');
  });

  it('formats an absolute date with its offset', () => {
    expect(absoluteDate(created)).toMatch(/^Jan 5, 2024 \d{1,2}:30(am|pm) GMT[+-]\d{4}$/);
  });

  it('gives the ISO value for a time element', () => {
    expect(isoDate(created)).toBe(created);
  });

  it.each([undefined, null, '', 'not a date'])('returns an empty string for %s', date => {
    expect(relativeDate(date)).toBe('');
    expect(absoluteDate(date)).toBe('');
    expect(isoDate(date)).toBe('');
  });
});
