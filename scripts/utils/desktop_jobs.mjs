import path from 'node:path';
import fs from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { root, run } from './run_utils.mjs';
import { createDesktopPackageJson } from './packages.mjs';
import { prepareWebviews, generateAssets, writePackageJson, commonJobs } from './common_jobs.mjs';
import { ENVIRONMENTS } from '../constants.mjs';

const desktopWebviews = {
  vue: ['gitlab_duo_chat', 'issuable'],
  vue2: [],
};

export async function copyPendingJobAssets() {
  return copyFile(
    path.join(root, 'webviews/pendingjob.html'),
    path.join(root, `dist-desktop/webviews/pendingjob.html`),
  );
}

export async function copySecurityFindingAssets() {
  return copyFile(
    path.join(root, 'webviews/security_finding.html'),
    path.join(root, `dist-desktop/webviews/security_finding.html`),
  );
}

export async function compileSource() {
  await run('tsc', ['-p', root]);
}

// eslint-disable-next-line default-param-last
export async function buildExtension(args = [], signal) {
  await run(
    'esbuild',
    [
      path.join(root, 'src/desktop/extension.js'),
      '--bundle',
      '--outfile=dist-desktop/extension.js',
      '--external:vscode',
      '--platform=node',
      '--target=node16.13',
      '--sourcemap',
      ...args,
    ],
    { signal },
  );
}

export async function checkAndBuildExtension(args = []) {
  await compileSource();
  await buildExtension(args);
}

export async function preparePackageFiles() {
  const files = ['.vscodeignore', 'README.md', 'LICENSE'];
  files.forEach(file => {
    fs.copyFileSync(path.join(root, file), path.join(root, `dist-desktop/${file}`));
  });
  await run('cp', ['-R', path.join(root, 'node_modules'), path.join(root, 'dist-desktop')]);
}

export function watchWebviews(signal) {
  const targets = Object.keys(desktopWebviews);
  targets.forEach(async target => {
    desktopWebviews[target].forEach(webview => {
      const dirpath = path.join(root, `webviews/${target}/dist/${webview}`);
      if (!fs.existsSync(dirpath)) fs.mkdirSync(dirpath, { recursive: true });
      fs.symlinkSync(dirpath, path.join(root, `dist-desktop/webviews/${webview}`));
    });
    await run('npm', ['run', '--prefix', path.join(root, `webviews/${target}`), 'watch'], {
      signal,
    });
  });
}

export async function buildDesktop() {
  const packageJson = createDesktopPackageJson();

  await commonJobs(ENVIRONMENTS.DESKTOP);

  await Promise.all([
    prepareWebviews(desktopWebviews, ENVIRONMENTS.DESKTOP),
    copyPendingJobAssets(),
    copySecurityFindingAssets(),
    checkAndBuildExtension(['--minify']),
    generateAssets(packageJson, ENVIRONMENTS.DESKTOP),
  ]);

  // we need to wait for `tsc` to compile so we can replace package.json
  await writePackageJson(packageJson, ENVIRONMENTS.DESKTOP);
}

export async function watchDesktop(signal) {
  const packageJson = createDesktopPackageJson();
  await compileSource();
  await writePackageJson(packageJson, ENVIRONMENTS.DESKTOP);
  await buildExtension(['--watch'], signal);
}

export async function buildPackage(options) {
  await run('vsce', ['package'], options);
}
