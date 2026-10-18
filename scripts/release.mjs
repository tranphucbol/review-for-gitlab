// Cuts a fork release: bumps the version, writes the CHANGELOG.md entry with
// this fork's links, commits it, tags vX.Y.Z and pushes both to origin. The
// tag pipeline then publishes the VSIX. See docs/decisions/005.
//
//   node scripts/release.mjs patch|minor|major|prerelease|<X.Y.Z> [--pre beta] [--dry-run] [--yes]
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { execa } from 'execa';
import semver from 'semver';
import { root, run } from './utils/run_utils.mjs';

const REMOTE = 'origin';
const BRANCH = 'main';
const UPSTREAM_URL = 'https://gitlab.com/gitlab-org/gitlab-vscode-extension';
const RELEASE_FILES = ['package.json', 'package-lock.json', 'CHANGELOG.md'];
const BUMPS = ['major', 'minor', 'patch', 'prerelease'];
// Tags of the builds that still carried upstream's GitLab.gitlab-workflow ID.
// tranphucbol.jetbrain-gitlab starts its own line at 0.0.1, so they are not
// the latest release. See docs/decisions/016.
const LEGACY_VERSIONS = '>=3.101.1 <=3.107.1';

const fail = message => {
  console.error(`ERROR: ${message}`);
  process.exit(1);
};

const git = async (...args) => (await execa('git', args, { cwd: root })).stdout.trim();

const parseArgs = argv => {
  const options = { pre: undefined, dryRun: false, yes: false, target: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--yes') options.yes = true;
    else if (arg === '--pre') {
      i += 1;
      options.pre = argv[i];
    } else if (!arg.startsWith('-') && !options.target) options.target = arg;
    else fail(`unknown argument ${arg}`);
  }
  if (!options.target) {
    fail('usage: node scripts/release.mjs patch|minor|major|prerelease|<X.Y.Z> [--pre id]');
  }
  return options;
};

const webUrl = remoteUrl => {
  const match =
    remoteUrl.match(/^https?:\/\/(?:[^@/]+@)?([^/]+)\/(.+?)(?:\.git)?$/) ||
    remoteUrl.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (!match) fail(`cannot derive a web URL from ${REMOTE} ${remoteUrl}`);
  return `https://${match[1]}/${match[2]}`;
};

const remoteVersions = async () => {
  const refs = await git('ls-remote', '--tags', '--refs', REMOTE);
  return refs
    .split('\n')
    .map(line => line.split('refs/tags/')[1])
    .filter(tag => tag && tag.startsWith('v') && semver.valid(tag.slice(1)))
    .map(tag => tag.slice(1))
    .sort(semver.rcompare);
};

const preflight = async () => {
  const branch = await git('branch', '--show-current');
  if (branch !== BRANCH)
    fail(`releases are cut from ${BRANCH}; you are on ${branch || 'no branch'}`);
  if (await git('status', '--porcelain')) fail('the working tree is not clean');
  await run('git', ['fetch', '--quiet', REMOTE, BRANCH], { cwd: root });
  const [head, remoteHead] = await Promise.all([
    git('rev-parse', 'HEAD'),
    git('rev-parse', `${REMOTE}/${BRANCH}`),
  ]);
  if (head !== remoteHead) fail(`${BRANCH} is not in sync with ${REMOTE}/${BRANCH}`);
  return head;
};

const nextVersion = (target, latest, pre) => {
  if (BUMPS.includes(target)) return semver.inc(latest ?? '0.0.0', target, pre);
  const version = semver.valid(target.replace(/^v/, ''));
  if (!version) fail(`${target} is neither a bump nor a semantic version`);
  return version;
};

// conventional-changelog writes upstream's links; the fork's entry points at
// this fork and repeats the "Fork release" paragraph of the previous entry.
const forkChangelogEntry = (changelog, version, forkUrl) => {
  const headings = [...changelog.matchAll(/^#{1,2} \[?\d.*$/gm)];
  if (!headings[0]?.[0].includes(`[${version}]`)) {
    fail(`CHANGELOG.md does not start with an entry for ${version}`);
  }
  const end = headings[1]?.index ?? changelog.length;
  const entry = changelog.slice(0, end).replaceAll(UPSTREAM_URL, forkUrl);
  const forkNote = changelog.slice(end).match(/^Fork release[^]*?(?=\n\n)/m)?.[0];
  if (!forkNote) fail('no previous CHANGELOG.md entry has a "Fork release" paragraph to repeat');
  const [heading, ...body] = entry.split('\n');
  return `${[heading, '', forkNote, ...body].join('\n')}${changelog.slice(end)}`;
};

const confirm = async question => {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await readline.question(`${question} [y/N] `);
  readline.close();
  return /^y(es)?$/i.test(answer.trim());
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const head = await preflight();
  const versions = await remoteVersions();
  const latest = versions.find(
    v => !semver.satisfies(v, LEGACY_VERSIONS, { includePrerelease: true }),
  );
  const version = nextVersion(options.target, latest, options.pre);
  const tag = `v${version}`;
  const forkUrl = webUrl(await git('remote', 'get-url', REMOTE));

  if (latest && !semver.gt(version, latest)) fail(`${tag} is not newer than v${latest}`);
  if (versions.includes(version)) fail(`${tag} already exists on ${REMOTE}`);
  if (await git('tag', '--list', tag)) fail(`${tag} already exists locally`);

  console.log(
    `Release ${tag} from ${BRANCH} ${head.slice(0, 8)} (latest tag v${latest ?? 'none'})`,
  );
  if (options.dryRun) {
    console.log('Dry run: nothing changed.');
    return;
  }

  await run('npm', ['version', version, '--no-git-tag-version', '--allow-same-version'], {
    cwd: root,
  });
  const changelogPath = path.join(root, 'CHANGELOG.md');
  const changelog = await readFile(changelogPath, 'utf8');
  await writeFile(changelogPath, forkChangelogEntry(changelog, version, forkUrl));
  await run('git', ['add', ...RELEASE_FILES], { cwd: root });
  await run('git', ['--no-pager', 'diff', '--cached', '--', 'CHANGELOG.md'], { cwd: root });

  const finish = [
    `git commit -m "chore(release): ${version}"`,
    `git tag -a ${tag} -m "${version}"`,
    `git push --atomic ${REMOTE} ${BRANCH} ${tag}`,
  ];
  if (!options.yes && !(await confirm(`Commit, tag ${tag} and push to ${REMOTE}?`))) {
    console.log('The release changes are staged, not committed. Edit CHANGELOG.md, then run:');
    finish.forEach(command => console.log(`  ${command}`));
    return;
  }

  await run('git', ['commit', '--quiet', '-m', `chore(release): ${version}`], { cwd: root });
  await run('git', ['tag', '-a', tag, '-m', version], { cwd: root });
  try {
    await run('git', ['push', '--atomic', REMOTE, BRANCH, tag], { cwd: root });
  } catch (e) {
    await run('git', ['tag', '-d', tag], { cwd: root });
    fail(`push failed; deleted the local tag ${tag}, the release commit is still on ${BRANCH}`);
  }
  console.log(`Pushed ${tag}. Pipeline: ${forkUrl}/-/pipelines?scope=tags`);
  console.log(`Release: ${forkUrl}/-/releases/${tag}`);
};

main().catch(e => fail(e.message));
