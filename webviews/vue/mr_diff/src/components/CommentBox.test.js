import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import CommentBox from './CommentBox.vue';
import { request } from '../vscode_bridge';

vi.mock('../vscode_bridge', () => ({ request: vi.fn() }));

const mountBox = (options = {}) =>
  mount(CommentBox, {
    props: { label: 'Reply', submitLabel: 'Reply', send: vi.fn() },
    ...options,
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

  describe('mentions', () => {
    const typeMention = async wrapper => {
      const textarea = wrapper.find('textarea');
      await textarea.setValue('@an');
      textarea.element.setSelectionRange(3, 3);
      await textarea.trigger('input');
      vi.advanceTimersByTime(150);
      await flushPromises();
      return textarea;
    };

    beforeEach(() => {
      vi.useFakeTimers();
      request.mockResolvedValue({
        command: 'result',
        mentions: [{ username: 'anna', name: 'Anna Smith', participant: true }],
      });
    });

    afterEach(() => {
      vi.useRealTimers();
      request.mockReset();
    });

    it('asks the host for people and writes the chosen one into the body', async () => {
      const wrapper = mountBox({ attachTo: document.body });
      await flushPromises();
      const textarea = await typeMention(wrapper);

      expect(request).toHaveBeenCalledWith('searchMentions', { query: 'an' });
      await textarea.trigger('keydown', { key: 'Enter' });
      await flushPromises();

      expect(textarea.element.value).toBe('@anna ');
      expect(wrapper.vm.body).toBe('@anna ');
      wrapper.unmount();
    });

    it('closes the list on Escape and keeps the comment box open', async () => {
      const wrapper = mountBox({ attachTo: document.body });
      await flushPromises();
      const textarea = await typeMention(wrapper);

      await textarea.trigger('keydown', { key: 'Escape' });

      expect(wrapper.emitted('cancel')).toBeUndefined();
      expect(document.body.querySelector('[role="listbox"]')).toBe(null);
      wrapper.unmount();
    });
  });
});
