/*
 * Fork-only: draws the Mermaid code blocks of a rendered body as diagrams.
 * Called from `v-safe-html` after sanitising and Jira linking, so it sees the
 * description and every note, both the local and the server rendering. The
 * code block stays in place until its diagram is ready, and for good if it
 * never is. Mermaid is loaded only when a page has a block.
 */
import DOMPurify from 'dompurify';
import codicons from '../assets/codicons';

const BLOCK_SELECTOR = 'code.js-render-mermaid, pre[lang="mermaid"] > code, code.language-mermaid';
const FIGURE_CLASS = 'mermaid-diagram';
const MAX_CACHE_SIZE = 50;
const FEEDBACK_MS = 2000;
const SVG_NS = 'http://www.w3.org/2000/svg';

// The border the editor draws around widgets; most themes leave `widget.border` unset.
const BORDER = [
  '--vscode-widget-border',
  '--vscode-editorWidget-border',
  '--vscode-contrastBorder',
  '--vscode-descriptionForeground',
];
const HIGH_CONTRAST_BORDER = ['--vscode-contrastBorder', ...BORDER];
const CHARTS = ['blue', 'green', 'orange', 'purple', 'red', 'yellow'].map(
  colour => `--vscode-charts-${colour}`,
);

const themeTokens = highContrast => {
  const border = highContrast ? HIGH_CONTRAST_BORDER : BORDER;
  const tokens = {
    background: ['--vscode-editor-background'],
    mainBkg: ['--vscode-editorWidget-background'],
    primaryTextColor: ['--vscode-foreground'],
    textColor: ['--vscode-foreground'],
    primaryColor: ['--vscode-editorWidget-background'],
    secondaryColor: ['--vscode-input-background'],
    tertiaryColor: ['--vscode-sideBar-background', '--vscode-editor-background'],
    primaryBorderColor: border,
    nodeBorder: border,
    lineColor: ['--vscode-descriptionForeground'],
    edgeLabelBackground: ['--vscode-editor-background'],
    noteBkgColor: ['--vscode-textBlockQuote-background'],
    noteTextColor: ['--vscode-foreground'],
    taskBkgColor: [CHARTS[0]],
    activeTaskBkgColor: [CHARTS[1]],
    doneTaskBkgColor: [CHARTS[3]],
    critBkgColor: [CHARTS[4]],
  };
  CHARTS.forEach((chart, index) => {
    tokens[`pie${index + 1}`] = [chart];
    tokens[`git${index}`] = [chart];
  });
  return tokens;
};

let mermaidPromise;
let loadFailed = false;
let initializedThemeKey;
let renderCount = 0;
let queue = Promise.resolve();
let intersectionObserver;
let themeObserver;
let currentThemeKey;
const cache = new Map();
const sources = new WeakMap();
const figures = new Set();

const isHighContrast = () =>
  document.body.classList.contains('vscode-high-contrast') ||
  document.body.classList.contains('vscode-high-contrast-light');

const isDarkMode = () =>
  document.body.classList.contains('vscode-dark') ||
  document.body.classList.contains('vscode-high-contrast');

/** The Mermaid configuration for the editor's current theme, and a key that changes with it. */
export const getMermaidTheme = () => {
  const style = getComputedStyle(document.body);
  const read = names =>
    names.map(name => style.getPropertyValue(name).trim()).find(value => value) || '';
  const darkMode = isDarkMode();
  const themeVariables = Object.fromEntries(
    Object.entries(themeTokens(isHighContrast())).map(([key, names]) => [key, read(names)]),
  );
  const fontFamily = read(['--vscode-font-family']) || undefined;
  const complete = Object.values(themeVariables).every(Boolean);
  const config = {
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    maxTextSize: 50000,
    darkMode,
    fontFamily,
    flowchart: { useMaxWidth: true },
    ...(complete
      ? { theme: 'base', themeVariables: { ...themeVariables, darkMode, fontFamily } }
      : { theme: darkMode ? 'dark' : 'default' }),
  };
  return { key: JSON.stringify(config), config };
};

const loadMermaid = () => {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid')
      .then(module => module.default)
      .catch(error => {
        loadFailed = true;
        console.error('Mermaid could not be loaded; diagrams stay as code.', error);
        return undefined;
      });
  }
  return mermaidPromise;
};

const remember = (key, svg) => {
  cache.delete(key);
  cache.set(key, svg);
  if (cache.size > MAX_CACHE_SIZE) cache.delete(cache.keys().next().value);
};

const createIcon = name => {
  const markup = new DOMParser().parseFromString(codicons[name], 'image/svg+xml').documentElement;
  const icon = document.createElementNS(SVG_NS, 'svg');
  icon.setAttribute('class', `codicon codicon-${name}`);
  icon.setAttribute('viewBox', markup.getAttribute('viewBox') || '0 0 16 16');
  icon.setAttribute('width', '16');
  icon.setAttribute('height', '16');
  icon.setAttribute('fill', 'currentColor');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  [...markup.children].forEach(child => icon.appendChild(document.importNode(child, true)));
  return icon;
};

const setButton = (button, label, icon) => {
  button.setAttribute('title', label);
  button.setAttribute('aria-label', label);
  button.replaceChildren(createIcon(icon));
};

const createButton = (className, label, icon, onClick) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `gl-icon-button ${className}`;
  setButton(button, label, icon);
  button.addEventListener('click', onClick);
  return button;
};

const createToolbar = figure => {
  const toolbar = document.createElement('div');
  toolbar.className = `${FIGURE_CLASS}__toolbar`;
  const toggle = createButton('js-mermaid-toggle', 'Show source', 'code', () => {
    const showSource = figure.dataset.view !== 'source';
    if (showSource) figure.setAttribute('data-view', 'source');
    else figure.removeAttribute('data-view');
    setButton(
      toggle,
      showSource ? 'Show diagram' : 'Show source',
      showSource ? 'type-hierarchy' : 'code',
    );
  });
  let feedbackTimer;
  const copy = createButton('js-mermaid-copy', 'Copy source', 'copy', async () => {
    let copied = true;
    try {
      await navigator.clipboard.writeText(sources.get(figure));
    } catch {
      copied = false;
    }
    setButton(copy, copied ? 'Copied' : 'Copy failed', copied ? 'check' : 'error');
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => setButton(copy, 'Copy source', 'copy'), FEEDBACK_MS);
  });
  toolbar.append(toggle, copy);
  return toolbar;
};

const sanitizeSvg = svg =>
  DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    // HTML labels sit in a foreignObject, which DOMPurify drops unless it may hold HTML.
    ADD_TAGS: ['foreignObject'],
    HTML_INTEGRATION_POINTS: { foreignobject: true },
    RETURN_DOM_FRAGMENT: true,
  });

const showDiagram = (figure, svg) => {
  let container = figure.querySelector(`:scope > .${FIGURE_CLASS}__svg`);
  if (!container) {
    container = document.createElement('div');
    container.className = `${FIGURE_CLASS}__svg`;
    figure.prepend(createToolbar(figure), container);
  }
  container.replaceChildren(sanitizeSvg(svg));
  figure.querySelector(`:scope > .${FIGURE_CLASS}__error`)?.remove();
  figure.setAttribute('data-state', 'rendered');
};

const showError = (figure, error) => {
  const [firstLine] = String(error?.message || error || 'unknown error').split('\n');
  let message = figure.querySelector(`:scope > .${FIGURE_CLASS}__error`);
  if (!message) {
    message = document.createElement('p');
    message.className = `${FIGURE_CLASS}__error`;
    figure.appendChild(message);
  }
  message.textContent = `The diagram couldn't be rendered: ${firstLine}`;
  figure.setAttribute('data-state', 'error');
};

const renderFigure = async figure => {
  if (!figure.isConnected) return;
  const source = sources.get(figure);
  const theme = getMermaidTheme();
  const cacheKey = `${theme.key}\n${source}`;
  let svg = cache.get(cacheKey);
  if (!svg) {
    const mermaid = await loadMermaid();
    if (!mermaid || !figure.isConnected) return;
    if (initializedThemeKey !== theme.key) {
      mermaid.initialize(theme.config);
      initializedThemeKey = theme.key;
    }
    renderCount += 1;
    const id = `gl-mermaid-${renderCount}`;
    try {
      ({ svg } = await mermaid.render(id, source));
    } catch (error) {
      if (figure.isConnected) showError(figure, error);
      return;
    } finally {
      // Mermaid draws in a temporary element on `body` and may leave it behind on an error.
      document.getElementById(`d${id}`)?.remove();
      document.getElementById(`i${id}`)?.remove();
    }
    remember(cacheKey, svg);
  }
  if (figure.isConnected) showDiagram(figure, svg);
};

const enqueue = figure => {
  queue = queue
    .then(() => renderFigure(figure))
    .catch(error => {
      console.error('Mermaid diagram failed', error);
    });
  return queue;
};

const prune = () => {
  figures.forEach(figure => {
    if (figure.isConnected) return;
    figures.delete(figure);
    intersectionObserver?.unobserve(figure);
  });
};

const watchTheme = () => {
  if (themeObserver || typeof MutationObserver === 'undefined') return;
  currentThemeKey = getMermaidTheme().key;
  themeObserver = new MutationObserver(() => {
    const { key } = getMermaidTheme();
    if (key === currentThemeKey) return;
    currentThemeKey = key;
    prune();
    figures.forEach(figure => {
      if (figure.dataset.state === 'rendered') enqueue(figure);
    });
  });
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
};

const schedule = figure => {
  if (!figure.isConnected) return;
  figures.add(figure);
  watchTheme();
  if (typeof IntersectionObserver === 'undefined') {
    enqueue(figure);
    return;
  }
  if (!intersectionObserver) {
    intersectionObserver = new IntersectionObserver(
      entries =>
        entries.forEach(({ isIntersecting, target }) => {
          if (!isIntersecting) return;
          intersectionObserver.unobserve(target);
          enqueue(target);
        }),
      { rootMargin: '200px' },
    );
  }
  intersectionObserver.observe(figure);
};

const wrapBlock = code => {
  const block = code.closest('pre') || code;
  if (block.parentElement?.classList.contains(FIGURE_CLASS)) return undefined;
  const figure = document.createElement('figure');
  figure.className = FIGURE_CLASS;
  figure.setAttribute('data-state', 'pending');
  block.replaceWith(figure);
  figure.appendChild(block);
  sources.set(figure, code.textContent);
  return figure;
};

/**
 * Wraps every Mermaid block under `root` in a figure and draws it once it is
 * near the viewport. `root` is usually not in the document yet (the directive
 * runs before the element is inserted), so scheduling waits a microtask.
 */
export const renderMermaidBlocks = root => {
  if (loadFailed) return;
  const blocks = [...root.querySelectorAll(BLOCK_SELECTOR)];
  if (!blocks.length) return;
  prune();
  const wrapped = blocks.map(wrapBlock).filter(Boolean);
  queueMicrotask(() => wrapped.forEach(schedule));
};

/** Test helper: waits for every queued render. */
export const flushMermaidQueue = () => queue;

/** Test helper: forgets the loaded module, the cache and the observers. */
export const resetMermaidForTests = () => {
  mermaidPromise = undefined;
  loadFailed = false;
  initializedThemeKey = undefined;
  renderCount = 0;
  queue = Promise.resolve();
  intersectionObserver?.disconnect();
  intersectionObserver = undefined;
  themeObserver?.disconnect();
  themeObserver = undefined;
  currentThemeKey = undefined;
  cache.clear();
  figures.clear();
};
