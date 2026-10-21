<script>
import { applyMention, findMentionQuery } from '../utils/mention_query';
import getCaretRect from '../utils/caret_rect';
import UserAvatar from './UserAvatar.vue';

const DEBOUNCE_MS = 150;
const WIDTH = 280;
const GAP = 2;
const MARGIN = 4;

let nextId = 0;

/**
 * Suggests people while an `@mention` is typed in a textarea. It listens to the
 * textarea itself, so the parent only passes it in with a way to search; a
 * chosen username is written through an `input` event, which `v-model` reads.
 * The list is teleported to `body`: a comment box in the side-by-side diff
 * sits in a Monaco view zone that clips and transforms its content.
 */
export default {
  name: 'MentionDropdown',
  components: { UserAvatar },
  props: {
    /** returns the textarea; called once mounted, so a parent's ref can be passed */
    target: {
      type: Function,
      required: true,
    },
    /** `query => Promise<{ mentions, error? }>` */
    search: {
      type: Function,
      required: true,
    },
  },
  data() {
    nextId += 1;
    return {
      id: `gl-mention-list-${nextId}`,
      mention: null,
      mentions: [],
      error: null,
      loading: false,
      active: 0,
      position: {},
    };
  },
  computed: {
    open() {
      return Boolean(this.mention) && (this.loading || this.mentions.length > 0 || !!this.error);
    },
    activeId() {
      return this.open && this.mentions.length ? `${this.id}-${this.active}` : undefined;
    },
  },
  watch: {
    activeId() {
      this.updateAria();
      this.$nextTick(() =>
        document.getElementById(this.activeId)?.scrollIntoView?.({ block: 'nearest' }),
      );
    },
    open() {
      this.updateAria();
    },
  },
  mounted() {
    this.sequence = 0;
    this.$nextTick(() => {
      if (this.unmounted) return;
      this.textarea = this.target();
      if (!this.textarea) return;
      this.listeners = {
        input: () => this.update(),
        click: () => this.update(),
        keyup: event => {
          if (/^(Arrow(Left|Right)|Home|End)$/.test(event.key)) this.update();
        },
        // capture, so that the list sees its keys before the comment box's own handlers
        keydown: event => this.onKeyDown(event),
        blur: () => this.close(),
      };
      Object.entries(this.listeners).forEach(([type, listener]) =>
        this.textarea.addEventListener(type, listener, type === 'keydown'),
      );
      this.textarea.setAttribute('aria-autocomplete', 'list');
      this.updateAria();
      this.reposition = () => this.open && this.place();
      window.addEventListener('scroll', this.reposition, true);
      window.addEventListener('resize', this.reposition);
    });
  },
  beforeUnmount() {
    this.unmounted = true;
    clearTimeout(this.timer);
    if (this.textarea && this.listeners) {
      Object.entries(this.listeners).forEach(([type, listener]) =>
        this.textarea.removeEventListener(type, listener, type === 'keydown'),
      );
    }
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
  },
  methods: {
    update() {
      const { textarea } = this;
      const caret = textarea.selectionStart;
      const mention =
        caret === textarea.selectionEnd ? findMentionQuery(textarea.value, caret) : null;
      if (!mention) {
        this.close();
        return;
      }
      const changed =
        mention.start !== this.mention?.start || mention.query !== this.mention?.query;
      this.mention = mention;
      this.place();
      if (changed) this.schedule(mention.query);
    },
    schedule(query) {
      clearTimeout(this.timer);
      this.sequence += 1;
      const { sequence } = this;
      this.loading = this.mentions.length === 0;
      this.timer = setTimeout(() => this.fetch(query, sequence), DEBOUNCE_MS);
    },
    async fetch(query, sequence) {
      let result;
      try {
        result = await this.search(query);
      } catch (e) {
        result = { mentions: [], error: e.message };
      }
      // a later keystroke has asked again, or the list was closed
      if (sequence !== this.sequence || this.unmounted) return;
      this.mentions = result?.mentions ?? [];
      this.error = this.mentions.length ? null : result?.error ?? null;
      this.loading = false;
      this.active = 0;
    },
    close() {
      clearTimeout(this.timer);
      this.sequence += 1;
      this.mention = null;
      this.mentions = [];
      this.error = null;
      this.loading = false;
      this.active = 0;
    },
    place() {
      const rect = getCaretRect(this.textarea, this.mention.start);
      const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - WIDTH - MARGIN));
      const spaceBelow = window.innerHeight - rect.bottom;
      this.position =
        spaceBelow < 200 && rect.top > spaceBelow
          ? { left: `${left}px`, bottom: `${window.innerHeight - rect.top + GAP}px` }
          : { left: `${left}px`, top: `${rect.bottom + GAP}px` };
    },
    move(step) {
      const count = this.mentions.length;
      this.active = (this.active + step + count) % count;
    },
    onKeyDown(event) {
      if (!this.open || event.isComposing) return;
      const hasItems = this.mentions.length > 0;
      const plain = !event.metaKey && !event.ctrlKey && !event.altKey;
      let handled = true;
      if (event.key === 'ArrowDown' && hasItems) this.move(1);
      else if (event.key === 'ArrowUp' && hasItems) this.move(-1);
      else if (
        (event.key === 'Enter' || event.key === 'Tab') &&
        plain &&
        hasItems &&
        !event.shiftKey
      )
        this.choose(this.active);
      else if (event.key === 'Escape') this.close();
      else handled = false;
      if (handled) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    choose(index) {
      const user = this.mentions[index];
      const { textarea, mention } = this;
      if (!user || !mention) return;
      const { text, caret } = applyMention(
        textarea.value,
        mention.start,
        textarea.selectionStart,
        user.username,
      );
      this.close();
      textarea.value = text;
      textarea.setSelectionRange(caret, caret);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      // v-model writes the value back on its next render; keep the caret where the name ends
      this.$nextTick(() => textarea.setSelectionRange(caret, caret));
      textarea.focus();
    },
    updateAria() {
      const { textarea } = this;
      if (!textarea) return;
      textarea.setAttribute('aria-expanded', String(this.open));
      if (this.open) textarea.setAttribute('aria-controls', this.id);
      else textarea.removeAttribute('aria-controls');
      if (this.activeId) textarea.setAttribute('aria-activedescendant', this.activeId);
      else textarea.removeAttribute('aria-activedescendant');
    },
  },
};
</script>

<template>
  <teleport to="body">
    <div
      v-if="open"
      :id="id"
      class="gl-mention-list"
      role="listbox"
      aria-label="Users to mention"
      :style="position"
      @mousedown.prevent
    >
      <p v-if="loading && !mentions.length" class="gl-mention-hint" role="status">Searching…</p>
      <p v-else-if="error" class="gl-mention-hint gl-mention-error" role="alert">{{ error }}</p>
      <div
        v-for="(user, index) in mentions"
        :id="`${id}-${index}`"
        :key="user.username"
        class="gl-mention-option"
        :class="{ 'gl-mention-option-active': index === active }"
        role="option"
        :aria-selected="String(index === active)"
        @mouseenter="active = index"
        @click="choose(index)"
      >
        <user-avatar
          :user="user"
          :size="20"
          :show-link="false"
          :show-username="false"
          class="gl-mention-avatar"
        />
        <span class="gl-mention-username">@{{ user.username }}</span>
        <span class="gl-mention-name">{{ user.name }}</span>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss" scoped>
.gl-mention-list {
  position: fixed;
  z-index: 1000;
  box-sizing: border-box;
  width: 280px;
  max-height: 240px;
  overflow-y: auto;
  padding: var(--gl-space-1) 0;
  border: var(--gl-stroke) solid var(--gl-suggest-border);
  border-radius: var(--gl-radius-large);
  background: var(--gl-suggest-bg);
  color: var(--gl-suggest-fg);
  box-shadow: var(--gl-shadow);
  font-family: var(--gl-font-family);
  font-size: var(--gl-font-size);
}

.gl-mention-option {
  display: flex;
  align-items: center;
  gap: var(--gl-space-2);
  padding: 2px var(--gl-space-2);
  cursor: pointer;
  white-space: nowrap;
}

.gl-mention-option-active {
  background: var(--gl-suggest-selected-bg);
  color: var(--gl-suggest-selected-fg);
}

.gl-mention-avatar {
  display: inline-flex;
  flex: none;

  :deep(.avatar) {
    margin-right: 0;
  }
}

.gl-mention-username {
  flex: none;
}

.gl-mention-name {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--gl-text-muted);
}

.gl-mention-option-active .gl-mention-name {
  color: inherit;
}

.gl-mention-hint {
  margin: 0;
  padding: 2px var(--gl-space-2);
  color: var(--gl-text-muted);
}

.gl-mention-error {
  color: var(--gl-text-error);
}
</style>
