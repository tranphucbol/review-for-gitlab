<template>
  <div class="gl-diff-hunk-actions" :style="{ top: `${top}px` }">
    <button
      type="button"
      class="gl-diff-hunk-button"
      :disabled="busy"
      :title="arrowTitle"
      :aria-label="arrowTitle"
      @click="$emit('apply')"
    >
      {{ direction === 'apply' ? '→' : '←' }}
    </button>
    <button
      type="button"
      class="gl-diff-hunk-button gl-diff-hunk-dismiss"
      :disabled="busy"
      title="Hide the buttons for this change"
      aria-label="Hide the buttons for this change"
      @click="$emit('dismiss')"
    >
      ×
    </button>
  </div>
</template>

<script>
export default {
  name: 'HunkActions',
  props: {
    connector: {
      type: Object,
      required: true,
    },
    /** `apply` copies head lines into a base file, `revert` puts base lines back into a head file */
    direction: {
      type: String,
      required: true,
    },
    busy: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['apply', 'dismiss'],
  computed: {
    top() {
      return Math.max(0, Math.min(this.connector.oldTop, this.connector.newTop));
    },
    arrowTitle() {
      return this.direction === 'apply'
        ? 'Apply this change to the local file'
        : 'Revert this change in the local file';
    },
  },
};
</script>
