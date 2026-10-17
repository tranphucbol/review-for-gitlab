import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import IssuableSidebar from './IssuableSidebar.vue';

const openMr = require('../../../../../test/integration/fixtures/rest/open_mr.json');
const scopedLabelEvent = require('../../../../../test/integration/fixtures/rest/label_events/added_scoped.json');

describe('IssuableSidebar', () => {
  let wrapper;

  const createWrapper = (issuable, discussions = []) => {
    wrapper = mount(IssuableSidebar, { props: { issuable, discussions } });
  };

  it('shows assignees, labels and milestone from the detail payload', () => {
    createWrapper(openMr);

    expect(wrapper.find('.js-assignees').text()).toContain(openMr.assignees[0].name);
    expect(wrapper.findAll('.js-label-chip')).toHaveLength(openMr.labels.length);
    expect(wrapper.find('.js-milestone').text()).toContain(openMr.milestone.title);
    expect(wrapper.find('.js-milestone a').attributes('href')).toBe(openMr.milestone.web_url);
  });

  it('renders only the sections that have content', () => {
    createWrapper({ ...openMr, assignees: [], labels: [], milestone: null });

    expect(wrapper.find('.js-reviewers').exists()).toBe(false);
    expect(wrapper.find('.js-assignees').exists()).toBe(false);
    expect(wrapper.find('.js-labels').exists()).toBe(false);
    expect(wrapper.find('.js-milestone').exists()).toBe(false);
    expect(wrapper.find('.js-pipeline').exists()).toBe(false);
    expect(wrapper.find('aside').exists()).toBe(false);
  });

  it('shows reviewers when the instance sends them', () => {
    createWrapper({ ...openMr, reviewers: [{ id: 1, name: 'Rita Reviewer', username: 'rita' }] });

    expect(wrapper.find('.js-reviewers').text()).toContain('Rita Reviewer');
  });

  describe('labels', () => {
    it('colours a label from its label event and splits a scoped label', () => {
      createWrapper({ ...openMr, labels: ['group::code review'] }, [scopedLabelEvent]);

      const chip = wrapper.find('.js-label-chip');
      expect(chip.classes()).not.toContain('label-chip--neutral');
      expect(chip.find('.label-chip__scope').text()).toBe('group');
      expect(chip.find('.label-chip__value').text()).toBe('code review');
      expect(chip.find('.label-chip__scope').attributes('style')).toContain(
        'background-color: rgb(168, 214, 149)',
      );
    });

    it('falls back to a neutral chip without a label event', () => {
      createWrapper({ ...openMr, labels: ['backend'] }, [scopedLabelEvent]);

      const chip = wrapper.find('.js-label-chip');
      expect(chip.classes()).toContain('label-chip--neutral');
      expect(chip.attributes('style')).toBeUndefined();
      expect(chip.find('.label-chip__value').exists()).toBe(false);
    });
  });

  describe('pipeline', () => {
    it('shows the head pipeline status with a link', () => {
      createWrapper({
        ...openMr,
        head_pipeline: { id: 42, status: 'failed', web_url: 'https://example.com/p/42' },
      });

      const pipeline = wrapper.find('.js-pipeline');
      expect(pipeline.text()).toContain('Failed');
      expect(pipeline.text()).toContain('#42');
      expect(pipeline.find('.codicon-error').exists()).toBe(true);
      expect(pipeline.find('a').attributes('href')).toBe('https://example.com/p/42');
    });

    it('shows an unknown status as text', () => {
      createWrapper({ ...openMr, head_pipeline: { id: 7, status: 'mystery' } });

      expect(wrapper.find('.js-pipeline').text()).toContain('mystery');
      expect(wrapper.find('.js-pipeline a').exists()).toBe(false);
    });
  });

  it('never prints undefined for a sparse issuable', () => {
    createWrapper({ assignees: [{ name: 'Ann', username: 'ann' }] });

    expect(wrapper.text()).not.toContain('undefined');
  });
});
