import {
  cleanDesktopBuild,
  generateAssets,
  writeDesktopPackageJson,
  copyPendingJobAssets,
  prepareDistDirs,
  watchDesktop,
  watchIssuable,
} from './utils/desktop_jobs.mjs';
import { createDesktopPackageJson } from './utils/packages.mjs';

async function main() {
  const packageJson = createDesktopPackageJson();
  await cleanDesktopBuild();
  await prepareDistDirs();

  await Promise.all([
    writeDesktopPackageJson(packageJson),
    generateAssets(packageJson),
    copyPendingJobAssets(),
  ]);

  const abortController = new AbortController();
  process.on('exit', () => abortController.abort());

  watchDesktop(abortController.signal);
  watchIssuable(abortController.signal);
}

main();
