const read = require('@commitlint/read').default;
const lint = require('@commitlint/lint').default;
const format = require('@commitlint/format').default;
const config = require('@commitlint/config-conventional');

// You can test the script by setting these environment variables
const {
  CI_MERGE_REQUEST_SOURCE_BRANCH_SHA, // this is the last commit in the MR (it ignores the merge result commit)
  CI_MERGE_REQUEST_DIFF_BASE_SHA, // refers to the main branch
  CI_MERGE_REQUEST_SQUASH_ON_MERGE, // true if the squash MR checkbox is ticked
  CI_MERGE_REQUEST_TITLE, // MR Title
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
        messageMatcher(/^\d+\.\d+\.\d+/),
      ],
    },
  );
}

async function lintMr() {
  console.log('INFO: Linting in CI mode...');
  const commits = await getCommitsInMr();

  // When using merge trains (CI_MERGE_REQUEST_EVENT_TYPE === 'merge_train') squash always overrides the commit message
  // this is different from standard merges where squash only overrides commit message if the MR contains more than 1 commit
  if (CI_MERGE_REQUEST_SQUASH_ON_MERGE === 'true') {
    console.log(
      'INFO: The merge request is set to squash commits and uses the merge request title for the squash commit.\n' +
        'INFO: If the merge request title is not valid conventional commit message, fix the title and rerun this CI/CD job.\n',
    );
    return isConventional(CI_MERGE_REQUEST_TITLE).then(Array.of);
  }
  console.log(
    "INFO: The merge request isn't set to squash commits. Every commit message must use conventional commits.\n" +
      'INFO: For help, read https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/blob/main/docs/developer/commits.md',
  );
  return Promise.all(commits.map(isConventional));
}

async function run() {
  if (!CI) {
    console.error('This script can only run in GitLab CI.');
    process.exit(1);
  }
  const results = await lintMr();

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
