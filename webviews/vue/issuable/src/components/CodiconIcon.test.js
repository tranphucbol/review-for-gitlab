import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import CodiconIcon from './CodiconIcon.vue';
import codicons from '../assets/codicons';

describe('CodiconIcon', () => {
  it('renders the glyph as inline SVG hidden from assistive technology', () => {
    const wrapper = mount(CodiconIcon, { props: { name: 'git-merge' } });
    const svg = wrapper.find('svg');

    expect(svg.classes()).toEqual(['codicon', 'codicon-git-merge']);
    expect(svg.attributes()).toMatchObject({
      'aria-hidden': 'true',
      fill: 'currentColor',
      width: '16',
      height: '16',
      viewBox: '0 0 16 16',
    });
    expect(svg.find('path').attributes('d')).toBeTruthy();
    expect(svg.element.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.find('path').element.namespaceURI).toBe('http://www.w3.org/2000/svg');
  });

  it('keeps path attributes such as fill-rule', () => {
    const wrapper = mount(CodiconIcon, { props: { name: 'issue-opened' } });

    expect(wrapper.findAll('path').some(path => path.attributes('fill-rule') === 'evenodd')).toBe(
      true,
    );
  });

  it('renders at the requested size', () => {
    const wrapper = mount(CodiconIcon, { props: { name: 'copy', size: 12 } });

    expect(wrapper.attributes('width')).toBe('12');
  });

  it('falls back to a small dot for an unknown name', () => {
    const wrapper = mount(CodiconIcon, { props: { name: 'no-such-icon' } });

    expect(wrapper.find('path').attributes('d')).toBe(
      new DOMParser()
        .parseFromString(codicons['circle-small-filled'], 'image/svg+xml')
        .querySelector('path')
        .getAttribute('d'),
    );
  });

  it.each(Object.keys(codicons))('ships a parseable %s glyph', name => {
    const wrapper = mount(CodiconIcon, { props: { name } });

    expect(wrapper.find('svg > *').exists()).toBe(true);
  });
});
