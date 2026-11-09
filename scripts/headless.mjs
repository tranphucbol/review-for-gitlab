// Runs tests, or a real VS Code, in the headless box: a Linux container with a virtual display,
// so nothing opens on your screen (docs/decisions/025).
//
//   node scripts/headless.mjs integration      # npm run test:integration (layer 2)
//   node scripts/headless.mjs go               # the language extension runner (layer 3)
//   node scripts/headless.mjs vscode --vsix <file> --folder <dir> [--version stable] [--port 9333]
//   node scripts/headless.mjs stop [--port 9333]
//   node scripts/headless.mjs shell            # bash in the box, for debugging
//
// `vscode` starts VS Code in the background with the account from $GITLAB_HOST/$GITLAB_TOKEN and
// its DevTools port published on 127.0.0.1, for playwright-cli to attach to (layer 4).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { root } from './utils/run_utils.mjs';

const COMPOSE_FILE = path.join(root, 'test/docker/compose.yml');
const NODE_VERSION = fs
  .readFileSync(path.join(root, '.tool-versions'), 'utf8')
  .match(/^nodejs\s+(\S+)/m)[1];
const DEFAULT_PORT = '9333';
const READY_TRIES = 120;

const [command = 'integration', ...rest] = process.argv.slice(2);

function option(name, fallback) {
  const index = rest.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = rest[index + 1];
  if (!value) throw new Error(`--${name} needs a value.`);
  return value;
}

const containerName = port => `review-for-gitlab-vscode-${port}`;

function docker(args, env = process.env, stdio = 'inherit') {
  const result = spawnSync('docker', args, { stdio, env });
  if (result.error) throw result.error;
  return result;
}

function runInBox(boxArgs, { env, runArgs = [] } = {}) {
  return docker(
    ['compose', '-f', COMPOSE_FILE, 'run', '--rm', '--build', ...runArgs, 'box', ...boxArgs],
    { ...process.env, NODE_VERSION, ...env },
  ).status;
}

const sleep = ms =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

async function waitForDevTools(port, name) {
  for (let i = 0; i < READY_TRIES; i += 1) {
    const running = docker(['ps', '-q', '--filter', `name=^${name}$`], process.env, 'pipe');
    if (!running.stdout.toString().trim()) {
      docker(['logs', name]);
      throw new Error('VS Code stopped before its DevTools port answered.');
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      // eslint-disable-next-line no-await-in-loop
      const pages = await response.json();
      if (pages.some(page => page.url.endsWith('workbench.html'))) return;
    } catch {
      // not listening yet
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(1000);
  }
  throw new Error(`VS Code's DevTools port ${port} did not answer in ${READY_TRIES} seconds.`);
}

async function startVsCode() {
  const vsix = path.resolve(option('vsix'));
  const folder = path.resolve(option('folder'));
  const version = option('version', 'stable');
  const port = option('port', DEFAULT_PORT);
  const name = containerName(port);
  if (!fs.existsSync(vsix)) throw new Error(`No .vsix at ${vsix}.`);
  if (!fs.statSync(folder).isDirectory()) throw new Error(`No folder at ${folder}.`);
  if (!process.env.GITLAB_HOST || !process.env.GITLAB_TOKEN) {
    throw new Error('Set GITLAB_HOST and GITLAB_TOKEN first.');
  }
  const workspace = `/workspace/${path.basename(folder)}`;
  // The token reaches the container by name only, never on a command line.
  const status = runInBox(
    [
      'node',
      'test/docker/vscode.mjs',
      `--version=${version}`,
      `--port=${port}`,
      '--vsix=/vsix/extension.vsix',
      `--folder=${workspace}`,
    ],
    {
      env: {
        GITLAB_WORKFLOW_INSTANCE_URL: process.env.GITLAB_HOST,
        GITLAB_WORKFLOW_TOKEN: process.env.GITLAB_TOKEN,
      },
      runArgs: [
        '--detach',
        '--name',
        name,
        '--publish',
        `127.0.0.1:${port}:${port}`,
        '--volume',
        `${vsix}:/vsix/extension.vsix:ro`,
        '--volume',
        `${folder}:${workspace}:ro`,
        '--env',
        'GITLAB_WORKFLOW_INSTANCE_URL',
        '--env',
        'GITLAB_WORKFLOW_TOKEN',
      ],
    },
  );
  if (status !== 0) process.exit(status ?? 1);
  console.log(`Waiting for VS Code ${version} in ${name}...`);
  await waitForDevTools(port, name);
  console.log(`VS Code is ready: playwright-cli attach --cdp=http://localhost:${port}`);
  console.log(`Stop it with: node scripts/headless.mjs stop --port ${port}`);
}

async function main() {
  switch (command) {
    case 'integration':
      process.exit(runInBox(['npm', 'run', 'test:integration']) ?? 1);
      break;
    case 'go':
      process.exit(
        runInBox([
          'bash',
          '-c',
          'npm run prepare:test:integration && node .agents/skills/local-testing/scripts/go/run_go.js',
        ]) ?? 1,
      );
      break;
    case 'shell':
      process.exit(runInBox(['bash']) ?? 1);
      break;
    case 'vscode':
      await startVsCode();
      break;
    case 'stop':
      docker(['rm', '--force', containerName(option('port', DEFAULT_PORT))]);
      break;
    default:
      throw new Error(`Unknown command ${command}: use integration, go, vscode, stop or shell.`);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
