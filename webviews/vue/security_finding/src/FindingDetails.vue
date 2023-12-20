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
      return this.vulnerability.descriptionHtml || this.vulnerability.description;
    },
    vulnLocation() {
      return this.finding.location;
    },
    image() {
      return this.vulnLocation?.image;
    },
    namespace() {
      return this.vulnLocation?.operatingSystem;
    },
    file() {
      const file = this.finding?.location?.file;
      if (!file) {
        return null;
      }
      let lineSuffix = '';
      const { startLine, endLine } = this.vulnLocation;
      if (startLine) {
        lineSuffix += `:${startLine}`;
        if (endLine && startLine !== endLine) {
          lineSuffix += `-${endLine}`;
        }
      }
      return `${file}${lineSuffix}`;
    },
  },
  methods: {
    reportType(type) {
      const mapping = {
        SAST: 'SAST',
        DEPENDENCY_SCANNING: 'Dependency Scanning',
        CONTAINER_SCANNING: 'Container Scanning',
        DAST: 'DAST',
        SECRET_DETECTION: 'Secret Detection',
        COVERAGE_FUZZING: 'Coverage Fuzzing',
        API_FUZZING: 'API Fuzzing',
        CLUSTER_IMAGE_SCANNING: 'Cluster Image Scanning',
        GENERIC: 'Generic Report',
      };
      return mapping[type] || type;
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
    <row label="Tool"> {{ reportType(finding.reportType) }}</row>
    <row label="Scanner"> {{ finding.scanner.name }}</row>
    <row v-if="file" label="Location">
      <a
        v-if="vulnerability.blobPath"
        ref="fileLink"
        :href="vulnerability.blobPath"
        target="_blank"
      >
        {{ file }}
      </a>
      <template v-else> {{ file }}</template>
    </row>
    <row v-if="image" label="Image"> {{ image }}</row>
    <row v-if="namespace" label="Namespace">
      {{ namespace }}
    </row>
    <row v-if="vulnerability.identifiers.length" label="Identifiers">
      <ul>
        <li v-for="identifier in vulnerability.identifiers" :key="identifier.name">
          {{ identifier.name }}
        </li>
      </ul>
    </row>
    <row v-if="finding.solution" label="Solution"> {{ finding.solution }}</row>
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
