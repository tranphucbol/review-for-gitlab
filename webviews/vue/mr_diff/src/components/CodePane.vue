<template>
  <div class="gl-diff-pane" :class="`gl-diff-pane-${side}`">
    <div ref="editor" class="gl-diff-editor"></div>
    <button
      v-if="commentTop !== null"
      type="button"
      class="gl-diff-add-comment"
      :style="{ top: `${commentTop}px` }"
      :aria-label="`Comment on line ${commentLine}`"
      :title="`Comment on line ${commentLine}`"
      @mousedown.prevent
      @click="$emit('add-comment', commentLine)"
    >
      +
    </button>
  </div>
</template>

<script>
export default {
  name: 'CodePane',
  props: {
    side: {
      type: String,
      required: true,
    },
    commentLine: {
      type: Number,
      default: null,
    },
    commentTop: {
      type: Number,
      default: null,
    },
  },
  emits: ['add-comment'],
  methods: {
    editorElement() {
      return this.$refs.editor;
    },
  },
};
</script>
