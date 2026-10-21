import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import MentionDropdown from './MentionDropdown.vue';

const ANNA = { username: 'anna', name: 'Anna Smith', participant: true };
const ANDY = { username: 'andy', name: 'Andy Jones', participant: false };

describe('MentionDropdown', () => {
  let textarea;
  let search;
  let wrapper;

  const flush = async () => {
    await nextTick();
    await nextTick();
  };

  const type = async value => {
    textarea.value = value;
    textarea.setSelectionRange(value.length, value.length);
    textarea.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(150);
    await flush();
  };

  const press = key => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    textarea.dispatchEvent(event);
    return event;
  };

  const list = () => document.body.querySelector('[role="listbox"]');
  const options = () => [...document.body.querySelectorAll('[role="option"]')];

  beforeEach(async () => {
    vi.useFakeTimers();
    textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    search = vi.fn().mockResolvedValue({ mentions: [ANNA, ANDY] });
    wrapper = mount(MentionDropdown, { props: { target: () => textarea, search } });
    await flush();
  });

  afterEach(() => {
    wrapper.unmount();
    textarea.remove();
    vi.useRealTimers();
  });

  it('searches for what follows the @ and lists the people found', async () => {
    await type('hi @an');

    expect(search).toHaveBeenCalledWith('an');
    expect(options().map(option => option.textContent)).toEqual([
      expect.stringContaining('@anna'),
      expect.stringContaining('@andy'),
    ]);
    expect(textarea.getAttribute('aria-expanded')).toBe('true');
    expect(textarea.getAttribute('aria-controls')).toBe(list().id);
  });

  it('asks once for a burst of keystrokes', async () => {
    textarea.value = '@a';
    textarea.setSelectionRange(2, 2);
    textarea.dispatchEvent(new Event('input'));
    await type('@an');

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('an');
  });

  it('shows nothing without an @ at the caret', async () => {
    await type('mail@example');

    expect(search).not.toHaveBeenCalled();
    expect(list()).toBe(null);
  });

  it('inserts the chosen username with Enter and keeps the key from the form', async () => {
    const onInput = vi.fn();
    textarea.addEventListener('input', onInput);
    const formKeydown = vi.fn();
    textarea.addEventListener('keydown', formKeydown);
    await type('hi @an');

    press('ArrowDown');
    await flush();
    const enter = press('Enter');
    await flush();

    expect(enter.defaultPrevented).toBe(true);
    expect(formKeydown).not.toHaveBeenCalled();
    expect(textarea.value).toBe('hi @andy ');
    expect(textarea.selectionStart).toBe(9);
    expect(onInput).toHaveBeenCalled();
    expect(list()).toBe(null);
  });

  it('closes on Escape without letting the comment box cancel', async () => {
    const formKeydown = vi.fn();
    textarea.addEventListener('keydown', formKeydown);
    await type('@an');

    press('Escape');
    await flush();

    expect(list()).toBe(null);
    expect(formKeydown).not.toHaveBeenCalled();
    expect(textarea.value).toBe('@an');
  });

  it('leaves keys alone while closed', async () => {
    const formKeydown = vi.fn();
    textarea.addEventListener('keydown', formKeydown);

    const enter = press('Enter');

    expect(enter.defaultPrevented).toBe(false);
    expect(formKeydown).toHaveBeenCalled();
  });

  it('chooses a person by click', async () => {
    await type('@an');

    options()[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();

    expect(textarea.value).toBe('@andy ');
  });

  it('shows the error when nobody could be loaded', async () => {
    search.mockResolvedValue({ mentions: [], error: 'Could not load project members.' });
    await type('@zz');

    expect(list().textContent).toContain('Could not load project members.');
    expect(options()).toEqual([]);
  });

  it('drops an answer that a later keystroke has overtaken', async () => {
    let answerFirst;
    search.mockReturnValueOnce(
      new Promise(resolve => {
        answerFirst = resolve;
      }),
    );
    await type('@a');
    await type('@and');
    answerFirst({ mentions: [ANNA] });
    await flush();

    expect(options().map(option => option.textContent)).toEqual([
      expect.stringContaining('@anna'),
      expect.stringContaining('@andy'),
    ]);
  });
});
