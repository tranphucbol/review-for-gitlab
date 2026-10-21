import { describe, expect, it } from 'vitest';
import { applyMention, findMentionQuery } from './mention_query';

describe('findMentionQuery', () => {
  it.each`
    text                 | caret | expected
    ${'@'}               | ${1}  | ${{ start: 0, query: '' }}
    ${'hi @an'}          | ${6}  | ${{ start: 3, query: 'an' }}
    ${'(@jo.hn-'}        | ${8}  | ${{ start: 1, query: 'jo.hn-' }}
    ${'line\n@ann'}      | ${9}  | ${{ start: 5, query: 'ann' }}
    ${'> @ann and more'} | ${6}  | ${{ start: 2, query: 'ann' }}
  `('finds $expected in $text', ({ text, caret, expected }) => {
    expect(findMentionQuery(text, caret)).toEqual(expected);
  });

  it.each`
    text              | caret
    ${'mail@example'} | ${12}
    ${'@ann smith'}   | ${10}
    ${'no mention'}   | ${10}
    ${''}             | ${0}
  `('finds nothing in $text', ({ text, caret }) => {
    expect(findMentionQuery(text, caret)).toBe(null);
  });
});

describe('applyMention', () => {
  it('completes the username and adds a space', () => {
    expect(applyMention('hi @an', 3, 6, 'anna')).toEqual({ text: 'hi @anna ', caret: 9 });
  });

  it('keeps the text after the caret', () => {
    expect(applyMention('@an please', 0, 3, 'anna')).toEqual({
      text: '@anna please',
      caret: 6,
    });
  });

  it('replaces the rest of a username the caret is inside', () => {
    expect(applyMention('@anxx, hi', 0, 3, 'anna')).toEqual({ text: '@anna , hi', caret: 6 });
  });
});
