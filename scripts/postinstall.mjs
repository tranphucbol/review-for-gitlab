import path from 'node:path';
import { root, run } from './utils/run_utils.mjs';

/**
 * Call npm install in every subfolder with a package.json.
 */
async function main() {
  const files = ['webviews/vue', 'webviews/vue2', 'scripts/commit-lint'];

  for (let i = 0; i < files.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await run('npm', ['install'], { cwd: path.join(root, files[i]) });
  }
}

main();
