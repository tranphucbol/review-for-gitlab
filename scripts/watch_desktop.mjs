import {
  cleanDesktopBuild,
  copyAssets,
  copyPackageJson,
  copyPendingJobAssets,
  prepareDistDirs,
  watchDesktop,
  watchIssuable,
} from './utils/jobs.mjs';

async function main() {
  await cleanDesktopBuild();
  await prepareDistDirs();

  copyPackageJson();
  await Promise.all([copyAssets(), copyPendingJobAssets()]);

  const abortController = new AbortController();
  process.on('exit', () => abortController.abort());

  watchDesktop(abortController.signal);
  watchIssuable(abortController.signal);
}

main();
