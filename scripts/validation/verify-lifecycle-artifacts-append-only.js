'use strict';

const childProcess = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '../..');

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

module.exports = { protectedArtifact, verify };
