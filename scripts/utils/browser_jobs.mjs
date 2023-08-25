import path from 'node:path';
import { root, run } from './run_utils.mjs';
import { createBrowserPackageJson } from './packages.mjs';
import { prepareWebviews, generateAssets, writePackageJson, commonJobs } from './common_jobs.mjs';
import { ENVIRONMENTS } from '../constants.mjs';

const browserWebviews = {
  vue: ['gitlab_duo_chat'],
  vue2: [],
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
