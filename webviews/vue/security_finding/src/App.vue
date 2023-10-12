<script>
export default {
  name: 'App',
  data() {
    return {
      isLoading: false,
      finding: {},
    };
  },
  created() {
    this.isLoading = true;

    window.addEventListener('message', event => {
      if (event.data.type === 'findingDetails') {
        this.finding = event.data.finding;
        this.isLoading = false;
      }
    });

    const vscode = acquireVsCodeApi();
    vscode.postMessage({
      command: 'appReady',
    });
  },
};
</script>

<template>
  <div id="app">
    <p v-if="isLoading" class="loading">
      Fetching vulnerability details and discussions. This may take a while.
      <br />
      If it doesn't work, please
      <a href="https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/new" class="hello"
        >create an issue.</a
      >
    </p>
    <template v-else>
      <h2>{{ finding.title }}</h2>
      <h3>Description</h3>
      <p>{{ finding.description }}</p>
      <h3>Severity</h3>
      <span>{{ finding.severity }}</span>
    </template>
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
