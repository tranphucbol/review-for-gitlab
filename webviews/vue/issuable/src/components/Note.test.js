import { vi, expect, it, describe } from 'vitest';
import { mount } from '@vue/test-utils';
import Note from './Note.vue';

const {
  noteOnDiffWithSuggestion,
} = require('../../../../../test/integration/fixtures/graphql/discussions');

describe('Note', () => {
  let wrapper;
  const tooltipDirective = vi.fn();

  beforeEach(() => {
    tooltipDirective.mockReset();
    window.vsCodeApi = { postMessage: vi.fn() };
  });
  describe('initializes suggestions', () => {
    beforeEach(() => {
      wrapper = mount(Note, {
        propsData: {
          noteable: noteOnDiffWithSuggestion,
        },
        global: {
          stubs: {
            TimeAgo: true,
          },
          directives: {
            tooltip: tooltipDirective,
          },
        },
      });
    });

    it('contains two initialized suggestions', () => {
      expect(wrapper.findAll('.suggestion').length).toBe(2);
    });

    it('suggestion header', () => {
      const suggestionHeader = wrapper.find('.suggestion .header');
      expect(suggestionHeader.text()).toMatch(/Suggested change:\s+open on the web/);
    });

    it('opens suggestion on the web', () => {
      const openOnTheWebLink = wrapper.find('.suggestion .header a');
      expect(openOnTheWebLink.attributes('href')).toBe(noteOnDiffWithSuggestion.url);
    });

    it('wraps original suggestion', () => {
      const firstSuggestedLine = wrapper.find('.suggestion .line');
      expect(firstSuggestedLine.text()).toBe('function anotherFunction1(): void{');
    });
  });

  describe('reactions', () => {
    const EYES = { name: 'eyes', emoji: '👀', count: 2, users: ['Alice'], mine: true };
    let reactions;

    const mountNote = (noteable, groups = []) => {
      reactions = {
        groupsOf: vi.fn().mockReturnValue(groups),
        toggle: vi.fn(),
        loadEmojis: vi.fn().mockResolvedValue({ emojis: [] }),
      };
      wrapper = mount(Note, {
        props: { noteable },
        global: { stubs: { TimeAgo: true }, provide: { reactions } },
      });
    };

    const reactable = { ...noteOnDiffWithSuggestion, userPermissions: { awardEmoji: true } };

    it('shows nothing without the store', () => {
      wrapper = mount(Note, {
        props: { noteable: reactable },
        global: { stubs: { TimeAgo: true } },
      });

      expect(wrapper.find('.js-add-reaction').exists()).toBe(false);
      expect(wrapper.find('.js-reactions').exists()).toBe(false);
    });

    it('offers to react in the header when there are no reactions', () => {
      mountNote(reactable);

      expect(reactions.groupsOf).toHaveBeenCalledWith(reactable.id);
      expect(wrapper.find('.js-add-reaction').exists()).toBe(true);
      expect(wrapper.find('.js-reactions').exists()).toBe(false);
    });

    it('shows the reactions under the body and toggles one', async () => {
      mountNote(reactable, [EYES]);

      const pill = wrapper.find('.js-reactions .gl-reaction');
      expect(pill.text()).toBe('👀2');
      expect(pill.attributes('aria-pressed')).toBe('true');
      expect(pill.attributes('title')).toBe('You and Alice reacted with :eyes:');
      expect(wrapper.find('.js-add-reaction').exists()).toBe(false);

      await pill.trigger('click');

      expect(reactions.toggle).toHaveBeenCalledWith(reactable.id, 'eyes', false, '👀');
    });

    it('shows the reactions read-only without permission, and none on a system note', () => {
      mountNote({ ...reactable, userPermissions: { awardEmoji: false } }, [EYES]);

      expect(wrapper.find('.gl-reaction').attributes('aria-disabled')).toBe('true');
      expect(wrapper.find('.gl-reaction-add').exists()).toBe(false);

      mountNote({ ...reactable, system: true });
      expect(wrapper.find('.js-add-reaction').exists()).toBe(false);
    });
  });
});
