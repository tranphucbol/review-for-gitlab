import { vi, expect, it, describe } from 'vitest';
import { mount } from '@vue/test-utils';
import IssuableDiscussions from './IssuableDiscussions.vue';
import Discussion from './Discussion.vue';
import SystemNote from './SystemNote.vue';
import LabelNote from './LabelNote.vue';

const {
  singleNote,
  multipleNotes,
  systemNote,
  note1TextSnippet,
  note2TextSnippet,
  systemNoteTextSnippet,
} = require('../../../../../test/integration/fixtures/graphql/discussions');
const labelNote = require('../../../../../test/integration/fixtures/rest/label_events/added_normal.json');

const partOfLabelNote = 'addedCategory:Editor Extension';

describe('IssuableDiscussions', () => {
  beforeEach(() => {
    window.vsCodeApi = { postMessage: vi.fn() };
  });
  it.each`
    name                           | discussion       | component     | noteText
    ${'single note'}               | ${singleNote}    | ${Discussion} | ${note1TextSnippet}
    ${'multiple notes with note1'} | ${multipleNotes} | ${Discussion} | ${note1TextSnippet}
    ${'multiple notes with note2'} | ${multipleNotes} | ${Discussion} | ${note2TextSnippet}
    ${'system note'}               | ${systemNote}    | ${SystemNote} | ${systemNoteTextSnippet}
    ${'label event'}               | ${labelNote}     | ${LabelNote}  | ${partOfLabelNote}
  `('renders $name with correct component and text', ({ discussion, component, noteText }) => {
    const wrapper = mount(IssuableDiscussions, {
      propsData: {
        discussions: [discussion],
      },
      global: {
        stubs: {
          date: true,
        },
      },
    });
    const discussions = wrapper.findAllComponents(component);
    expect(discussions.length).toBe(1);
    expect(discussions.at(0).text()).toMatch(noteText);
  });

  describe('activity', () => {
    const systemNoteNumber = n => ({
      ...systemNote,
      replyId: `system-${n}`,
      notes: { nodes: [{ ...systemNote.notes.nodes[0], id: `note-${n}` }] },
    });
    const mountDiscussions = discussions =>
      mount(IssuableDiscussions, {
        props: { discussions },
        global: { stubs: { TimeAgo: true }, directives: { tooltip: () => {} } },
      });

    it('says so when there is nothing to show', () => {
      const wrapper = mountDiscussions([]);
      expect(wrapper.find('.js-empty').text()).toBe('No comments yet.');
    });

    it('keeps two consecutive events unfolded', () => {
      const wrapper = mountDiscussions([systemNoteNumber(1), labelNote]);
      expect(wrapper.findAll('.timeline-event').length).toBe(2);
      expect(wrapper.find('.js-show-events').exists()).toBe(false);
    });

    it('folds three or more consecutive events between the first and the last', async () => {
      const wrapper = mountDiscussions([
        systemNoteNumber(1),
        systemNoteNumber(2),
        systemNoteNumber(3),
        systemNoteNumber(4),
        singleNote,
        systemNoteNumber(5),
      ]);
      expect(wrapper.findAll('.timeline-event').length).toBe(3);
      expect(wrapper.find('.js-show-events').text()).toBe('Show 2 more events');

      await wrapper.find('.js-show-events').trigger('click');

      expect(wrapper.findAll('.timeline-event').length).toBe(5);
      expect(wrapper.find('.js-show-events').exists()).toBe(false);
    });

    it('filters to comments and remembers the choice', async () => {
      window.vsCodeApi = { postMessage: vi.fn(), getState: vi.fn(), setState: vi.fn() };
      const wrapper = mountDiscussions([systemNote, labelNote, singleNote]);

      await wrapper.find('.js-filter-comments').trigger('click');

      expect(wrapper.findAll('.timeline-event').length).toBe(0);
      expect(wrapper.findAllComponents(Discussion).length).toBe(1);
      expect(window.vsCodeApi.setState).toHaveBeenCalledWith({ activityFilter: 'comments' });
    });

    it('restores the filter from the webview state', () => {
      window.vsCodeApi = {
        postMessage: vi.fn(),
        getState: () => ({ activityFilter: 'comments' }),
        setState: vi.fn(),
      };
      const wrapper = mountDiscussions([systemNote, singleNote]);
      expect(wrapper.find('.js-filter-comments').attributes('aria-pressed')).toBe('true');
      expect(wrapper.findAll('.timeline-event').length).toBe(0);
    });
  });
});
