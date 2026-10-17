<script>
import UserAvatar from '@shared/components/UserAvatar.vue';
import TimeAgo from '@shared/components/TimeAgo.vue';
import NoteBody from './NoteBody.vue';
import CodiconIcon from './CodiconIcon.vue';
import { getSystemNoteIcon } from '../utils/system_note_icon';

export default {
  props: {
    noteable: {
      type: Object,
      required: true,
    },
  },
  components: {
    NoteBody,
    UserAvatar,
    CodiconIcon,
    TimeAgo,
  },
  computed: {
    author() {
      return this.noteable.author;
    },
  },
  created() {
    this.icon = getSystemNoteIcon(this.noteable.body);
    this.multiLine = false;
    this.firstLine = '';
    if (this.noteable.body.match(/Compare with/)) {
      const { body } = this.noteable;
      const lines = body.split('\n');
      // FIXME: disabling rule to limit changes to production code when introducing eslint
      // eslint-disable-next-line prefer-destructuring
      this.firstLine = lines[0];
      lines.splice(0, 1);
      // TODO: fix this. The eslint rule is disabled during vue3 migration
      // eslint-disable-next-line vue/no-mutating-props
      this.noteable.body = lines.join('\n');
      this.multiLine = true;
    }
  },
};
</script>

<template>
  <li class="timeline-event system-note">
    <div class="timeline-event__row">
      <codicon-icon :name="icon" class="timeline-event__icon" />
      <user-avatar
        :user="author"
        :show-avatar="false"
        :show-handle="false"
        class="timeline-event__author"
      />
      <span v-if="multiLine" class="timeline-event__text">{{ firstLine }}</span>
      <note-body v-else :note="noteable" class="timeline-event__text" />
      <time-ago :date="noteable.createdAt" class="timeline-event__date" />
    </div>
    <note-body v-if="multiLine" :note="noteable" class="timeline-event__detail" />
  </li>
</template>
