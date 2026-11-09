import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ReactionBar from './ReactionBar.vue';

const EYES = { name: 'eyes', emoji: '👀', count: 1, users: ['Alice'], mine: false };
const EMOJIS = [
  { name: 'eyes', emoji: '👀', description: 'eyes', category: 'people' },
  { name: 'dog', emoji: '🐶', description: 'dog face', category: 'nature' },
  { name: 'hotdog', emoji: '🌭', description: 'hot dog', category: 'food' },
];

describe('ReactionBar', () => {
  let wrapper;

  const mountBar = (props = {}) => {
    wrapper = mount(ReactionBar, {
      attachTo: document.body,
      props: {
        reactions: [EYES],
        canReact: true,
        loadEmojis: vi.fn().mockResolvedValue({ emojis: EMOJIS }),
        ...props,
      },
    });
  };

  const picker = () => document.body.querySelector('[role="dialog"]');
  const search = () => picker().querySelector('input');
  const options = () => [...picker().querySelectorAll('[role="option"]')];
  const press = key =>
    search().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

  const openPicker = async () => {
    await wrapper.find('.gl-reaction-add-button').trigger('click');
    await flushPromises();
  };

  afterEach(() => wrapper?.unmount());

  it('toggles a reaction from its pill', async () => {
    mountBar();

    await wrapper.find('.gl-reaction').trigger('click');

    expect(wrapper.emitted('toggle')).toEqual([[{ name: 'eyes', on: true, emoji: '👀' }]]);
  });

  it('shows the common emoji first and picks one with the mouse', async () => {
    mountBar();
    await openPicker();

    const headings = [...picker().querySelectorAll('[role="group"]')].map(g =>
      g.getAttribute('aria-label'),
    );
    expect(headings).toEqual(['Common', 'Smileys & people', 'Animals & nature', 'Food & drink']);

    options()
      .find(option => option.getAttribute('aria-label') === 'thumbsup')
      .click();
    await flushPromises();

    expect(wrapper.emitted('toggle')).toEqual([[{ name: 'thumbsup', on: true, emoji: '👍' }]]);
    expect(picker()).toBeNull();
  });

  it('searches and picks with the keyboard, turning off a reaction already left', async () => {
    mountBar({ reactions: [{ ...EYES, mine: true }] });
    await openPicker();

    search().value = 'dog';
    search().dispatchEvent(new Event('input'));
    await flushPromises();
    expect(options().map(o => o.getAttribute('aria-label'))).toEqual(['dog', 'hotdog']);
    press('ArrowRight');
    await flushPromises();
    expect(picker().querySelector('.gl-emoji-picker-footer').textContent).toContain(':hotdog:');

    search().value = 'eyes';
    search().dispatchEvent(new Event('input'));
    await flushPromises();
    press('Enter');
    await flushPromises();

    expect(wrapper.emitted('toggle')).toEqual([[{ name: 'eyes', on: false, emoji: '👀' }]]);
  });

  it('closes on Escape and on a click outside', async () => {
    mountBar();
    await openPicker();
    press('Escape');
    await flushPromises();
    expect(picker()).toBeNull();

    await openPicker();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flushPromises();
    expect(picker()).toBeNull();
  });

  it('says when only the common emoji could be shown', async () => {
    mountBar({
      loadEmojis: vi.fn().mockResolvedValue({
        emojis: EMOJIS.slice(0, 1),
        error: 'Only common emoji are available.',
      }),
    });
    await openPicker();

    expect(picker().textContent).toContain('Only common emoji are available.');
  });

  it('is read-only without permission', async () => {
    mountBar({ canReact: false });

    await wrapper.find('.gl-reaction').trigger('click');

    expect(wrapper.emitted('toggle')).toBeUndefined();
    expect(wrapper.find('.gl-reaction-add').exists()).toBe(false);
  });
});
