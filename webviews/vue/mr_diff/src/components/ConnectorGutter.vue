<template>
  <div class="gl-diff-gutter" @wheel.prevent="$emit('scroll-by', $event.deltaY)">
    <svg class="gl-diff-gutter-svg" :width="width" :height="height" aria-hidden="true">
      <defs>
        <linearGradient id="gl-diff-modified-fill" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" class="gl-diff-stop-removed" />
          <stop offset="100%" class="gl-diff-stop-inserted" />
        </linearGradient>
      </defs>
      <polygon
        v-for="connector in connectors"
        :key="connector.blockId"
        :points="points(connector)"
        :class="[
          'gl-diff-connector',
          `gl-diff-connector-${connector.kind}`,
          {
            'gl-diff-connector-applied': connector.applied,
            'gl-diff-connector-dismissed': connector.dismissed,
          },
        ]"
      />
    </svg>
    <slot></slot>
  </div>
</template>

<script>
export default {
  name: 'ConnectorGutter',
  props: {
    connectors: {
      type: Array,
      required: true,
    },
    width: {
      type: Number,
      required: true,
    },
    height: {
      type: Number,
      required: true,
    },
  },
  emits: ['scroll-by'],
  methods: {
    points({ oldTop, oldBottom, newTop, newBottom }) {
      // a side without lines still gets a visible edge
      const oldEnd = Math.max(oldBottom, oldTop + 1);
      const newEnd = Math.max(newBottom, newTop + 1);
      return `0,${oldTop} ${this.width},${newTop} ${this.width},${newEnd} 0,${oldEnd}`;
    },
  },
};
</script>
