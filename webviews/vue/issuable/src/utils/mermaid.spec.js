import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock('mermaid', () => ({ default: mermaidMock }));

// eslint-disable-next-line import/first
import {
  flushMermaidQueue,
  getMermaidTheme,
  renderMermaidBlocks,
  resetMermaidForTests,
} from './mermaid';

const SOURCE = 'graph TD\n  A --> B';
const SVG = '<svg id="x" xmlns="http://www.w3.org/2000/svg"><g><text>A</text></g></svg>';

const THEME = {
  '--vscode-editor-background': '#1e1e1e',
  '--vscode-editorWidget-background': '#252526',
  '--vscode-foreground': '#cccccc',
  '--vscode-input-background': '#3c3c3c',
  '--vscode-sideBar-background': '#181818',
  '--vscode-widget-border': '#303031',
  '--vscode-descriptionForeground': '#9d9d9d',
  '--vscode-textBlockQuote-background': '#222222',
  '--vscode-charts-blue': '#3794ff',
  '--vscode-charts-green': '#89d185',
  '--vscode-charts-orange': '#d18616',
  '--vscode-charts-purple': '#b180d7',
  '--vscode-charts-red': '#f14c4c',
  '--vscode-charts-yellow': '#cca700',
  '--vscode-font-family': 'system-ui',
};

const setTheme = (variables = THEME) => {
  document.body.removeAttribute('style');
  Object.entries(variables).forEach(([name, value]) =>
    document.body.style.setProperty(name, value),
  );
};

const settle = async () => {
  await Promise.resolve();
  await flushMermaidQueue();
  await flushMermaidQueue();
};

const mount = html => {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  renderMermaidBlocks(root);
  return root;
};

const localBlock = (source = SOURCE) =>
  `<pre><code class="language-mermaid">${source}</code></pre>`;

describe('mermaid', () => {
  beforeEach(() => {
    resetMermaidForTests();
    mermaidMock.initialize.mockReset();
    mermaidMock.render.mockReset();
    mermaidMock.render.mockResolvedValue({ svg: SVG });
    document.body.className = 'vscode-dark';
    setTheme();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    document.body.removeAttribute('style');
    vi.restoreAllMocks();
  });

  describe('finding blocks', () => {
    it.each([
      ['markdown-it', localBlock()],
      [
        'GitLab 13.12',
        '<pre class="code highlight js-syntax-highlight language-mermaid" lang="mermaid"><code class="js-render-mermaid"><span class="line">graph TD</span>\n<span class="line">  A --&gt; B</span></code></pre>',
      ],
      [
        'lang attribute only',
        '<pre lang="mermaid"><code><span class="line">graph TD</span>\n<span class="line">  A --&gt; B</span></code></pre>',
      ],
    ])('renders the %s markup from its text content', async (_, html) => {
      const root = mount(html);
      await settle();

      expect(mermaidMock.render).toHaveBeenCalledTimes(1);
      expect(mermaidMock.render.mock.calls[0][1]).toBe(SOURCE);
      const figure = root.querySelector('figure.mermaid-diagram');
      expect(figure.dataset.state).toBe('rendered');
      expect(figure.querySelector('.mermaid-diagram__svg svg')).not.toBeNull();
      expect(figure.querySelector(':scope > pre')).not.toBeNull();
    });

    it('does nothing without a mermaid block and never loads mermaid', async () => {
      const root = mount('<pre><code class="language-js">graph TD</code></pre>');
      await settle();

      expect(root.querySelector('figure')).toBeNull();
      expect(mermaidMock.initialize).not.toHaveBeenCalled();
    });

    it('wraps a block only once', async () => {
      const root = mount(localBlock());
      renderMermaidBlocks(root);
      await settle();

      expect(root.querySelectorAll('figure')).toHaveLength(1);
    });
  });

  it('initialises mermaid strictly with the editor theme', async () => {
    mount(localBlock());
    await settle();

    const [config] = mermaidMock.initialize.mock.calls[0];
    expect(config).toMatchObject({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      darkMode: true,
      fontFamily: 'system-ui',
      maxTextSize: 50000,
    });
    expect(config.themeVariables).toMatchObject({
      background: '#1e1e1e',
      mainBkg: '#252526',
      primaryTextColor: '#cccccc',
      nodeBorder: '#303031',
      lineColor: '#9d9d9d',
      pie1: '#3794ff',
      git0: '#3794ff',
    });
  });

  it('falls back to a built-in theme when a variable is empty', () => {
    setTheme({ ...THEME, '--vscode-textBlockQuote-background': '' });
    expect(getMermaidTheme().config).toMatchObject({ theme: 'dark' });
    expect(getMermaidTheme().config.themeVariables).toBeUndefined();

    document.body.className = 'vscode-light';
    expect(getMermaidTheme().config).toMatchObject({ theme: 'default', darkMode: false });
  });

  it('uses the contrast border in high contrast', () => {
    document.body.className = 'vscode-high-contrast';
    setTheme({ ...THEME, '--vscode-contrastBorder': '#6fc3df' });

    expect(getMermaidTheme().config.themeVariables.nodeBorder).toBe('#6fc3df');
  });

  it('renders one diagram at a time', async () => {
    let active = 0;
    let maxActive = 0;
    mermaidMock.render.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => {
        setTimeout(resolve, 0);
      });
      active -= 1;
      return { svg: SVG };
    });

    mount(
      `${localBlock('graph TD\n A')}${localBlock('graph TD\n B')}${localBlock('graph TD\n C')}`,
    );
    await settle();

    expect(mermaidMock.render).toHaveBeenCalledTimes(3);
    expect(maxActive).toBe(1);
  });

  it('reuses the cached diagram when the server rendering replaces the local one', async () => {
    const root = mount(localBlock());
    await settle();

    root.innerHTML =
      '<pre lang="mermaid"><code class="js-render-mermaid"><span class="line">graph TD</span>\n<span class="line">  A --&gt; B</span></code></pre>';
    renderMermaidBlocks(root);
    await settle();

    expect(mermaidMock.render).toHaveBeenCalledTimes(1);
    expect(root.querySelector('figure').dataset.state).toBe('rendered');
  });

  it('skips a figure that left the document before its turn', async () => {
    const root = mount(localBlock());
    root.innerHTML = '';
    await settle();

    expect(mermaidMock.render).not.toHaveBeenCalled();
  });

  it('keeps the code and explains a parse error', async () => {
    mermaidMock.render.mockImplementation(async id => {
      const leftover = document.createElement('div');
      leftover.id = `d${id}`;
      document.body.appendChild(leftover);
      throw new Error('Parse error on line 2:\n...A -->\n---^');
    });

    const root = mount(localBlock('graph TD\n  A -->'));
    await settle();

    const figure = root.querySelector('figure');
    expect(figure.dataset.state).toBe('error');
    expect(figure.querySelector('pre code').textContent).toBe('graph TD\n  A -->');
    expect(figure.querySelector('.mermaid-diagram__error').textContent).toBe(
      'Diagram could not be rendered: Parse error on line 2:',
    );
    expect(document.getElementById('dgl-mermaid-1')).toBeNull();
  });

  it('sanitises the svg', async () => {
    mermaidMock.render.mockResolvedValue({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><foreignObject><div>label</div></foreignObject></svg>',
    });

    const root = mount(localBlock());
    await settle();

    const svg = root.querySelector('.mermaid-diagram__svg svg');
    expect(svg.getAttribute('onload')).toBeNull();
    expect(svg.querySelector('script')).toBeNull();
    expect(svg.querySelector('foreignObject div').textContent).toBe('label');
  });

  describe('toolbar', () => {
    it('toggles between the diagram and the source', async () => {
      const root = mount(localBlock());
      await settle();
      const figure = root.querySelector('figure');
      const toggle = figure.querySelector('.js-mermaid-toggle');

      expect(toggle.getAttribute('aria-label')).toBe('Show source');
      toggle.click();
      expect(figure.dataset.view).toBe('source');
      expect(toggle.getAttribute('aria-label')).toBe('Show diagram');
      expect(toggle.querySelector('.codicon-type-hierarchy')).not.toBeNull();
      toggle.click();
      expect(figure.dataset.view).toBeUndefined();
    });

    it('copies the source', async () => {
      const writeText = vi.fn().mockResolvedValue();
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      const root = mount(localBlock());
      await settle();
      const copy = root.querySelector('.js-mermaid-copy');

      copy.click();
      await new Promise(resolve => {
        setTimeout(resolve, 0);
      });

      expect(writeText).toHaveBeenCalledWith(SOURCE);
      expect(copy.getAttribute('aria-label')).toBe('Copied');
    });
  });

  it('re-renders diagrams when the theme changes', async () => {
    mount(localBlock());
    await settle();
    expect(mermaidMock.render).toHaveBeenCalledTimes(1);

    setTheme({ ...THEME, '--vscode-editor-background': '#ffffff' });
    document.body.className = 'vscode-light';
    await new Promise(resolve => {
      setTimeout(resolve, 0);
    });
    await settle();

    expect(mermaidMock.render).toHaveBeenCalledTimes(2);
    expect(mermaidMock.initialize).toHaveBeenCalledTimes(2);
    expect(mermaidMock.initialize.mock.calls[1][0].darkMode).toBe(false);
  });
});
