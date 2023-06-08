import lodash from 'lodash';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './run_utils.mjs';

const packageJson = () => JSON.parse(readFileSync(join(root, 'package.json')));
const desktopPackageJson = () => JSON.parse(readFileSync(join(root, 'desktop.package.json')));
const browserPackageJson = () => JSON.parse(readFileSync(join(root, 'browser.package.json')));

function mergeJson(left, right) {
  return lodash.mergeWith(left, right, (src, other) =>
    lodash.isArray(src) && lodash.isArray(other) ? src.concat(other) : undefined,
  );
}

function prettyPrint(json) {
  return JSON.stringify(json, null, 2);
}

export function createDesktopPackageJson() {
  const json = mergeJson(packageJson(), desktopPackageJson());
  return prettyPrint(json);
}

export function createBrowserPackageJson() {
  const json = mergeJson(packageJson(), browserPackageJson());
  return prettyPrint(json);
}
