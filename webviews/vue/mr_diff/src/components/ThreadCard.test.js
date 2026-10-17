import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ThreadCard from './ThreadCard.vue';

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
});
