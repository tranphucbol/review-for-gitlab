<script>
import UserAvatar from './UserAvatar.vue';
import Date from './Date.vue';
import CodiconIcon from './CodiconIcon.vue';
import LabelChip from './LabelChip.vue';

export default {
  props: {
    noteable: {
      type: Object,
      required: true,
    },
  },
  components: {
    UserAvatar,
    Date,
    CodiconIcon,
    LabelChip,
  },
  computed: {
    author() {
      return this.noteable.user;
    },
    action() {
      return this.noteable.action === 'add' ? 'added' : 'removed';
    },
  },
};
</script>

<template>
  <li class="timeline-event label-note">
    <div class="timeline-event__row">
      <codicon-icon name="tag" class="timeline-event__icon" />
      <user-avatar
        :user="author"
        :show-avatar="false"
        :show-handle="false"
        class="timeline-event__author"
      />
      <span class="timeline-event__text">
        <span class="label-action">{{ action }}</span>
        <span v-tooltip="noteable.label.description" class="label-pill">
          <label-chip
            :name="noteable.label.name"
            :color="noteable.label.color"
            :text-color="noteable.label.text_color"
          />
        </span>
        <span class="label-divider">label</span>
      </span>
      <date :date="noteable.created_at" class="timeline-event__date" />
    </div>
  </li>
</template>

<style lang="scss">
.label-note .timeline-event__text {
  display: inline-flex;
  align-items: center;
  gap: var(--gl-space-1);
}
</style>
