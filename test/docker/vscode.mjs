// Inside the headless box (docs/decisions/025): downloads a VS Code, installs one .vsix into a
// throwaway profile and starts VS Code with its DevTools port forwarded to 0.0.0.0:<port>, which
// scripts/headless.mjs publishes on the host's 127.0.0.1. Started by `headless.mjs vscode`.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  downloadAndUnzipVSCode,
  resolveCliPathFromVSCodeExecutablePath,
} from '@vscode/test-electron';

// Electron binds DevTools to the container's loopback; socat listens on the published port.
const INTERNAL_DEVTOOLS_PORT = '19222';

const args = Object.fromEntries(
  process.argv.slice(2).map(arg => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const { version = 'stable', port, vsix, folder } = args;
if (!port || !vsix || !folder) throw new Error('Pass --port, --vsix and --folder.');
if (port === INTERNAL_DEVTOOLS_PORT) throw new Error(`Port ${port} is reserved in the box.`);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-'));
const profileArgs = [
  '--extensions-dir',
  path.join(profile, 'ext'),
  '--user-data-dir',
  path.join(profile, 'ud'),
];
fs.mkdirSync(path.join(profile, 'ud/User'), { recursive: true });
fs.writeFileSync(
  path.join(profile, 'ud/User/settings.json'),
  JSON.stringify(
    {
      'gitlab.debug': true,
      'workbench.startupEditor': 'none',
      'update.mode': 'none',
      'extensions.autoUpdate': false,
      'telemetry.telemetryLevel': 'off',
      'security.workspace.trust.enabled': false,
      'chat.disableAIFeatures': true,
      'window.restoreWindows': 'none',
      'window.titleBarStyle': 'custom',
      'window.newWindowDimensions': 'maximized',
    },
    null,
    2,
  ),
);

const executable = await downloadAndUnzipVSCode({ version });
const cli = resolveCliPathFromVSCodeExecutablePath(executable);
const install = spawnSync(
  cli,
  [...profileArgs, '--no-sandbox', '--install-extension', vsix, '--force'],
  { stdio: 'inherit' },
);
if (install.status !== 0) process.exit(install.status ?? 1);
spawnSync(cli, [...profileArgs, '--no-sandbox', '--list-extensions', '--show-versions'], {
  stdio: 'inherit',
});

// The box runs as root, so Chromium's sandbox is off; the container is the sandbox.
const code = spawn(
  executable,
  [
    ...profileArgs,
    '--no-sandbox',
    '--disable-gpu-sandbox',
    `--remote-debugging-port=${INTERNAL_DEVTOOLS_PORT}`,
    '--disable-workspace-trust',
    '--skip-welcome',
    '--skip-release-notes',
    '--new-window',
    folder,
  ],
  { stdio: 'inherit' },
);
const forward = spawn(
  'socat',
  [`TCP-LISTEN:${port},fork,reuseaddr,bind=0.0.0.0`, `TCP:127.0.0.1:${INTERNAL_DEVTOOLS_PORT}`],
  { stdio: 'inherit' },
);
code.on('exit', status => {
  forward.kill();
  console.log(`VS Code exited with ${status}.`);
  process.exit(status ?? 0);
});
