<script>
import Note from './Note.vue';
import Discussion from './Discussion.vue';
import SystemNote from './SystemNote.vue';
import LabelNote from './LabelNote.vue';

const isLabel = discussion => Boolean(discussion.label);
const isSystem = discussion => discussion.notes && discussion.notes.nodes[0].system;
const isEvent = discussion => isLabel(discussion) || isSystem(discussion);
// GraphQL discussions carry no id, label events carry no replyId
const keyOf = (discussion, index) =>
  discussion.replyId || discussion.id || discussion.notes?.nodes[0]?.id || `discussion-${index}`;

// a run of this many events or more shows its first and last and folds the rest
const FOLD_THRESHOLD = 3;
const FILTERS = [
  { value: 'all', text: 'All' },
  { value: 'comments', text: 'Comments' },
];

const readFilter = () => {
  const state = window.vsCodeApi?.getState?.();
  return state?.activityFilter === 'comments' ? 'comments' : 'all';
};

export default {
  props: {
    discussions: {
      type: Array,
      required: true,
    },
  },
  components: {
    Note,
    Discussion,
    SystemNote,
    LabelNote,
  },
  data() {
    return {
      filter: readFilter(),
      expandedGroups: {},
    };
  },
  computed: {
    visibleDiscussions() {
      return this.filter === 'comments'
        ? this.discussions.filter(discussion => !isEvent(discussion))
        : this.discussions;
    },
    // consecutive events are grouped so a long run of them can fold
    groups() {
      const groups = [];
      this.visibleDiscussions.forEach((discussion, index) => {
        const last = groups[groups.length - 1];
        const row = { key: keyOf(discussion, index), discussion };
        if (isEvent(discussion) && last?.events) {
          last.events.push(row);
        } else if (isEvent(discussion)) {
          groups.push({ key: `events-${row.key}`, events: [row] });
        } else {
          groups.push({ key: row.key, rows: [row] });
        }
      });
      return groups;
    },
    rows() {
      return this.groups.flatMap(group => {
        if (group.rows) return group.rows;
        const { events } = group;
        if (events.length < FOLD_THRESHOLD || this.expandedGroups[group.key]) return events;
        const count = events.length - 2;
        const fold = {
          key: `${group.key}-fold`,
          group: group.key,
          text: `Show ${count} more ${count === 1 ? 'event' : 'events'}`,
        };
        return [events[0], fold, events[events.length - 1]];
      });
    },
  },
  methods: {
    getComponentName(discussion) {
      if (isLabel(discussion)) {
        return LabelNote;
      }
      if (isSystem(discussion)) {
        return SystemNote;
      }

      return Discussion;
    },
    getComponentData(discussion) {
      // only system component needs us to pass down the first (and only) note
      return isSystem(discussion) ? discussion.notes.nodes[0] : discussion;
    },
    expand(groupKey) {
      this.expandedGroups = { ...this.expandedGroups, [groupKey]: true };
    },
    setFilter(value) {
      this.filter = value;
      const state = window.vsCodeApi?.getState?.() || {};
      window.vsCodeApi?.setState?.({ ...state, activityFilter: value });
    },
  },
  FILTERS,
};
</script>

<template>
  <section class="issuable-activity">
    <div class="issuable-activity__header">
      <h2 class="issuable-activity__title">Activity</h2>
      <div class="activity-filter" role="group" aria-label="Show activity">
        <button
          v-for="option in $options.FILTERS"
          :key="option.value"
          type="button"
          class="activity-filter__option"
          :class="[`js-filter-${option.value}`, { 'is-active': filter === option.value }]"
          :aria-pressed="String(filter === option.value)"
          @click="setFilter(option.value)"
        >
          {{ option.text }}
        </button>
      </div>
    </div>
    <p v-if="!rows.length" class="issuable-activity__empty js-empty">No comments yet.</p>
    <ul v-else class="issuable-discussions">
      <template v-for="row in rows">
        <li v-if="row.group" :key="row.key" class="timeline-fold">
          <button
            type="button"
            class="timeline-fold__button js-show-events"
            @click="expand(row.group)"
          >
            {{ row.text }}
          </button>
        </li>
        <component
          v-else
          :key="row.key"
          :is="getComponentName(row.discussion)"
          :noteable="getComponentData(row.discussion)"
        />
      </template>
    </ul>
  </section>
</template>

<style lang="scss">
@use '@shared/styles/mixins';

* {
  box-sizing: border-box;
}

.issuable-activity {
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--gl-space-3);
    padding-bottom: var(--gl-space-2);
    border-bottom: 1px solid var(--gl-border-subtle);
  }

  &__title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }

  &__empty {
    color: var(--gl-text-muted);
  }
}

// VS Code's option toggles: borderless until pressed, then the theme's
// inputOption colours, which high contrast themes outline
.activity-filter {
  display: inline-flex;
  gap: 2px;

  &__option {
    @include mixins.toolbar-button;
    padding: 2px 8px;
    border: var(--gl-stroke) solid transparent;
    color: var(--gl-text-muted);
    font: inherit;
    font-size: var(--gl-font-size-small);

    &:hover {
      color: var(--gl-text);
    }

    &.is-active {
      border-color: var(--gl-toggle-active-border);
      color: var(--gl-toggle-active-fg);
      background-color: var(--gl-toggle-active-bg);
    }
  }
}

.issuable-discussions {
  display: block;
  list-style: none;
  margin: 0;
  padding: var(--gl-space-2) 0 0;
  text-align: left;
}

.timeline-event {
  list-style: none;
  padding: 2px 0;
  color: var(--gl-text-muted);

  &__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 var(--gl-space-1);
    min-height: 24px;
  }

  &__icon {
    margin: 0 var(--gl-space-1) 0 var(--gl-space-1);
  }

  &__author strong {
    color: var(--gl-text);
    font-weight: 600;
  }

  &__text {
    min-width: 0;

    .body,
    .body p {
      display: inline;
      margin: 0;
    }
  }

  &__date::before {
    content: '· ';
  }

  &__detail {
    margin: 0 0 var(--gl-space-1) 28px;

    ul {
      margin: 0;
      padding-inline-start: 16px;
    }
  }
}

.timeline-fold {
  list-style: none;
  padding: 2px 0 2px 22px;

  &__button {
    @include mixins.toolbar-button;
    padding: 1px 6px;
    color: var(--gl-link);
    font: inherit;

    &:hover {
      color: var(--gl-link-active);
    }
  }
}
</style>
