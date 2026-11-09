<script>
import { emojiSections } from '../utils/emoji';

const WIDTH = 304;
const HEIGHT = 340;
const COLUMNS = 8;
const GAP = 4;
const MARGIN = 4;

let nextId = 0;

/**
 * Chooses an emoji to react with. Teleported to `body` and placed under its
 * anchor, or above it near the bottom edge, since a comment in the
 * side-by-side diff sits in a Monaco view zone that clips its content. Focus
 * stays in the search box; the arrows move through the grid.
 */
export default {
  name: 'EmojiPicker',
  props: {
    /** returns the element the picker opens from */
    anchor: {
      type: Function,
      required: true,
    },
    /** `() => Promise<{ emojis, error? }>` */
    load: {
      type: Function,
      required: true,
    },
  },
  emits: ['pick', 'close'],
  data() {
    nextId += 1;
    return {
      id: `gl-emoji-picker-${nextId}`,
      emojis: [],
      loading: true,
      error: null,
      query: '',
      active: 0,
      position: {},
    };
  },
  computed: {
    sections() {
      if (this.loading) return [];
      let index = 0;
      return emojiSections(this.emojis, this.query).map(section => ({
        ...section,
        emojis: section.emojis.map(entry => {
          const item = { ...entry, index };
          index += 1;
          return item;
        }),
      }));
    },
    items() {
      return this.sections.flatMap(section => section.emojis);
    },
    activeItem() {
      return this.items[this.active];
    },
    activeId() {
      return this.activeItem ? `${this.id}-${this.active}` : undefined;
    },
  },
  watch: {
    query() {
      this.active = 0;
      if (this.$refs.list) this.$refs.list.scrollTop = 0;
    },
    activeId() {
      this.$nextTick(() =>
        document.getElementById(this.activeId)?.scrollIntoView?.({ block: 'nearest' }),
      );
    },
  },
  async mounted() {
    this.place();
    this.$refs.search.focus();
    this.onOutside = event => {
      const anchor = this.anchor();
      if (this.$refs.picker?.contains(event.target) || anchor?.contains(event.target)) return;
      this.$emit('close');
    };
    this.reposition = () => this.place();
    document.addEventListener('mousedown', this.onOutside, true);
    window.addEventListener('scroll', this.reposition, true);
    window.addEventListener('resize', this.reposition);
    let result;
    try {
      result = await this.load();
    } catch (e) {
      result = { emojis: [], error: e.message };
    }
    if (this.unmounted) return;
    this.emojis = result?.emojis ?? [];
    this.error = result?.error ?? null;
    this.loading = false;
  },
  beforeUnmount() {
    this.unmounted = true;
    document.removeEventListener('mousedown', this.onOutside, true);
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
  },
  methods: {
    place() {
      const rect = this.anchor()?.getBoundingClientRect();
      if (!rect) return;
      const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - WIDTH - MARGIN));
      const spaceBelow = window.innerHeight - rect.bottom;
      this.position =
        spaceBelow < HEIGHT + GAP && rect.top > spaceBelow
          ? { left: `${left}px`, bottom: `${window.innerHeight - rect.top + GAP}px` }
          : { left: `${left}px`, top: `${rect.bottom + GAP}px` };
    },
    move(step) {
      const count = this.items.length;
      if (!count) return;
      this.active = Math.max(0, Math.min(count - 1, this.active + step));
    },
    onKeyDown(event) {
      if (event.isComposing) return;
      let handled = true;
      if (event.key === 'ArrowRight') this.move(1);
      else if (event.key === 'ArrowLeft') this.move(-1);
      else if (event.key === 'ArrowDown') this.move(COLUMNS);
      else if (event.key === 'ArrowUp') this.move(-COLUMNS);
      else if (event.key === 'Enter' && this.activeItem) this.pick(this.activeItem);
      else if (event.key === 'Escape') this.$emit('close');
      else handled = false;
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    pick(item) {
      const { index, ...entry } = item;
      this.$emit('pick', entry);
    },
  },
};
</script>

<template>
  <teleport to="body">
    <div
      ref="picker"
      class="gl-emoji-picker"
      role="dialog"
      aria-label="Choose a reaction"
      :style="position"
      @keydown="onKeyDown"
    >
      <input
        ref="search"
        v-model="query"
        class="gl-emoji-picker-search"
        type="text"
        placeholder="Search emoji"
        aria-label="Search emoji"
        role="combobox"
        aria-expanded="true"
        :aria-controls="id"
        :aria-activedescendant="activeId"
        autocomplete="off"
        spellcheck="false"
      />
      <div :id="id" ref="list" class="gl-emoji-picker-list" role="listbox" aria-label="Emoji">
        <p v-if="loading" class="gl-emoji-picker-hint" role="status">Loading emoji…</p>
        <p v-else-if="!items.length" class="gl-emoji-picker-hint" role="status">No emoji found.</p>
        <div
          v-for="section in sections"
          :key="section.id"
          class="gl-emoji-picker-section"
          role="group"
          :aria-label="section.title"
        >
          <div class="gl-emoji-picker-heading" aria-hidden="true">{{ section.title }}</div>
          <div class="gl-emoji-picker-grid">
            <div
              v-for="item in section.emojis"
              :id="`${id}-${item.index}`"
              :key="item.name"
              class="gl-emoji-picker-option"
              :class="{ 'gl-emoji-picker-option-active': item.index === active }"
              role="option"
              :aria-selected="String(item.index === active)"
              :aria-label="item.name"
              :title="`:${item.name}:`"
              @mouseenter="active = item.index"
              @mousedown.prevent
              @click="pick(item)"
            >
              {{ item.emoji }}
            </div>
          </div>
        </div>
      </div>
      <div class="gl-emoji-picker-footer">
        <template v-if="activeItem">
          <span class="gl-emoji-picker-preview" aria-hidden="true">{{ activeItem.emoji }}</span>
          <span class="gl-emoji-picker-name">:{{ activeItem.name }}:</span>
          <span class="gl-emoji-picker-description">{{ activeItem.description }}</span>
        </template>
        <span v-if="error" class="gl-emoji-picker-error" role="status">{{ error }}</span>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss" scoped>
.gl-emoji-picker {
  position: fixed;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 304px;
  height: 340px;
  border: var(--gl-stroke) solid var(--gl-suggest-border);
  border-radius: var(--gl-radius-large);
  background: var(--gl-suggest-bg);
  color: var(--gl-suggest-fg);
  box-shadow: var(--gl-shadow);
  font-family: var(--gl-font-family);
  font-size: var(--gl-font-size);
}

.gl-emoji-picker-search {
  margin: var(--gl-space-2);
  padding: 3px 6px;
  border: var(--gl-stroke) solid var(--gl-input-border);
  border-radius: var(--gl-radius-small);
  background: var(--gl-input-bg);
  color: var(--gl-input-fg);
  font: inherit;

  &::placeholder {
    color: var(--gl-input-placeholder);
  }

  &:focus {
    outline: var(--gl-stroke) solid var(--gl-focus);
    outline-offset: -1px;
  }
}

.gl-emoji-picker-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--gl-space-2);
}

.gl-emoji-picker-heading {
  position: sticky;
  top: 0;
  padding: 2px 0;
  background: var(--gl-suggest-bg);
  color: var(--gl-text-muted);
  font-size: var(--gl-font-size-small);
  font-weight: 600;
}

.gl-emoji-picker-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  margin-bottom: var(--gl-space-1);
}

.gl-emoji-picker-option {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  border-radius: var(--gl-radius-small);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.gl-emoji-picker-option-active {
  background: var(--gl-suggest-selected-bg);
}

.gl-emoji-picker-hint {
  margin: 0;
  padding: var(--gl-space-2) 0;
  color: var(--gl-text-muted);
}

.gl-emoji-picker-footer {
  display: flex;
  align-items: center;
  gap: var(--gl-space-1);
  min-height: 32px;
  padding: 0 var(--gl-space-2);
  border-top: 1px solid var(--gl-border-subtle);
  overflow: hidden;
  white-space: nowrap;
}

.gl-emoji-picker-preview {
  font-size: 18px;
}

.gl-emoji-picker-name {
  flex: none;
}

.gl-emoji-picker-description,
.gl-emoji-picker-error {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--gl-text-muted);
}

.gl-emoji-picker-error {
  margin-left: auto;
}
</style>
