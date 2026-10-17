<script>
export default {
  props: {
    name: {
      type: String,
      required: true,
    },
    // colours come from a label event; without one the chip uses the badge tokens
    color: {
      type: String,
      required: false,
      default: '',
    },
    textColor: {
      type: String,
      required: false,
      default: '',
    },
  },
  computed: {
    scope() {
      return this.name.split('::')[0];
    },
    scopedValue() {
      return this.name.split('::').slice(1).join('::');
    },
    chipStyle() {
      return this.color ? { borderColor: this.color } : {};
    },
    scopeStyle() {
      return this.color ? { backgroundColor: this.color, color: this.textColor } : {};
    },
  },
};
</script>

<template>
  <span
    :class="{ 'label-chip--neutral': !color, 'label-chip--scoped': scopedValue }"
    :style="chipStyle"
    :title="name"
    class="label-chip js-label-chip"
  >
    <span class="label-chip__scope" :style="scopeStyle">{{ scope }}</span>
    <span v-if="scopedValue" class="label-chip__value">{{ scopedValue }}</span>
  </span>
</template>

<style lang="scss">
.label-chip {
  display: inline-flex;
  max-width: 100%;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: var(--gl-radius-circle);
  font-size: var(--gl-font-size-small);
  line-height: 16px;
  white-space: nowrap;

  &__scope,
  &__value {
    padding: 0 6px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__value {
    color: var(--gl-text);
  }

  &--neutral {
    border-color: var(--gl-badge-bg);

    .label-chip__scope {
      color: var(--gl-badge-fg);
      background-color: var(--gl-badge-bg);
    }
  }
}
</style>
