// Styles that decide where text wraps, copied onto a hidden twin of the textarea.
const MIRRORED_STYLES = [
  'boxSizing',
  'width',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'fontVariant',
  'letterSpacing',
  'lineHeight',
  'tabSize',
  'textIndent',
  'textTransform',
  'wordSpacing',
];

/**
 * Where the character at `index` of a textarea is drawn, in viewport
 * coordinates: `{ top, bottom, left }`. A textarea has no API for this, so a
 * hidden div with the same box and font lays the text out instead.
 */
const getCaretRect = (textarea, index) => {
  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  MIRRORED_STYLES.forEach(property => {
    mirror.style[property] = style[property];
  });
  Object.assign(mirror.style, {
    position: 'fixed',
    top: '0',
    left: '-9999px',
    visibility: 'hidden',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    overflow: 'hidden',
    height: 'auto',
  });
  mirror.textContent = textarea.value.slice(0, index);
  const marker = document.createElement('span');
  marker.textContent = textarea.value.slice(index) || '.';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const box = textarea.getBoundingClientRect();
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2 || 16;
  const top = box.top + marker.offsetTop - textarea.scrollTop;
  const left = box.left + marker.offsetLeft - textarea.scrollLeft;
  mirror.remove();

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const clampedTop = clamp(top, box.top, box.bottom - lineHeight);
  return {
    top: clampedTop,
    bottom: clampedTop + lineHeight,
    left: clamp(left, box.left, box.right),
  };
};

export default getCaretRect;
