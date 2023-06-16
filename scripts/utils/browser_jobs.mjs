import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
// eslint-disable-next-line import/no-unresolved
import { copy } from 'fs-extra/esm';
import { root, run } from './run_utils.mjs';
import { createBrowserPackageJson, prettyPrint } from './packages.mjs';
import { generateFont } from './generate_font.mjs';

export async function cleanBrowserBuild() {
  await run('rm', ['-rf', 'dist-browser']);
}

async function prepareDistDirs() {
  mkdirSync(path.join(root, 'dist-browser'));
  mkdirSync(path.join(root, 'dist-browser/assets'));
}

async function writeBrowserPackageJson(packageJson) {
  await writeFile(path.join(root, 'dist-browser/package.json'), prettyPrint(packageJson));
}

function typecheck(signal) {
  return run('tsc', ['-p', root, '--noEmit'], { signal });
}

// eslint-disable-next-line default-param-last
async function buildExtension(args = [], signal) {
  await typecheck(signal);
  await run(
    'esbuild',
    [
      path.join(root, 'src/browser/browser.js'),
      '--bundle',
      '--outfile=dist-browser/browser.js',
      '--external:vscode',
      '--format=cjs',
      '--sourcemap',
      ...args,
    ],
    { signal },
  );
}

export async function generateAssets(packageJson) {
  return Promise.all([
    copy(path.join(root, 'src/assets'), path.join(root, 'dist-browser/assets')),
    generateFont(packageJson, 'dist-browser'),
  ]);
}

export async function buildBrowser() {
  const packageJson = createBrowserPackageJson();

  await cleanBrowserBuild();
  await prepareDistDirs();

  await Promise.all([
    writeBrowserPackageJson(packageJson),
    buildExtension(['--minify']),
    generateAssets(packageJson),
  ]);
}
