import path from 'path';
import { buildDesktop, buildPackage, root, preparePackageFiles } from './utils/jobs.mjs';

async function build() {
  await buildDesktop();
  await preparePackageFiles();
  await buildPackage({ cwd: path.resolve(root, 'dist-desktop') });
}

build();
