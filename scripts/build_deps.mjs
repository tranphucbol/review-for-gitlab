import path from 'node:path';
import { root, run } from './utils/run_utils.mjs';

/**
 * Transforms dependencies using ES6 modules
 * to CommonJS. Otherwise, we can't require
 * these dependencies from CommonJS modules
 * without using dynamic imports.
 */
async function main() {
  await run('rm', [
    '-r',
    path.join(root, 'dist-desktop/node_modules/@anycable'),
    path.join(root, 'dist-desktop/node_modules/nanoevents'),
  ]);
  await run('tsc', ['-p', path.join(root, 'test/deps.tsconfig.json')]);
}

main();
