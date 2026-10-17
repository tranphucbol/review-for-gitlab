import { vi, expect, it, describe } from 'vitest';
import { mount } from '@vue/test-utils';
import CommentForm from './CommentForm.vue';

const getSubmitButton = wrapper => wrapper.find('.js-submit');
const getCancelButton = wrapper => wrapper.find('.js-cancel');

describe('CommentForm', () => {
  let wrapper;

  beforeEach(() => {
    window.vsCodeApi = { postMessage: vi.fn() };
  });

  describe('not a part of a discussion thread', () => {
    beforeEach(() => {
      wrapper = mount(CommentForm, {
        propsData: {},
      });
    });

    it("doesn't show cancel button", async () => {
      expect(getCancelButton(wrapper).exists()).toBe(false);
    });

    describe('upon submitting the message', () => {
      beforeEach(async () => {
        await wrapper.find('textarea').setValue('test message');
        await getSubmitButton(wrapper).trigger('click');
      });

      it('sends out VS Code event', () => {
        expect(window.vsCodeApi.postMessage).toHaveBeenCalledWith({
          command: 'saveNote',
          note: 'test message',
        });
      });

      it('indicates the message is being sent', () => {
        expect(getSubmitButton(wrapper).text()).toBe('Saving...');
      });

      it('handles success', async () => {
        const event = new Event('message');
        event.data = { type: 'noteSaved' };
        await window.dispatchEvent(event);
        expect(wrapper.find('textarea').element.value).toBe('');
      });

      it('handles failure', async () => {
        const event = new Event('message');
        event.data = { type: 'noteSaved', status: false };
        await window.dispatchEvent(event);
        expect(wrapper.find('textarea').element.value).toBe('test message');
        expect(wrapper.text()).toContain('Failed to save your comment. Please try again.');
        expect(wrapper.find('.js-error').attributes('role')).toBe('alert');
        expect(wrapper.find('textarea').attributes('aria-invalid')).toBe('true');
      });

      it('clears the error when the next attempt starts', async () => {
        const event = new Event('message');
        event.data = { type: 'noteSaved', status: false };
        await window.dispatchEvent(event);
        await getSubmitButton(wrapper).trigger('click');
        expect(wrapper.find('.js-error').exists()).toBe(false);
        expect(wrapper.find('textarea').attributes('aria-invalid')).toBeUndefined();
      });
    });

    it('submits the message', async () => {
      await wrapper.find('textarea').setValue('test message');
      await getSubmitButton(wrapper).trigger('click');
      expect(window.vsCodeApi.postMessage).toHaveBeenCalledWith({
        command: 'saveNote',
        note: 'test message',
      });
    });
  });

  describe('submit hint', () => {
    const mountOn = platform => {
      vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform);
      return mount(CommentForm);
    };

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('shows the Mac shortcut on macOS', () => {
      expect(mountOn('MacIntel').find('.js-hint').text()).toBe('⌘+Enter to comment');
    });

    it('shows the Ctrl shortcut elsewhere', () => {
      expect(mountOn('Win32').find('.js-hint').text()).toBe('Ctrl+Enter to comment');
    });
  });

  describe('is a part of a discussion thread', () => {
    beforeEach(() => {
      wrapper = mount(CommentForm, {
        propsData: { replyId: 'testReplyId' },
      });
    });

    it('submits the message with replyId', async () => {
      await wrapper.find('textarea').setValue('test message');
      await getSubmitButton(wrapper).trigger('click');
      expect(window.vsCodeApi.postMessage).toHaveBeenCalledWith({
        command: 'saveNote',
        note: 'test message',
        replyId: 'testReplyId',
      });
    });
  });
});
