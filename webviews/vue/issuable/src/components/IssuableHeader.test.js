import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import IssuableHeader from './IssuableHeader.vue';

const openMr = require('../../../../../test/integration/fixtures/rest/open_mr.json');
const openIssue = require('../../../../../test/integration/fixtures/rest/open_issue.json');

describe('IssuableHeader', () => {
  let wrapper;
  let writeText;

  const createWrapper = issuable => {
    wrapper = mount(IssuableHeader, {
      props: { issuable },
      global: { directives: { tooltip: vi.fn() } },
    });
  };

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('merge request', () => {
    beforeEach(() => createWrapper(openMr));

    it('shows state, short reference, title, author and branches', () => {
      expect(wrapper.find('.state-pill').text()).toBe('Open');
      expect(wrapper.find('.codicon-git-pull-request').exists()).toBe(true);
      expect(wrapper.find('.js-reference').text()).toBe('!33824');
      expect(wrapper.find('.issuable-header__title').text()).toBe(openMr.title);
      expect(wrapper.find('.issuable-header__meta').text()).toContain(openMr.author.name);
      expect(wrapper.find('.issuable-header__meta').text()).toContain('wants to merge');
      expect(wrapper.find('.js-source-branch').text()).toBe('web-ide-remove-dead-code');
      expect(wrapper.find('.js-target-branch').text()).toBe('master');
      expect(wrapper.find('.js-draft').exists()).toBe(false);
    });

    it('links to GitLab', () => {
      const link = wrapper.find('.js-open-in-gitlab');

      expect(link.attributes('href')).toBe(openMr.web_url);
      expect(link.attributes('title')).toBe('Open in GitLab');
    });
  });

  describe('draft', () => {
    it('uses work_in_progress when the instance has no draft field (13.12)', () => {
      const { draft, ...mr } = { ...openMr, work_in_progress: true };
      createWrapper(mr);

      expect(wrapper.find('.js-draft').text()).toBe('Draft');
    });

    it('prefers draft over work_in_progress', () => {
      createWrapper({ ...openMr, draft: false, work_in_progress: true });

      expect(wrapper.find('.js-draft').exists()).toBe(false);
    });
  });

  describe('issue', () => {
    beforeEach(() => createWrapper(openIssue));

    it('shows the issue state, reference and "opened"', () => {
      expect(wrapper.find('.codicon-issue-opened').exists()).toBe(true);
      expect(wrapper.find('.js-reference').text()).toMatch(/^#\d+$/);
      expect(wrapper.find('.issuable-header__meta').text()).toContain('opened');
      expect(wrapper.find('.js-source-branch').exists()).toBe(false);
    });
  });

  it('renders no reference or copy button without references', () => {
    const { references, ...issue } = openIssue;
    createWrapper(issue);

    expect(wrapper.find('.js-reference').exists()).toBe(false);
    expect(wrapper.find('.js-copy-reference').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('undefined');
  });

  describe('copy reference', () => {
    beforeEach(() => createWrapper(openMr));

    it('copies the full reference', async () => {
      await wrapper.find('.js-copy-reference').trigger('click');
      await flushPromises();

      expect(writeText).toHaveBeenCalledWith('gitlab-org/gitlab!33824');
      expect(wrapper.find('.js-copy-status').text()).toBe('Copied');
    });

    it('says "Copy failed" when the clipboard refuses', async () => {
      writeText.mockRejectedValue(new Error('denied'));

      await wrapper.find('.js-copy-reference').trigger('click');
      await flushPromises();

      expect(wrapper.find('.js-copy-status').text()).toBe('Copy failed');
      expect(wrapper.find('.js-copy-reference').attributes('title')).toBe('Copy failed');
    });

    it('clears the status after a moment', async () => {
      vi.useFakeTimers();

      await wrapper.find('.js-copy-reference').trigger('click');
      await flushPromises();
      vi.advanceTimersByTime(2000);
      await wrapper.vm.$nextTick();

      expect(wrapper.find('.js-copy-status').exists()).toBe(false);
    });
  });
});
