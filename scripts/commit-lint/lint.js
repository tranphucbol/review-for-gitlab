const axios = require('axios').default;
const read = require('@commitlint/read').default;
const lint = require('@commitlint/lint').default;
const format = require('@commitlint/format').default;
const config = require('@commitlint/config-conventional');

// You can test the script by setting these environment variables
const {
  CI_MERGE_REQUEST_PROJECT_ID, // 5261717
  CI_MERGE_REQUEST_IID,
  CI_MERGE_REQUEST_SOURCE_BRANCH_SHA, // this is the last commit in the MR (it ignores the merge result commit)
  CI_MERGE_REQUEST_DIFF_BASE_SHA, // refers to the main branch
  CI, // true when script is run in a CI/CD pipeline
} = process.env;

const urlSemanticRelease =
  'https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/blob/main/docs/developer/commits.md';

// See rule docs https://commitlint.js.org/#/reference-rules
const customRules = {
  'header-max-length': [2, 'always', 72],
  'body-leading-blank': [2, 'always'],
  'footer-leading-blank': [2, 'always'],
  'subject-case': [0],
  'body-max-line-length': [1, 'always', 100],
};

async function getMr() {
  const result = await axios.get(
    `https://gitlab.com/api/v4/projects/${CI_MERGE_REQUEST_PROJECT_ID}/merge_requests/${CI_MERGE_REQUEST_IID}`,
  );
  const { title, squash } = result.data;
  return {
    title,
    squash,
  };
}

async function getCommitsInMr() {
  const diffBaseSha = CI_MERGE_REQUEST_DIFF_BASE_SHA;
  const sourceBranchSha = CI_MERGE_REQUEST_SOURCE_BRANCH_SHA;
  const messages = await read({ from: diffBaseSha, to: sourceBranchSha });
  return messages;
}

const messageMatcher = r => r.test.bind(r);

async function isConventional(message) {
  return lint(
    message,
    { ...config.rules, ...customRules },
    {
      defaultIgnores: false,
      ignores: [
        messageMatcher(/^[Rr]evert .*/),
        messageMatcher(/^(?:fixup|squash)!/),
        messageMatcher(/^Merge branch/),
      ],
    },
  );
}

async function lintLocal() {
  console.log('INFO: Linting in local mode...');
  const commits = await read({ from: 'main', to: 'HEAD' });
  return Promise.all(commits.map(isConventional));
}

async function lintMr() {
  console.log('INFO: Linting in CI mode...');
  const mr = await getMr();
  const commits = await getCommitsInMr();

  if (!mr.squash || commits.length === 1) {
    console.log(
      "INFO: Either the merge request isn't set to squash commits, or contains only one commit. Every commit message must use conventional commits.\n" +
        'INFO: For help, read https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/blob/main/docs/developer/commits.md',
    );
    return Promise.all(commits.map(isConventional));
  }

  console.log(
    'INFO: The merge request is set to both squash commits and use the merge request title for the squash commit.\n' +
      'INFO: If the merge request title is incorrect, fix the title and rerun this CI/CD job.\n',
  );
  return isConventional(mr.title).then(Array.of);
}

async function run() {
  let results;
  if (!CI) {
    console.log('INFO: CI environment variable not detected.');
    results = await lintLocal();
  } else {
    console.log('INFO: CI variable detected.');
    results = await lintMr();
  }

  console.error(format({ results }, { helpUrl: urlSemanticRelease }));

  const numOfErrors = results.reduce((acc, result) => acc + result.errors.length, 0);
  if (numOfErrors !== 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
