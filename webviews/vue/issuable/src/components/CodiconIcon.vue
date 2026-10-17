<script>
import { h } from 'vue';
import codicons from '../assets/codicons';

// Each glyph's markup is parsed once into a plain tree and rendered as vnodes,
// so no HTML string reaches the DOM outside v-safe-html.
const parsed = new Map();

const toTree = element => ({
  tag: element.tagName,
  attrs: Object.fromEntries([...element.attributes].map(({ name, value }) => [name, value])),
  children: [...element.children].map(toTree),
});

const parseIcon = name => {
  if (!parsed.has(name)) {
    const markup = codicons[name];
    const svg = markup && new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
    parsed.set(name, svg && svg.tagName === 'svg' ? toTree(svg) : undefined);
  }
  return parsed.get(name);
};

const toVNode = ({ tag, attrs, children }) => h(tag, attrs, children.map(toVNode));

export default {
  name: 'CodiconIcon',
  compatConfig: { MODE: 3 },
  props: {
    name: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: false,
      default: 16,
    },
  },
  render() {
    const tree = parseIcon(this.name) || parseIcon('circle-small-filled');
    const { viewBox = '0 0 16 16' } = tree.attrs;
    return h(
      'svg',
      {
        class: ['codicon', `codicon-${this.name}`],
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox,
        width: this.size,
        height: this.size,
        fill: 'currentColor',
        'aria-hidden': 'true',
        focusable: 'false',
      },
      tree.children.map(toVNode),
    );
  },
};
</script>

<style lang="scss">
.codicon {
  flex: none;
  display: inline-block;
  vertical-align: text-bottom;
  fill: currentColor;
}
</style>
