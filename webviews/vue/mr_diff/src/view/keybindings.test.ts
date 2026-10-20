import { describe, expect, it } from 'vitest';
import { parseKey } from './keybindings';

const chord = (keyCode: string, modifiers: Partial<Record<string, boolean>> = {}) => ({
  ctrlCmd: false,
  shift: false,
  alt: false,
  winCtrl: false,
  keyCode,
  ...modifiers,
});

describe('parseKey', () => {
  it('reads cmd as the primary modifier on macOS and ctrl as it elsewhere', () => {
    expect(parseKey('cmd+b', true)).toEqual([chord('KeyB', { ctrlCmd: true })]);
    expect(parseKey('ctrl+b', true)).toEqual([chord('KeyB', { winCtrl: true })]);
    expect(parseKey('ctrl+b', false)).toEqual([chord('KeyB', { ctrlCmd: true })]);
  });

  it('reads function keys, named keys and punctuation', () => {
    expect(parseKey('shift+f7', false)).toEqual([chord('F7', { shift: true })]);
    expect(parseKey('alt+down', false)).toEqual([chord('DownArrow', { alt: true })]);
    expect(parseKey('ctrl+-', false)).toEqual([chord('Minus', { ctrlCmd: true })]);
  });

  it('reads a two-chord key', () => {
    expect(parseKey('cmd+k cmd+d', true)).toEqual([
      chord('KeyK', { ctrlCmd: true }),
      chord('KeyD', { ctrlCmd: true }),
    ]);
  });

  it('gives up on a key the panes cannot express', () => {
    expect(parseKey('ctrl+mouse4', false)).toBeUndefined();
    expect(parseKey('hyper+a', false)).toBeUndefined();
  });
});
