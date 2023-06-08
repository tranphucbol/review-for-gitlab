import {
  cleanDesktopBuild,
  copyAssets,
  writeDesktopPackageJson,
  copyPendingJobAssets,
  prepareDistDirs,
  watchDesktop,
  watchIssuable,
} from './utils/desktop_jobs.mjs';

async function main() {
  await cleanDesktopBuild();
  await prepareDistDirs();

  await Promise.all([writeDesktopPackageJson(), copyAssets(), copyPendingJobAssets()]);

  const abortController = new AbortController();
  process.on('exit', () => abortController.abort());

  watchDesktop(abortController.signal);
  watchIssuable(abortController.signal);
}

main();
