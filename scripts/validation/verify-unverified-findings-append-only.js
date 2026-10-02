'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const FINDING_APPEND_ONLY_EFFECTIVE_AT_UTC = '2026-10-02T07:28:18Z';

function git(args) {
  return childProcess.execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
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

function parseBase(argv) {
  const i = argv.indexOf('--base');
  return i >= 0 ? argv[i + 1] : null;
}

function artifactKind(file) {
  const normalized = String(file || '').replace(/\\/g, '/');
  if (/^docs\/biblia\/\.coordination\/unverified-findings\/\d{3}\/[^/]+\.json$/i.test(normalized)) {
    return 'FINDING';
  }
  if (/^docs\/biblia\/\.coordination\/unverified-finding-events\/\d{3}\/[^/]+\/[^/]+\.json$/i.test(normalized)) {
    return 'EVENT';
  }
  return null;
}

function addedArtifactProblems(file, raw) {
  const problems = [];
  const normalized = String(file || '').replace(/\\/g, '/');
  const kind = artifactKind(normalized);
  if (!kind) return problems;

  let value;
  try {
    value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (error) {
    return [normalized + ': JSON inválido: ' + error.message];
  }

  const parts = normalized.split('/');
  const index = kind === 'FINDING' ? Number(parts[4]) : Number(parts[4]);
  if (Number(value?.index) !== index) problems.push(normalized + ': index do JSON diverge do path');

  if (kind === 'FINDING') {
    const filenameId = path.posix.basename(normalized, '.json');
    if (String(value?.id || '') !== filenameId) problems.push(normalized + ': finding id diverge do filename');
    if (value?.status !== 'UNVERIFIED') problems.push(normalized + ': finding novo deve nascer UNVERIFIED');
    if (value?.may_change_lifecycle !== false) problems.push(normalized + ': may_change_lifecycle deve ser false');
  } else {
    const findingId = parts[5];
    const eventId = path.posix.basename(normalized, '.json');
    if (String(value?.finding_id || '') !== findingId) problems.push(normalized + ': finding_id diverge do path');
    if (String(value?.event_id || '') !== eventId) problems.push(normalized + ': event_id diverge do filename');
  }
  return problems;
}

function verify(base) {
  if (!base || /^0+$/.test(base)) return { skipped: true, problems: [] };
  const rawDiff = git(['diff', '--name-status', '--find-renames', base + '..HEAD', '--']);
  const problems = [];

  for (const line of rawDiff.split(/\r?\n/).filter(Boolean)) {
    const parts = line.split('\t');
    const status = parts[0];
    const paths = parts.slice(1).map((item) => item.replace(/\\/g, '/'));
    const relevant = paths.filter((item) => artifactKind(item));
    if (!relevant.length) continue;

    if (status !== 'A') {
      problems.push('finding/event append-only não pode ser ' + status + ': ' + paths.join(' -> '));
      continue;
    }

    for (const file of relevant) {
      const absolute = path.join(root, file);
      if (!fs.existsSync(absolute)) {
        problems.push(file + ': artefato adicionado não existe no HEAD');
        continue;
      }
      problems.push(...addedArtifactProblems(file, fs.readFileSync(absolute, 'utf8')));
    }
  }

  return { skipped: false, problems };
}

function verifyHistoricalAppendOnly() {
  const problems = [];
  const raw = git([
    'log',
    '--since=' + FINDING_APPEND_ONLY_EFFECTIVE_AT_UTC,
    '--format=',
    '--raw',
    '--no-abbrev',
    '--full-index',
    '--no-renames',
    '--',
    'docs/biblia/.coordination/unverified-findings',
    'docs/biblia/.coordination/unverified-finding-events',
  ]);
  for (const change of parseRawHistory(raw)) {
    if (!artifactKind(change.file)) continue;
    if (change.status !== 'A') {
      problems.push(
        'finding/event histórico não é append-only: status=' + change.status + ' file=' + change.file
      );
    }
  }
  return { problems };
}

function main(argv = process.argv.slice(2)) {
  const incremental = verify(parseBase(argv));
  const historical = verifyHistoricalAppendOnly();
  const problems = [...new Set([...(incremental.problems || []), ...(historical.problems || [])])];
  if (problems.length) {
    console.error('Unverified findings append-only: BLOCKED');
    for (const problem of problems) console.error('- ' + problem);
    process.exit(1);
  }
  console.log(
    'Unverified findings append-only: PASS'
    + (incremental.skipped ? ' — incremental base unavailable; full Git history verified' : '')
  );
}

if (require.main === module) main();

module.exports = {
  FINDING_APPEND_ONLY_EFFECTIVE_AT_UTC,
  parseRawHistory,
  parseBase,
  artifactKind,
  addedArtifactProblems,
  verify,
  verifyHistoricalAppendOnly,
};
