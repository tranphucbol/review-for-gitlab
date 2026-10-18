<script>
import CodiconIcon from './CodiconIcon.vue';

const STATES = {
  opened: { text: 'Open', issueIcon: 'issue-opened', mergeRequestIcon: 'git-pull-request' },
  merged: { text: 'Merged', issueIcon: 'issue-closed', mergeRequestIcon: 'git-merge' },
  closed: {
    text: 'Closed',
    issueIcon: 'issue-closed',
    mergeRequestIcon: 'git-pull-request-closed',
  },
  locked: { text: 'Locked', issueIcon: 'lock', mergeRequestIcon: 'lock' },
};

export default {
  components: {
    CodiconIcon,
  },
  props: {
    state: {
      type: String,
      required: true,
    },
    isMergeRequest: {
      type: Boolean,
      required: false,
      default: false,
    },
  },
  computed: {
    known() {
      return STATES[this.state];
    },
    icon() {
      return this.isMergeRequest ? this.known.mergeRequestIcon : this.known.issueIcon;
    },
  },
};
</script>

<template>
  <span v-if="known" :class="`state-pill--${state}`" class="state-pill js-state">
    <codicon-icon :name="icon" :size="14" />
    {{ known.text }}
  </span>
</template>

<style lang="scss">
@use '@shared/styles/mixins';

.state-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--gl-space-1);
  padding: 1px var(--gl-space-2);
  border-radius: var(--gl-radius-circle);
  font-size: var(--gl-font-size-small);
  font-weight: 600;
  line-height: 16px;
  white-space: nowrap;

  &--opened {
    @include mixins.tinted(var(--gl-state-open));
  }

  &--merged {
    @include mixins.tinted(var(--gl-state-merged));
  }

  &--closed {
    @include mixins.tinted(var(--gl-state-closed));
  }

  &--locked {
    @include mixins.tinted(var(--gl-state-locked));
  }
}
</style>
