<script>
import Row from './FindingRow.vue';

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
};
</script>

<template>
  <div>
    <h2>{{ finding.title }}</h2>
    <row label="Description"> {{ finding.description }}</row>
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
