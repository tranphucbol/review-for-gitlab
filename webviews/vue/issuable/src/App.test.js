import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const openMr = require('../../../../test/integration/fixtures/rest/open_mr.json');

const vsCodeApi = { postMessage: vi.fn(), getState: vi.fn(), setState: vi.fn() };

const post = async data => {
  const event = new Event('message');
  event.data = data;
  window.dispatchEvent(event);
  await flushPromises();
};

describe('App', () => {
  let App;
  let wrapper;

  beforeAll(async () => {
    vi.stubGlobal('acquireVsCodeApi', () => vsCodeApi);
    App = (await import('./App.vue')).default;
  });

  beforeEach(async () => {
    vsCodeApi.postMessage.mockClear();
    wrapper = mount(App, { global: { directives: { tooltip: vi.fn() } } });
    await post({ type: 'issuableFetch', issuable: openMr, discussions: [] });
  });

  afterEach(() => wrapper.unmount());

  it('asks the host to reload from the header button', async () => {
    await wrapper.find('.js-reload').trigger('click');

    expect(vsCodeApi.postMessage).toHaveBeenCalledWith({ command: 'reloadIssuable' });
    expect(wrapper.find('.js-reload').attributes('disabled')).toBeDefined();
    expect(wrapper.find('.js-reloading').exists()).toBe(true);
  });

  it('shows the reload a context menu started, until the host says it is done', async () => {
    await post({ type: 'issuableReloading' });

    expect(wrapper.find('.js-reload').attributes('aria-busy')).toBe('true');
    expect(wrapper.find('.js-reloading').exists()).toBe(true);

    await post({ type: 'issuableReloaded', ok: false });

    expect(wrapper.find('.js-reload').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('.js-reloading').exists()).toBe(false);
  });

  it('keeps the page and the comment draft while it reloads', async () => {
    const draft = wrapper.find('main textarea');
    await draft.setValue('half-written comment');

    await post({ type: 'issuableReloading' });
    expect(wrapper.find('.js-loading').exists()).toBe(false);

    await post({
      type: 'issuableFetch',
      issuable: { ...openMr, title: 'Renamed' },
      discussions: [],
    });
    await post({ type: 'issuableReloaded', ok: true });

    expect(wrapper.find('.issuable-header__title').text()).toBe('Renamed');
    expect(wrapper.find('main textarea').element.value).toBe('half-written comment');
  });
});
