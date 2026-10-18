<script>
// The state of a resolvable thread. Each webview passes its own codicon in the
// `icon` slot: the Overview draws inline SVG, the diff uses Monaco's codicon font.
export default {
  name: 'ResolvedBadge',
  props: {
    resolved: {
      type: Boolean,
      required: true,
    },
  },
};
</script>

<template>
  <span
    class="resolved-badge js-resolved-badge"
    :class="resolved ? 'resolved-badge--resolved' : 'resolved-badge--open'"
  >
    <slot name="icon" :resolved="resolved" />
    {{ resolved ? 'Resolved' : 'Unresolved' }}
  </span>
</template>

<style lang="scss">
@use '../styles/mixins';

.resolved-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0 6px;
  border-radius: var(--gl-radius-circle);
  font-size: var(--gl-font-size-small);
  line-height: 16px;
  white-space: nowrap;

  &--resolved {
    @include mixins.tinted(var(--gl-state-open));
  }

  &--open {
    color: var(--gl-badge-fg);
    background-color: var(--gl-badge-bg);
  }
}
</style>
