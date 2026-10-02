'use strict';

const childProcess = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const TRUSTED_COMMITTER_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';

function git(args) {
  return childProcess.execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function parseBase(argv) {
  const i = argv.indexOf('--base');
  return i >= 0 ? argv[i + 1] : null;
}

function protectedArtifact(file) {
  return /^docs\/biblia\/\.coordination\/(?:correction-authorizations|human-approvals)\/.*\.json$/i.test(file);
}

function introducingCommitter(file) {
  const raw = git(['log', '--diff-filter=A', '-1', '--format=%cn%x09%ce', 'HEAD', '--', file]).trim();
  if (!raw) return null;
  const parts = raw.split('\t');
  return { name: parts[0] || '', email: parts[1] || '' };
}

function trustedAuthorityCommitter(committer) {
  return Boolean(committer && committer.email === TRUSTED_COMMITTER_EMAIL);
}

function verify(base) {
  if (!base || /^0+$/.test(base)) return { skipped: true, problems: [] };
  const raw = git(['diff', '--name-status', '--find-renames', base + '..HEAD', '--']);
  const problems = [];
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    const parts = line.split('\t');
    const status = parts[0];
    const paths = parts.slice(1).map((item) => item.replace(/\\/g, '/'));
    if (!paths.some(protectedArtifact)) continue;
    if (status !== 'A') {
      problems.push('artefato lifecycle append-only não pode ser ' + status + ': ' + paths.join(' -> '));
      continue;
    }
    for (const file of paths.filter(protectedArtifact)) {
      const committer = introducingCommitter(file);
      if (!trustedAuthorityCommitter(committer)) {
        problems.push(
          'artefato de autoridade deve ser criado pelo workflow canônico/github-actions[bot]: '
          + file + ' committer=' + (committer ? committer.name + '<' + committer.email + '>' : '-')
        );
      }
    }
  }
  return { skipped: false, problems };
}

function main(argv = process.argv.slice(2)) {
  const result = verify(parseBase(argv));
  if (result.skipped) {
    console.log('Lifecycle artifacts append-only: SKIP — base SHA indisponível');
    return;
  }
  if (result.problems.length) {
    console.error('Lifecycle artifacts append-only: BLOCKED');
    for (const problem of result.problems) console.error('- ' + problem);
    process.exit(1);
  }
  console.log('Lifecycle artifacts append-only: PASS');
}

if (require.main === module) main();

module.exports = { TRUSTED_COMMITTER_EMAIL, protectedArtifact, trustedAuthorityCommitter, verify };
