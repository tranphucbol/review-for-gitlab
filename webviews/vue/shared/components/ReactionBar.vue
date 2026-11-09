<script>
import AddReactionButton from './AddReactionButton.vue';
import { reactionTitle } from '../utils/emoji';

// The reactions on one note, as GitLab groups them, with a button to add one.
// It only draws and asks: the webview turns `toggle` into a write and passes
// the groups back, optimistically or as the host answered.
export default {
  name: 'ReactionBar',
  components: { AddReactionButton },
  props: {
    /** `ReactionGroup[]` */
    reactions: {
      type: Array,
      required: true,
    },
    canReact: {
      type: Boolean,
      default: false,
    },
    /** `() => Promise<{ emojis, error? }>` */
    loadEmojis: {
      type: Function,
      required: true,
    },
  },
  emits: ['toggle'],
  methods: {
    title: reactionTitle,
    toggle(group) {
      if (this.canReact)
        this.$emit('toggle', { name: group.name, on: !group.mine, emoji: group.emoji });
    },
    pick(entry) {
      const group = this.reactions.find(g => g.name === entry.name);
      this.$emit('toggle', { name: entry.name, on: !group?.mine, emoji: entry.emoji });
    },
  },
};
</script>

<template>
  <div class="gl-reactions" role="group" aria-label="Reactions">
    <button
      v-for="group in reactions"
      :key="group.name"
      type="button"
      class="gl-reaction"
      :class="{ 'gl-reaction-mine': group.mine, 'gl-reaction-readonly': !canReact }"
      :aria-pressed="canReact ? String(group.mine) : undefined"
      :aria-disabled="canReact ? undefined : 'true'"
      :title="title(group)"
      @click="toggle(group)"
    >
      <span class="gl-reaction-emoji">{{ group.emoji || `:${group.name}:` }}</span>
      <span class="gl-reaction-count">{{ group.count }}</span>
    </button>
    <add-reaction-button v-if="canReact" :load-emojis="loadEmojis" @pick="pick">
      <slot name="add-icon" />
    </add-reaction-button>
  </div>
</template>

<style lang="scss">
.gl-reactions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--gl-space-1);
  margin-top: var(--gl-space-2);
}

.gl-reaction {
  display: inline-flex;
  align-items: center;
  gap: var(--gl-space-1);
  height: 22px;
  padding: 0 var(--gl-space-2);
  border: var(--gl-stroke) solid var(--gl-border);
  border-radius: var(--gl-radius-circle);
  background: transparent;
  color: var(--gl-text);
  font-family: var(--gl-font-family);
  font-size: var(--gl-font-size-small);
  line-height: 1;
  cursor: pointer;

  &:hover {
    background-color: var(--gl-toolbar-hover);
  }

  &:focus-visible {
    outline: var(--gl-stroke) solid var(--gl-focus);
    outline-offset: 1px;
  }
}

.gl-reaction-mine {
  border-color: var(--gl-toggle-active-border);
  background-color: var(--gl-toggle-active-bg);
  color: var(--gl-toggle-active-fg);

  &:hover {
    background-color: var(--gl-toggle-active-bg);
  }
}

.gl-reaction-readonly {
  cursor: default;

  &:hover {
    background-color: transparent;
  }
}

.gl-reaction-emoji {
  font-size: 14px;
}

.gl-reaction-count {
  font-variant-numeric: tabular-nums;
}
</style>
