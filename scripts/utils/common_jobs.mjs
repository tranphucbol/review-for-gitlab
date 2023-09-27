import path from 'node:path';
import fs from 'node:fs';
import { writeFile } from 'node:fs/promises';
// eslint-disable-next-line import/no-unresolved
import { copy } from 'fs-extra/esm';
import { root, run } from './run_utils.mjs';
import { generateFont } from './generate_font.mjs';
import { prettyPrint } from './packages.mjs';

const prepareDistDirs = async env => {
  fs.mkdirSync(path.join(root, `dist-${env}`));
  fs.mkdirSync(path.join(root, `dist-${env}/webviews`));
  fs.mkdirSync(path.join(root, `dist-${env}/assets`));
};

export async function cleanBuild(env) {
  await run('rm', ['-rf', `dist-${env}`]);
}

export async function prepareWebviews(webviews, env) {
  const targets = Object.keys(webviews);

  targets.forEach(async target => {
    await run('npm', ['run', '--prefix', path.join(root, `webviews/${target}`), 'build']);
    webviews[target].forEach(async webview => {
      await copy(
        path.join(root, `webviews/${target}/dist/${webview}`),
        path.join(root, `dist-${env}/webviews/${webview}`),
      );
    });
  });
}

export async function generateAssets(packageJson, env) {
  return Promise.all([
    copy(path.join(root, 'src/assets'), path.join(root, `dist-${env}/assets`)),
    copy(
      path.join(root, 'node_modules/@gitlab-org/gitlab-lsp/out'),
      path.join(root, `dist-${env}/assets/language-server`),
    ),
    generateFont(packageJson, `dist-${env}`),
  ]);
}

export async function writePackageJson(packageJson, env) {
  await writeFile(path.join(root, `dist-${env}/package.json`), prettyPrint(packageJson));
}

export async function commonJobs(env) {
  await cleanBuild(env);
  await prepareDistDirs(env);
}
