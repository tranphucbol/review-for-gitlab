import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ResolvedBadge from './ResolvedBadge.vue';

describe('ResolvedBadge', () => {
  it.each`
    resolved | text            | modifier
    ${true}  | ${'Resolved'}   | ${'resolved-badge--resolved'}
    ${false} | ${'Unresolved'} | ${'resolved-badge--open'}
  `('shows $text', ({ resolved, text, modifier }) => {
    const wrapper = mount(ResolvedBadge, {
      props: { resolved },
      slots: { icon: '<i class="icon"></i>' },
    });

    expect(wrapper.text()).toBe(text);
    expect(wrapper.classes()).toContain(modifier);
    expect(wrapper.find('.icon').exists()).toBe(true);
  });
});
