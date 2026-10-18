<script>
export default {
  props: {
    user: {
      type: Object,
      required: true,
    },
    size: {
      type: Number,
      required: false,
      default: 24,
    },
    showAvatar: {
      type: Boolean,
      required: false,
      default: true,
    },
    showLink: {
      type: Boolean,
      required: false,
      default: true,
    },
    showUsername: {
      type: Boolean,
      required: false,
      default: true,
    },
    showHandle: {
      type: Boolean,
      required: false,
      default: true,
    },
  },
  computed: {
    sizeClass() {
      return `s${this.size}`;
    },
    userUrl() {
      return this.user.webUrl || this.user.web_url; // labels contain snake_case variables
    },
    avatarUrl() {
      return this.user.avatarUrl || this.user.avatar_url;
    },
  },
};
</script>

<template>
  <span>
    <component :is="showLink ? 'a' : 'span'" :href="userUrl" target="_blank">
      <img
        v-if="showAvatar"
        :src="avatarUrl"
        :alt="showUsername ? '' : user.name"
        :class="sizeClass"
        class="avatar js-avatar"
      />
      <span v-if="showUsername" class="author">
        <strong> {{ user.name }}</strong>
        <span v-if="showHandle" class="author__handle"> @{{ user.username }}</span>
      </span>
    </component>
  </span>
</template>

<style lang="scss" scoped>
a {
  color: var(--gl-text);
  text-decoration: none;
}
.author__handle {
  color: var(--gl-text-muted);
}
.avatar {
  margin-right: 6px;
  border-radius: var(--gl-radius-circle);
  max-width: 64px;
  max-height: 64px;
  vertical-align: middle;
  background: var(--gl-surface);
}

.s16 {
  width: 16px;
  height: 16px;
}

.s20 {
  width: 20px;
  height: 20px;
}

.s24 {
  width: 24px;
  height: 24px;
}

.capitalize {
  text-transform: capitalize;
}
</style>
