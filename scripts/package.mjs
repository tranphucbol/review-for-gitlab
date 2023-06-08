import path from 'path';
import { root } from './utils/run_utils.mjs';
import { buildDesktop, buildPackage, preparePackageFiles } from './utils/desktop_jobs.mjs';

async function build() {
  await buildDesktop();
  await preparePackageFiles();
  await buildPackage({ cwd: path.resolve(root, 'dist-desktop') });
}

build();
