<script>
import EmojiPicker from './EmojiPicker.vue';

// Opens the emoji picker. Each webview passes its own codicon in the default
// slot: the Overview draws inline SVG, the diff uses Monaco's codicon font.
export default {
  name: 'AddReactionButton',
  components: { EmojiPicker },
  props: {
    /** `() => Promise<{ emojis, error? }>` */
    loadEmojis: {
      type: Function,
      required: true,
    },
  },
  emits: ['pick'],
  data() {
    return { open: false };
  },
  methods: {
    close() {
      this.open = false;
      this.$refs.button?.focus();
    },
    pick(entry) {
      this.close();
      this.$emit('pick', entry);
    },
  },
};
</script>

<template>
  <span class="gl-reaction-add" :class="{ 'gl-reaction-add-open': open }">
    <button
      ref="button"
      type="button"
      class="gl-reaction-add-button"
      title="Add reaction"
      aria-label="Add reaction"
      aria-haspopup="dialog"
      :aria-expanded="String(open)"
      @click="open = !open"
    >
      <slot />
    </button>
    <emoji-picker
      v-if="open"
      :anchor="() => $refs.button"
      :load="loadEmojis"
      @pick="pick"
      @close="close"
    />
  </span>
</template>

<style lang="scss">
@use '../styles/mixins';

.gl-reaction-add {
  display: inline-flex;
}

.gl-reaction-add-button {
  @include mixins.toolbar-button;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  color: var(--gl-text-muted);

  &:hover,
  &[aria-expanded='true'] {
    color: var(--gl-text);
  }

  &:focus-visible {
    @include mixins.focus-ring;
  }
}
</style>
