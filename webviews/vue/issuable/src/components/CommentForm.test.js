import { afterEach, vi, expect, it, describe } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
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
        expect(getSubmitButton(wrapper).text()).toBe('Saving…');
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
        propsData: { replyId: 'testReplyId', submitLabel: 'Reply' },
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

    it('labels the submit button and the hint with the submit label', () => {
      expect(getSubmitButton(wrapper).text()).toBe('Reply');
      expect(wrapper.find('.js-hint').text()).toMatch(/ to reply$/);
    });

    it('cancels the reply on Escape', async () => {
      await wrapper.find('textarea').trigger('keydown', { key: 'Escape' });
      expect(wrapper.emitted('cancel-edit')).toHaveLength(1);
    });
  });

  it('keeps a new comment on Escape', async () => {
    wrapper = mount(CommentForm);
    await wrapper.find('textarea').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('cancel-edit')).toBeUndefined();
  });

  describe('preview', () => {
    const dispatch = async data => {
      const event = new Event('message');
      event.data = data;
      window.dispatchEvent(event);
      await wrapper.vm.$nextTick();
    };

    beforeEach(() => {
      wrapper = mount(CommentForm);
    });

    it('says there is nothing to preview for an empty comment', async () => {
      await wrapper.find('.js-preview-tab').trigger('click');
      expect(wrapper.find('.js-preview').text()).toBe('Nothing to preview.');
      expect(window.vsCodeApi.postMessage).not.toHaveBeenCalled();
    });

    it('shows a local rendering until GitLab renders the comment', async () => {
      await wrapper.find('textarea').setValue('**bold**');
      await wrapper.find('.js-preview-tab').trigger('click');

      const [[message]] = window.vsCodeApi.postMessage.mock.calls;
      expect(message).toEqual(
        expect.objectContaining({
          command: 'renderMarkdown',
          markdown: '**bold**',
          object: 'preview',
        }),
      );
      expect(wrapper.find('.js-preview').attributes('aria-busy')).toBe('true');
      expect(wrapper.find('.js-preview strong').text()).toBe('bold');

      await dispatch({
        type: 'markdownRendered',
        object: 'preview',
        ref: message.ref,
        markdown: '<p>server</p>',
      });

      expect(wrapper.find('.js-preview').text()).toBe('server');
      expect(wrapper.find('.js-preview').attributes('aria-busy')).toBe('false');
    });

    it('ignores the rendering of another form', async () => {
      await wrapper.find('textarea').setValue('mine');
      await wrapper.find('.js-preview-tab').trigger('click');
      await dispatch({
        type: 'markdownRendered',
        object: 'preview',
        ref: 'other',
        markdown: '<p>theirs</p>',
      });
      expect(wrapper.find('.js-preview').text()).toBe('mine');
    });

    it('marks the selected tab', async () => {
      await wrapper.find('.js-preview-tab').trigger('click');
      expect(wrapper.find('.js-preview-tab').attributes('aria-selected')).toBe('true');
      expect(wrapper.find('.js-write-tab').attributes('aria-selected')).toBe('false');
    });
  });

  describe('pasting an image', () => {
    const image = new File(['png'], 'shot.png', { type: 'image/png' });

    const paste = files => wrapper.find('textarea').trigger('paste', { clipboardData: { files } });

    const answer = async data => {
      const event = new Event('message');
      event.data = { type: 'imageUploaded', ...data };
      window.dispatchEvent(event);
      await flushPromises();
    };

    const uploadRequest = () =>
      window.vsCodeApi.postMessage.mock.calls
        .map(([message]) => message)
        .find(message => message.command === 'uploadImage');

    // FileReader answers on a later task
    const uploadRequested = async () => {
      for (let i = 0; i < 50 && !uploadRequest(); i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise(resolve => {
          setTimeout(resolve, 0);
        });
      }
    };

    beforeEach(() => {
      wrapper = mount(CommentForm);
    });

    it('uploads the image and replaces the placeholder with its markdown', async () => {
      await paste([image]);
      await uploadRequested();

      expect(wrapper.find('textarea').element.value).toBe('![Uploading shot.png…]()');
      expect(wrapper.find('.js-uploading').exists()).toBe(true);
      expect(getSubmitButton(wrapper).attributes('disabled')).toBeDefined();
      const request = uploadRequest();
      expect(request).toEqual({
        command: 'uploadImage',
        requestId: expect.any(Number),
        name: 'shot.png',
        contentType: 'image/png',
        base64: btoa('png'),
      });

      await answer({ requestId: request.requestId, markdown: '![shot](/uploads/a/shot.png)' });

      expect(wrapper.find('textarea').element.value).toBe('![shot](/uploads/a/shot.png)');
      expect(wrapper.find('.js-uploading').exists()).toBe(false);
    });

    it('removes the placeholder and shows the message when the upload fails', async () => {
      await wrapper.find('textarea').setValue('draft ');
      await paste([image]);
      await uploadRequested();

      await answer({ requestId: uploadRequest().requestId, error: "Couldn't upload the image." });

      expect(wrapper.find('textarea').element.value).toBe('draft ');
      expect(wrapper.find('.js-upload-error').text()).toBe("Couldn't upload the image.");
      expect(wrapper.find('.js-upload-error').attributes('role')).toBe('alert');
    });

    it('leaves a paste without an image to the textarea', async () => {
      await paste([new File(['text'], 'notes.txt', { type: 'text/plain' })]);
      expect(uploadRequest()).toBeUndefined();
    });

    it('refuses an image larger than 10 MB without uploading it', async () => {
      const big = new File(['png'], 'big.png', { type: 'image/png' });
      Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
      await paste([big]);
      expect(uploadRequest()).toBeUndefined();
      expect(wrapper.find('.js-upload-error').text()).toBe(
        'The image big.png is larger than 10 MB.',
      );
    });
  });

  describe('mentioning someone', () => {
    const typeMention = async () => {
      const textarea = wrapper.find('textarea');
      await textarea.setValue('@an');
      textarea.element.setSelectionRange(3, 3);
      await textarea.trigger('input');
      vi.advanceTimersByTime(150);
      await flushPromises();
      return textarea;
    };

    const mentionRequest = () =>
      window.vsCodeApi.postMessage.mock.calls
        .map(([message]) => message)
        .find(message => message.command === 'searchMentions');

    const answer = async data => {
      const event = new Event('message');
      event.data = { type: 'mentionsFound', requestId: mentionRequest().requestId, ...data };
      window.dispatchEvent(event);
      await flushPromises();
    };

    beforeEach(async () => {
      vi.useFakeTimers();
      wrapper = mount(CommentForm, { propsData: { replyId: 'thread' }, attachTo: document.body });
      await flushPromises();
    });

    afterEach(() => {
      wrapper.unmount();
      vi.useRealTimers();
    });

    it('asks the host and writes the chosen username into the note', async () => {
      const textarea = await typeMention();
      expect(mentionRequest()).toEqual({
        command: 'searchMentions',
        requestId: expect.any(Number),
        query: 'an',
      });
      await answer({ mentions: [{ username: 'anna', name: 'Anna Smith', participant: true }] });

      await textarea.trigger('keydown', { key: 'Enter' });
      await flushPromises();

      expect(wrapper.vm.note).toBe('@anna ');
    });

    it('closes the list on Escape without cancelling the reply', async () => {
      const textarea = await typeMention();
      await answer({ mentions: [{ username: 'anna', name: 'Anna Smith', participant: true }] });

      await textarea.trigger('keydown', { key: 'Escape' });

      expect(wrapper.emitted('cancel-edit')).toBeUndefined();
      expect(document.body.querySelector('[role="listbox"]')).toBe(null);
    });

    it('shows why nobody could be suggested', async () => {
      await typeMention();
      await answer({ mentions: [], error: 'Could not load project members.' });

      expect(document.body.querySelector('[role="listbox"]').textContent).toContain(
        'Could not load project members.',
      );
    });
  });
});
