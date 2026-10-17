import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import StatePill from './StatePill.vue';

describe('StatePill', () => {
  it.each`
    state       | isMergeRequest | text        | icon
    ${'opened'} | ${false}       | ${'Open'}   | ${'issue-opened'}
    ${'closed'} | ${false}       | ${'Closed'} | ${'issue-closed'}
    ${'opened'} | ${true}        | ${'Open'}   | ${'git-pull-request'}
    ${'merged'} | ${true}        | ${'Merged'} | ${'git-merge'}
    ${'closed'} | ${true}        | ${'Closed'} | ${'git-pull-request-closed'}
    ${'locked'} | ${true}        | ${'Locked'} | ${'lock'}
  `(
    'shows $text with $icon for $state (merge request: $isMergeRequest)',
    ({ state, isMergeRequest, text, icon }) => {
      const wrapper = mount(StatePill, { props: { state, isMergeRequest } });

      expect(wrapper.text()).toBe(text);
      expect(wrapper.classes()).toContain(`state-pill--${state}`);
      expect(wrapper.find(`.codicon-${icon}`).exists()).toBe(true);
    },
  );

  it('renders nothing for an unknown state', () => {
    const wrapper = mount(StatePill, { props: { state: 'all' } });

    expect(wrapper.find('.state-pill').exists()).toBe(false);
  });
});
