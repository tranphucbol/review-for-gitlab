import { cleanDesktopBuild } from './utils/desktop_jobs.mjs';
import { cleanBrowserBuild } from './utils/browser_jobs.mjs';

async function main() {
  await cleanDesktopBuild();
  await cleanBrowserBuild();
}

main();
