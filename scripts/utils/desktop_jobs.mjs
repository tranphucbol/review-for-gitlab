import path from 'node:path';
import fs from 'node:fs';
import { copyFile, writeFile } from 'node:fs/promises';
// eslint-disable-next-line import/no-unresolved
import { copy } from 'fs-extra/esm';
import { root, run } from './run_utils.mjs';
import { createDesktopPackageJson, prettyPrint } from './packages.mjs';
import { generateFont } from './generate_font.mjs';

export async function cleanDesktopBuild() {
  await run('rm', ['-rf', 'dist-desktop']);
}

export async function prepareIssuable() {
  await run('npm', ['run', '--prefix', path.join(root, 'webviews/issuable'), 'build']);
  await copy(
    path.join(root, 'webviews/issuable/dist'),
    path.join(root, 'dist-desktop/webviews/issuable'),
  );
}

export async function prepareDistDirs() {
  fs.mkdirSync(path.join(root, 'dist-desktop'));
  fs.mkdirSync(path.join(root, 'dist-desktop/webviews'));
  fs.mkdirSync(path.join(root, 'dist-desktop/assets'));
}

export async function generateAssets(packageJson) {
  return Promise.all([
    copy(path.join(root, 'src/assets'), path.join(root, 'dist-desktop/assets')),
    generateFont(packageJson, 'dist-desktop'),
  ]);
}

export async function copyPendingJobAssets() {
  return copyFile(
    path.join(root, 'webviews/pendingjob.html'),
    path.join(root, `dist-desktop/webviews/pendingjob.html`),
  );
}

export async function writeDesktopPackageJson(json) {
  await writeFile(path.join(root, 'dist-desktop/package.json'), prettyPrint(json));
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

export async function watchIssuable(signal) {
  const dirpath = path.join(root, 'webviews/issuable/dist');
  if (!fs.existsSync(dirpath)) fs.mkdirSync(dirpath);
  fs.symlinkSync(
    path.join(root, 'webviews/issuable/dist'),
    path.join(root, 'dist-desktop/webviews/issuable'),
  );
  await run('npm', ['run', '--prefix', path.join(root, 'webviews/issuable'), 'watch'], { signal });
}

export async function buildDesktop() {
  const packageJson = createDesktopPackageJson();

  await cleanDesktopBuild();
  await prepareDistDirs();

  await Promise.all([
    prepareIssuable(),
    copyPendingJobAssets(),
    checkAndBuildExtension(['--minify']),
    generateAssets(packageJson),
  ]);

  // we need to wait for `tsc` to compile so we can replace package.json
  await writeDesktopPackageJson(packageJson);
}

export async function watchDesktop(signal) {
  const packageJson = createDesktopPackageJson();
  await compileSource();
  await writeDesktopPackageJson(packageJson);
  await buildExtension(['--watch'], signal);
}

export async function buildPackage(options) {
  await run('vsce', ['package'], options);
}
