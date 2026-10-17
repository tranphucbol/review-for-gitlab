import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import CommentBox from './CommentBox.vue';

vi.mock('../vscode_bridge', () => ({ request: vi.fn() }));

const mountBox = () =>
  mount(CommentBox, {
    props: { label: 'Reply', submitLabel: 'Reply', send: vi.fn() },
  });

describe('CommentBox', () => {
  it('submits with its label and shows the shortcut', () => {
    const wrapper = mountBox();

    expect(wrapper.find('button[type="submit"]').text()).toBe('Reply');
    expect(wrapper.find('.gl-diff-comment-hint').text()).toMatch(/^(⌘|Ctrl)\+Enter to reply$/);
  });

  it('ties each tab to its panel', () => {
    const wrapper = mountBox();
    const [write, preview] = wrapper.findAll('[role="tab"]');

    expect(write.attributes('tabindex')).toBe('0');
    expect(preview.attributes('tabindex')).toBe('-1');
    const panel = wrapper.find(`#${write.attributes('aria-controls')}`);
    expect(panel.attributes('role')).toBe('tabpanel');
    expect(panel.attributes('aria-labelledby')).toBe(write.attributes('id'));
  });

  it('cancels on Escape', async () => {
    const wrapper = mountBox();
    await wrapper.find('textarea').trigger('keydown', { key: 'Escape' });

    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });
});
