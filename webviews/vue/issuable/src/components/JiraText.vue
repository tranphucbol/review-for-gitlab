<script>
// Fork-only: plain text with its Jira issue keys linked, see utils/jira_links.js.
import { jiraLinkConfig, splitJiraKeys } from '../utils/jira_links';

export default {
  name: 'JiraText',
  props: {
    text: {
      type: String,
      required: false,
      default: '',
    },
  },
  computed: {
    parts() {
      return splitJiraKeys(this.text, jiraLinkConfig.value);
    },
  },
};
</script>

<template>
  <span
    ><span v-for="(part, index) in parts" :key="index"
      ><a
        v-if="part.key"
        :href="part.href"
        :title="`Open ${part.key} in Jira`"
        class="gl-jira-link"
        >{{ part.key }}</a
      ><template v-else>{{ part.text }}</template></span
    ></span
  >
</template>
