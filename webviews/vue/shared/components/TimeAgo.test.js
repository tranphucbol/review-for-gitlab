import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import TimeAgo from './TimeAgo.vue';

describe('TimeAgo', () => {
  it('shows the relative date in a time element', () => {
    const date = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const wrapper = mount(TimeAgo, { props: { date } });

    expect(wrapper.element.tagName).toBe('TIME');
    expect(wrapper.attributes('datetime')).toBe(date);
    expect(wrapper.text()).toBe('3 hours ago');
  });

  it('renders nothing for an invalid date', () => {
    const wrapper = mount(TimeAgo, { props: { date: 'not a date' } });

    expect(wrapper.find('time').exists()).toBe(false);
  });
});
