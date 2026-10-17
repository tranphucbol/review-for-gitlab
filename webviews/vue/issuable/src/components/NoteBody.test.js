import { vi, expect, it, describe, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import NoteBody from './NoteBody.vue';

describe('NoteBody', () => {
  beforeEach(() => {
    window.vsCodeApi = { postMessage: vi.fn() };
  });

  it('asks for the server rendering again when a reload replaces the note', async () => {
    const wrapper = mount(NoteBody, { props: { note: { id: 1, body: 'first' } } });
    expect(window.vsCodeApi.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'renderMarkdown', markdown: 'first', ref: 1 }),
    );

    await wrapper.setProps({ note: { id: 1, body: 'second' } });

    expect(window.vsCodeApi.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ command: 'renderMarkdown', markdown: 'second', ref: 1 }),
    );
  });
});
