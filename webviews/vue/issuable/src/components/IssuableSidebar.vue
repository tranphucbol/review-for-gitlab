<script>
import CodiconIcon from './CodiconIcon.vue';
import LabelChip from './LabelChip.vue';
import UserAvatar from './UserAvatar.vue';

const PIPELINE_STATUSES = {
  success: { icon: 'pass', text: 'Passed' },
  failed: { icon: 'error', text: 'Failed' },
  running: { icon: 'sync', text: 'Running' },
  pending: { icon: 'watch', text: 'Pending' },
  created: { icon: 'circle-large', text: 'Created' },
  waiting_for_resource: { icon: 'watch', text: 'Waiting for resource' },
  preparing: { icon: 'watch', text: 'Preparing' },
  scheduled: { icon: 'calendar', text: 'Scheduled' },
  manual: { icon: 'person', text: 'Manual' },
  canceled: { icon: 'circle-slash', text: 'Canceled' },
  skipped: { icon: 'debug-step-over', text: 'Skipped' },
};

export default {
  components: {
    CodiconIcon,
    LabelChip,
    UserAvatar,
  },
  props: {
    issuable: {
      type: Object,
      required: true,
    },
    discussions: {
      type: Array,
      required: false,
      default: () => [],
    },
  },
  computed: {
    reviewers() {
      return this.issuable.reviewers || [];
    },
    assignees() {
      return this.issuable.assignees || [];
    },
    labelEventsByName() {
      const byName = {};
      this.discussions.forEach(discussion => {
        if (discussion.label?.name) byName[discussion.label.name] = discussion.label;
      });
      return byName;
    },
    labels() {
      return (this.issuable.labels || []).map(label => {
        const name = typeof label === 'string' ? label : label.name;
        const event = this.labelEventsByName[name] || {};
        return { name, color: event.color || '', textColor: event.text_color || '' };
      });
    },
    milestone() {
      return this.issuable.milestone?.title ? this.issuable.milestone : undefined;
    },
    pipeline() {
      return this.issuable.head_pipeline?.status ? this.issuable.head_pipeline : undefined;
    },
    pipelineStatus() {
      const { status } = this.pipeline;
      return PIPELINE_STATUSES[status] || { icon: 'circle-large', text: status };
    },
    isEmpty() {
      return (
        !this.reviewers.length &&
        !this.assignees.length &&
        !this.labels.length &&
        !this.milestone &&
        !this.pipeline
      );
    },
  },
};
</script>

<template>
  <aside v-if="!isEmpty" class="issuable-sidebar" aria-label="Details">
    <section v-if="reviewers.length" class="issuable-sidebar__section js-reviewers">
      <h2 class="issuable-sidebar__heading">Reviewers</h2>
      <ul class="issuable-sidebar__people">
        <li v-for="user in reviewers" :key="user.id || user.username">
          <user-avatar :user="user" :size="16" :show-handle="false" />
        </li>
      </ul>
    </section>
    <section v-if="assignees.length" class="issuable-sidebar__section js-assignees">
      <h2 class="issuable-sidebar__heading">Assignees</h2>
      <ul class="issuable-sidebar__people">
        <li v-for="user in assignees" :key="user.id || user.username">
          <user-avatar :user="user" :size="16" :show-handle="false" />
        </li>
      </ul>
    </section>
    <section v-if="labels.length" class="issuable-sidebar__section js-labels">
      <h2 class="issuable-sidebar__heading">Labels</h2>
      <div class="issuable-sidebar__labels">
        <label-chip
          v-for="label in labels"
          :key="label.name"
          :name="label.name"
          :color="label.color"
          :text-color="label.textColor"
        />
      </div>
    </section>
    <section v-if="milestone" class="issuable-sidebar__section js-milestone">
      <h2 class="issuable-sidebar__heading">Milestone</h2>
      <component
        :is="milestone.web_url ? 'a' : 'span'"
        :href="milestone.web_url"
        class="issuable-sidebar__item"
      >
        <codicon-icon name="milestone" />
        <span>{{ milestone.title }}</span>
      </component>
    </section>
    <section v-if="pipeline" class="issuable-sidebar__section js-pipeline">
      <h2 class="issuable-sidebar__heading">Pipeline</h2>
      <component
        :is="pipeline.web_url ? 'a' : 'span'"
        :href="pipeline.web_url"
        :class="`pipeline-status--${pipeline.status}`"
        class="issuable-sidebar__item pipeline-status"
      >
        <codicon-icon :name="pipelineStatus.icon" />
        <span>{{ pipelineStatus.text }}</span>
        <span v-if="pipeline.id" class="issuable-sidebar__muted">#{{ pipeline.id }}</span>
      </component>
    </section>
  </aside>
</template>

<style lang="scss">
@use '../styles/mixins';

.issuable-sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--gl-space-4);
  min-width: 0;
  padding: var(--gl-space-3) var(--gl-space-4);
  border: var(--gl-stroke) solid var(--gl-border);
  border-radius: var(--gl-radius-medium);
  background: var(--gl-surface-raised);

  &__section {
    min-width: 0;
  }

  &__heading {
    @include mixins.section-heading;
  }

  &__people {
    display: flex;
    flex-direction: column;
    gap: var(--gl-space-1);
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    strong {
      font-weight: normal;
    }
  }

  &__labels {
    display: flex;
    flex-wrap: wrap;
    gap: var(--gl-space-1);
  }

  &__item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    color: var(--gl-text);
    text-decoration: none;

    &:is(a):hover span:not(.issuable-sidebar__muted) {
      text-decoration: underline;
    }

    &:focus-visible {
      @include mixins.focus-ring;
    }
  }

  &__muted {
    color: var(--gl-text-muted);
  }
}

.pipeline-status {
  .codicon {
    color: var(--gl-text-muted);
  }

  &--success .codicon {
    color: var(--gl-state-open);
  }

  &--failed .codicon {
    color: var(--gl-state-closed);
  }

  &--running .codicon {
    color: var(--gl-state-running);
  }
}
</style>
