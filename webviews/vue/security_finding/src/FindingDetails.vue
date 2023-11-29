<script>
export default {
  name: 'FindingDetails',
  props: {
    finding: {
      type: Object,
      required: true,
    },
  },
};
</script>

<template>
  <div>
    <h2>{{ finding.title }}</h2>
    <h3>Description</h3>
    <p>{{ finding.description }}</p>
    <h3>Severity</h3>
    <span>{{ finding.severity }}</span>
    <h3>Tool</h3>
    <span>{{ finding.reportType }}</span>
    <h3>Scanner</h3>
    <span>{{ finding.scanner.name }}</span>
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
