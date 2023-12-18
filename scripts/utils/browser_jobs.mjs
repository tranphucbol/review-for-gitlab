import path from 'node:path';
import { root, run } from './run_utils.mjs';
import { createBrowserPackageJson } from './packages.mjs';
import { prepareWebviews, generateAssets, writePackageJson, commonJobs } from './common_jobs.mjs';
import { ENVIRONMENTS } from '../constants.mjs';

const browserWebviews = {
  vue: [],
  vue2: ['gitlab_duo_chat'],
};

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
      // For the fs and path fixes, see:
      // https://github.com/tree-sitter/tree-sitter/tree/660481dbf71413eba5a928b0b0ab8da50c1109e0/lib/binding_web#cant-resolve-fs-in-node_modulesweb-tree-sitter
      '--external:fs',
      '--external:path',
      '--format=cjs',
      '--sourcemap',
      ...args,
    ],
    { signal },
  );
}

export async function buildBrowser() {
  const packageJson = createBrowserPackageJson();

  await commonJobs(ENVIRONMENTS.BROWSER);

  await Promise.all([
    prepareWebviews(browserWebviews, ENVIRONMENTS.BROWSER),
    writePackageJson(packageJson, ENVIRONMENTS.BROWSER),
    buildExtension(['--minify']),
    generateAssets(packageJson, ENVIRONMENTS.BROWSER),
  ]);
}

export default {};
