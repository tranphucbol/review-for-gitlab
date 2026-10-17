import { expect, it, describe } from 'vitest';
import { mount } from '@vue/test-utils';
import Discussion from './Discussion.vue';
import CommentForm from './CommentForm.vue';

const {
  discussionOnDiff,
  singleNote,
  multipleNotes,
  note1TextSnippet,
  note2TextSnippet,
} = require('../../../../../test/integration/fixtures/graphql/discussions');

const getReplyButton = wrapper => wrapper.find('.js-reply');
const getCollapseButton = wrapper => wrapper.find('.js-collapse');
const getCommentForm = wrapper => wrapper.findComponent(CommentForm);

describe('Discussion', () => {
  let wrapper;

  describe('with multiple comments', () => {
    beforeEach(() => {
      wrapper = mount(Discussion, {
        props: {
          noteable: multipleNotes,
        },
        global: {
          stubs: {
            date: true,
          },
        },
      });
    });
    it('shows all comments by default', () => {
      expect(wrapper.text()).toContain(note1TextSnippet);
      expect(wrapper.text()).toContain(note2TextSnippet);
    });

    it('shows reply button', () => {
      expect(getReplyButton(wrapper).exists()).toBe(true);
    });

    describe('collapsing and uncollapsing', () => {
      it('hides reply button and second message when we collapse replies', async () => {
        await getCollapseButton(wrapper).trigger('click');
        expect(wrapper.text()).not.toContain(note2TextSnippet);
        expect(getReplyButton(wrapper).exists()).toBe(false);
      });

      it('shows reply button and the replies if they were uncollapsed', async () => {
        const collapseButton = getCollapseButton(wrapper);
        await collapseButton.trigger('click');
        await collapseButton.trigger('click');
        expect(wrapper.text()).toContain(note2TextSnippet);
        expect(getReplyButton(wrapper).exists()).toBe(true);
      });
    });

    describe('comment form', () => {
      it("doesn't show comment form by default", () => {
        expect(getCommentForm(wrapper).exists()).toBe(false);
      });

      it('opens the comment form when we click reply button', async () => {
        await getReplyButton(wrapper).trigger('click');
        expect(getCommentForm(wrapper).exists()).toBe(true);
      });

      it('hides the comment form when we click cancel button', async () => {
        await getReplyButton(wrapper).trigger('click');
        const commentForm = getCommentForm(wrapper);
        await commentForm.find('.js-cancel').trigger('click');
        expect(getCommentForm(wrapper).exists()).toBe(false);
      });
    });
  });

  const mountDiscussion = noteable =>
    mount(Discussion, { props: { noteable }, global: { stubs: { date: true } } });

  describe('thread header', () => {
    it('shows the file chip of a diff thread', () => {
      wrapper = mountDiscussion(discussionOnDiff);
      expect(wrapper.find('.js-file-chip').text()).toBe(
        'src/webview/src/components/LabelNoteOld.vue:48',
      );
    });

    it('shows no file chip for an overview thread', () => {
      wrapper = mountDiscussion(singleNote);
      expect(wrapper.find('.js-file-chip').exists()).toBe(false);
    });

    it('marks a resolvable thread as unresolved', () => {
      wrapper = mountDiscussion(singleNote);
      expect(wrapper.find('.js-resolved-badge').text()).toBe('Unresolved');
    });

    it('shows no badge when the thread cannot be resolved', () => {
      wrapper = mountDiscussion({ ...singleNote, resolvable: false });
      expect(wrapper.find('.js-resolved-badge').exists()).toBe(false);
    });

    it('links the note to GitLab', () => {
      wrapper = mountDiscussion(discussionOnDiff);
      expect(wrapper.find('.js-open-note').attributes('href')).toBe(
        discussionOnDiff.notes.nodes[0].url,
      );
    });
  });

  describe('resolved thread', () => {
    beforeEach(() => {
      wrapper = mountDiscussion({ ...multipleNotes, resolved: true });
    });

    it('starts folded to the first note', () => {
      expect(wrapper.find('.js-resolved-badge').text()).toBe('Resolved');
      expect(wrapper.classes()).toContain('discussion--folded');
      expect(wrapper.text()).not.toContain(note2TextSnippet);
      expect(getReplyButton(wrapper).exists()).toBe(false);
    });

    it('unfolds when expanded', async () => {
      await getCollapseButton(wrapper).trigger('click');
      expect(wrapper.classes()).not.toContain('discussion--folded');
      expect(wrapper.text()).toContain(note2TextSnippet);
    });

    it('can unfold a resolved thread without replies', async () => {
      wrapper = mountDiscussion({ ...singleNote, resolved: true });
      expect(getCollapseButton(wrapper).text()).toBe('Expand thread');
      await getCollapseButton(wrapper).trigger('click');
      expect(getReplyButton(wrapper).exists()).toBe(true);
    });
  });
});
