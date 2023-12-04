<script>
import Row from './FindingRow.vue';
import { SafeHtmlDirective } from '../../issuable/src/directives/safe_html/safe_html';

export default {
  name: 'FindingDetails',
  props: {
    finding: {
      type: Object,
      required: true,
    },
  },
  components: {
    Row,
  },
  directives: {
    SafeHtml: SafeHtmlDirective,
  },
  computed: {
    vulnerability() {
      return this.finding;
    },
    hasDescription() {
      return this.vulnerability.description_html || this.vulnerability.description;
    },
  },
};
</script>

<template>
  <div>
    <h2>{{ finding.title }}</h2>
    <row v-if="hasDescription" label="Description">
      <p v-if="vulnerability.descriptionHtml" v-safe-html="vulnerability.descriptionHtml"></p>
      <p v-else>{{ vulnerability.description }}</p>
    </row>
    <row label="Severity"> {{ finding.severity }}</row>
    <row label="Tool"> {{ finding.reportType }}</row>
    <row label="Scanner"> {{ finding.scanner.name }}</row>
  </div>
</template>

<style>
body {
  font-family: Arial, sans-serif;
  margin: 20px;
}
h2,
h3 {
  color: #eee;
}
</style>
