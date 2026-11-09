/* eslint-disable no-console */
// Real golang.go + gopls against gl-review: documents in VS Code 1.84.2.
// Run from the repository root after `npm run prepare:test:integration`:
//   node .agents/skills/local-testing/scripts/go/run_go.js
// `go` and `gopls` come from PATH; set GOPLS to point at a specific gopls binary.
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const {
  downloadAndUnzipVSCode,
  resolveCliPathFromVSCodeExecutablePath,
  runTests,
} = require('@vscode/test-electron');
const {
  REMOTE,
  DEFAULT_VS_CODE_SETTINGS,
} = require('../../../../../test/integration/test_infrastructure/shared_constants');

const VS_CODE_VERSION = '1.84.2';
const GO_EXTENSION = 'golang.go@0.46.1';
const which = bin => cp.execFileSync('which', [bin]).toString().trim();
const GO_BIN = path.dirname(which('go'));
const GOPLS = process.env.GOPLS || which('gopls');

const repoRoot = path.resolve(__dirname, '../../../../..');
const e2eRoot = path.join(repoRoot, '.vscode-test');
const extensionsDir = path.join(e2eRoot, 'e2e-ext');
const userDataDir = path.join(e2eRoot, 'e2e-ud');
const workspace = path.join(e2eRoot, 'e2e-go-workspace');

const BASE_FILES = {
  'go.mod': 'module example.com/review\n\ngo 1.21\n',
  'greet.go': 'package main\n\nfunc Greet(name string) string {\n\treturn "hello " + name\n}\n',
  'main.go': 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println(Greet("base"))\n}\n',
};
const HEAD_MAIN =
  'package main\n\nimport "fmt"\n\n// Hello says hello.\nfunc Hello() string {\n\treturn "hello"\n}\n\nfunc main() {\n\tfmt.Println(Greet("head"), Hello())\n}\n';

const git = (...args) => cp.execFileSync('git', args, { cwd: workspace }).toString().trim();

const writeFiles = files =>
  Object.entries(files).forEach(([name, content]) =>
    fs.writeFileSync(path.join(workspace, name), content),
  );

function createGoWorkspace() {
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspace, '.vscode'), { recursive: true });
  git('init', '--initial-branch', 'master');
  git('remote', 'add', REMOTE.NAME, REMOTE.URL);
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test Name');
  fs.writeFileSync(path.join(workspace, '.gitignore'), '.vscode/\n');
  writeFiles(BASE_FILES);
  git('add', '.');
  git('commit', '-m', 'base');
  const baseSha = git('rev-parse', 'HEAD');
  writeFiles({ 'main.go': HEAD_MAIN });
  git('commit', '-am', 'head');
  const headSha = git('rev-parse', 'HEAD');
  const mainDiff = git('diff', '--no-color', baseSha, headSha, '--', 'main.go')
    .split('\n')
    .slice(4)
    .join('\n');
  fs.writeFileSync(
    path.join(workspace, '.vscode/settings.json'),
    JSON.stringify({
      ...DEFAULT_VS_CODE_SETTINGS,
      'go.alternateTools': { gopls: GOPLS },
      'go.toolsManagement.checkForUpdates': 'off',
      'go.toolsManagement.autoUpdate': false,
      'go.survey.prompt': false,
      'go.useLanguageServer': true,
    }),
  );
  return { baseSha, headSha, mainDiff: `${mainDiff}\n` };
}

async function main() {
  const shas = createGoWorkspace();
  const vscodeExecutablePath = await downloadAndUnzipVSCode(VS_CODE_VERSION);
  const cli = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath);
  const cliArgs = ['--extensions-dir', extensionsDir, '--user-data-dir', userDataDir];
  cp.execFileSync(cli, [...cliArgs, '--install-extension', GO_EXTENSION, '--force'], {
    stdio: 'inherit',
  });
  console.log(
    'installed extensions:',
    cp.execFileSync(cli, [...cliArgs, '--list-extensions', '--show-versions']).toString(),
  );

  process.env.PATH = `${GO_BIN}:${path.dirname(GOPLS)}:${process.env.PATH}`;
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: path.join(repoRoot, 'dist-desktop'),
    extensionTestsPath: path.join(__dirname, 'suite'),
    extensionTestsEnv: {
      E2E_BASE_SHA: shas.baseSha,
      E2E_HEAD_SHA: shas.headSha,
      E2E_MAIN_DIFF: shas.mainDiff,
    },
    launchArgs: [...cliArgs, '--disable-workspace-trust', workspace],
  });
}

main().catch(e => {
  console.error('Go e2e failed', e);
  process.exit(1);
});
