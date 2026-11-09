import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import ThreadCard from './ThreadCard.vue';
import { request } from '../vscode_bridge';
import { reactionsOf, setReactions } from '../reactions';

vi.mock('../vscode_bridge', () => ({ request: vi.fn() }));
vi.mock('../view/code_blocks.ts', () => ({
  watchCodeBlocks: () => ({ update: () => {}, stop: () => {} }),
}));

const note = (id, authorName) => ({
  id,
  authorName,
  authorUsername: authorName.toLowerCase(),
  avatarUrl: 'https://example.com/a.png',
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  body: 'text',
  bodyHtml: '<p>text</p>',
  canEdit: false,
  canDelete: true,
});

const discussion = overrides => ({
  id: 'd1',
  line: 3,
  resolvable: true,
  resolved: false,
  canResolve: true,
  canReply: true,
  notes: [note('n1', 'Ann'), note('n2', 'Bob')],
  ...overrides,
});

const mountCard = overrides =>
  mount(ThreadCard, {
    props: { discussion: discussion(overrides), canComment: true },
    global: { stubs: { TimeAgo: true } },
  });

describe('ThreadCard', () => {
  it('shows an unresolved thread with a Reply button', () => {
    const wrapper = mountCard();

    expect(wrapper.find('.js-resolved-badge').text()).toBe('Unresolved');
    expect(wrapper.find('.gl-diff-link-button').text()).toBe('Reply');
  });

  it('shows a resolved thread folded with its badge', () => {
    const wrapper = mountCard({ resolved: true });

    expect(wrapper.find('.js-resolved-badge').text()).toBe('Resolved');
    expect(wrapper.classes()).toContain('gl-diff-card-resolved');
    expect(wrapper.find('.gl-diff-note').exists()).toBe(false);
  });

  it('shows no badge on a thread that cannot be resolved', () => {
    expect(mountCard({ resolvable: false }).find('.js-resolved-badge').exists()).toBe(false);
  });

  it('sizes the first avatar 20px and replies 16px, unnamed beside the name', () => {
    const avatars = mountCard().findAll('.js-avatar');

    expect(avatars.map(avatar => avatar.classes())).toEqual([
      expect.arrayContaining(['s20']),
      expect.arrayContaining(['s16']),
    ]);
    expect(avatars[0].attributes('alt')).toBe('');
  });

  it('names the delete confirmation', async () => {
    const wrapper = mountCard();
    await wrapper.find('[aria-label="Delete comment by Ann"]').trigger('click');

    const dialog = wrapper.find('[role="alertdialog"]');
    expect(wrapper.find(`#${dialog.attributes('aria-labelledby')}`).text()).toBe(
      'Delete this comment?',
    );
  });

  describe('reactions', () => {
    const eyes = { name: 'eyes', emoji: '👀', count: 2, users: ['Bob'], mine: true };
    const reactable = { notes: [{ ...note('n1', 'Ann'), canReact: true }] };

    beforeEach(() => {
      setReactions({});
      vi.mocked(request).mockReset();
    });

    it('offers a first reaction in the header of a note without any', () => {
      const wrapper = mountCard(reactable);

      expect(wrapper.find('.gl-diff-note-react').exists()).toBe(true);
      expect(wrapper.find('.gl-reactions').exists()).toBe(false);
    });

    it('offers nothing to a user who cannot react', () => {
      expect(mountCard().find('.gl-diff-note-react').exists()).toBe(false);
    });

    it('shows the reactions the host sent under the note', async () => {
      const wrapper = mountCard(reactable);
      setReactions({ n1: [eyes] });
      await nextTick();

      expect(wrapper.find('.gl-reaction').text()).toBe('👀2');
      expect(wrapper.find('.gl-reaction').attributes('aria-pressed')).toBe('true');
      expect(wrapper.find('.gl-diff-note-react').exists()).toBe(false);
    });

    it('removes the reaction at once and keeps what the host answers', async () => {
      const answered = { ...eyes, count: 1, mine: false };
      vi.mocked(request).mockResolvedValue({ reactions: [answered] });
      setReactions({ n1: [eyes] });
      const wrapper = mountCard(reactable);
      await wrapper.find('.gl-reaction').trigger('click');

      expect(request).toHaveBeenCalledWith('setReaction', {
        noteId: 'n1',
        name: 'eyes',
        on: false,
      });
      expect(wrapper.find('.gl-reaction').attributes('aria-pressed')).toBe('false');
      await flushPromises();
      expect(reactionsOf('n1')).toEqual([answered]);
    });

    it('puts the reaction back when the host could not remove it', async () => {
      vi.mocked(request).mockRejectedValue(new Error("Couldn't remove the reaction."));
      setReactions({ n1: [eyes] });
      const wrapper = mountCard(reactable);
      await wrapper.find('.gl-reaction').trigger('click');
      await flushPromises();

      expect(wrapper.find('.gl-reaction').text()).toBe('👀2');
      expect(wrapper.find('.gl-reaction').attributes('aria-pressed')).toBe('true');
    });
  });
});
