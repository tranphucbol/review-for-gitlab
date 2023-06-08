import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { root, run } from './run_utils.mjs';
import { createBrowserPackageJson } from './packages.mjs';

export async function cleanBrowserBuild() {
  await run('rm', ['-rf', 'dist-browser']);
}

async function prepareDistDirs() {
  mkdirSync(path.join(root, 'dist-browser'));
}

async function writeBrowserPackageJson() {
  const json = createBrowserPackageJson();
  await writeFile(path.join(root, 'dist-browser/package.json'), json);
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
      path.join(root, 'src/browser.js'),
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

export async function buildBrowser() {
  await cleanBrowserBuild();
  await prepareDistDirs();

  await Promise.all([writeBrowserPackageJson(), buildExtension(['--minify'])]);
}
