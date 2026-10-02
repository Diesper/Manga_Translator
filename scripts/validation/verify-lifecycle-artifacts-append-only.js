'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const humanGate = require('../../docs/biblia/.coordination/human-gate');

const root = path.resolve(__dirname, '../..');
const TRUSTED_COMMITTER_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';
const LIFECYCLE_AUTHORITY_EFFECTIVE_AT_UTC = '2026-10-02T06:20:00Z';

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

function parseRawHistory(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(':'))
    .map((line) => {
      const match = /^:(\d{6})\s+(\d{6})\s+([0-9a-f]{40})\s+([0-9a-f]{40})\s+([A-Z])\t(.+)$/i.exec(line);
      if (!match) return { status:'?', file:line };
      return { status:match[5].toUpperCase(), file:match[6].replace(/\\/g,'/') };
    });
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
      if (/\/human-approvals\//.test(file)) {
        try {
          const approval = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
          if (Number(approval?.schema_version) !== 2) {
            problems.push('approval humana nova deve usar schema_version 2 com proveniência: ' + file);
          }
          for (const problem of humanGate.validateApproval(approval, file)) problems.push(problem);
        } catch (error) {
          problems.push('approval humana nova inválida: ' + file + ' ' + error.message);
        }
      }
    }
  }
  return { skipped: false, problems };
}

function verifyHistoricalAuthority() {
  const problems = [];
  const roots = [
    'docs/biblia/.coordination/correction-authorizations',
    'docs/biblia/.coordination/human-approvals',
  ];
  const raw = git([
    'log',
    '--since=' + LIFECYCLE_AUTHORITY_EFFECTIVE_AT_UTC,
    '--format=',
    '--raw',
    '--no-abbrev',
    '--full-index',
    '--no-renames',
    '--',
    ...roots,
  ]);

  for (const change of parseRawHistory(raw)) {
    if (!protectedArtifact(change.file)) continue;
    if (change.status !== 'A') {
      problems.push(
        'artefato lifecycle histórico não é append-only: status=' + change.status + ' file=' + change.file
      );
    }
  }

  const current = git(['ls-tree','-r','--name-only','HEAD','--',...roots])
    .split(/\r?\n/)
    .map((line)=>line.trim())
    .filter((file)=>protectedArtifact(file));
  for (const file of current) {
    const committer = introducingCommitter(file);
    if (!trustedAuthorityCommitter(committer)) {
      problems.push(
        'artefato de autoridade no HEAD não foi introduzido pelo workflow canônico: '
        + file + ' committer=' + (committer ? committer.name + '<' + committer.email + '>' : '-')
      );
    }
  }
  return { problems };
}

function main(argv = process.argv.slice(2)) {
  const incremental = verify(parseBase(argv));
  const historical = verifyHistoricalAuthority();
  const problems = [...new Set([...(incremental.problems || []), ...(historical.problems || [])])];
  if (problems.length) {
    console.error('Lifecycle artifacts append-only: BLOCKED');
    for (const problem of problems) console.error('- ' + problem);
    process.exit(1);
  }
  console.log(
    'Lifecycle artifacts append-only: PASS'
    + (incremental.skipped ? ' — incremental base unavailable; full Git history verified' : '')
  );
}

if (require.main === module) main();

module.exports = {
  TRUSTED_COMMITTER_EMAIL,
  LIFECYCLE_AUTHORITY_EFFECTIVE_AT_UTC,
  parseRawHistory,
  protectedArtifact,
  trustedAuthorityCommitter,
  verify,
  verifyHistoricalAuthority,
};
