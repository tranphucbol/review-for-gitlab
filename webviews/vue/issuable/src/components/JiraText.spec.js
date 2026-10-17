import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import JiraText from './JiraText.vue';
import { setJiraLinkConfig } from '../utils/jira_links';

const config = {
  issueUrlPrefix: 'https://jira.example/browse/',
  pattern: '(?<![\\w/.-])([A-Z][A-Z0-9_]{1,9}-[1-9]\\d{0,6})(?!\\w)',
};

describe('JiraText', () => {
  afterEach(() => setJiraLinkConfig(undefined));

  it('renders plain text without config', () => {
    const wrapper = mount(JiraText, { props: { text: 'PC-1: fix <b>' } });

    expect(wrapper.text()).toBe('PC-1: fix <b>');
    expect(wrapper.find('a').exists()).toBe(false);
  });

  it('links keys and re-renders when the config arrives', async () => {
    const wrapper = mount(JiraText, { props: { text: 'PC-1: fix PE-2' } });

    setJiraLinkConfig(config);
    await nextTick();

    const links = wrapper.findAll('a.gl-jira-link');
    expect(links.map(a => [a.text(), a.attributes('href')])).toEqual([
      ['PC-1', 'https://jira.example/browse/PC-1'],
      ['PE-2', 'https://jira.example/browse/PE-2'],
    ]);
    expect(wrapper.text()).toBe('PC-1: fix PE-2');
  });
});
