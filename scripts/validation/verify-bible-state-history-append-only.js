'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const { LIFECYCLE_POLICY_EFFECTIVE_AT_UTC, sha256 } = require('../bible/core/lifecycle-core');

const root = path.resolve(__dirname, '../..');
const completion = require('../bible/core/completion');
const ZERO_SHA = '0'.repeat(40);

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
      if (!match) return { status:'?', file:line, oldSha:null, newSha:null };
      return {
        oldSha:match[3].toLowerCase(),
        newSha:match[4].toLowerCase(),
        status:match[5].toUpperCase(),
        file:match[6].replace(/\\/g,'/'),
      };
    });
}

function stateFromBlob(sha) {
  return JSON.parse(git(['cat-file','blob',sha]));
}

function parseBase(argv) {
  const i = argv.indexOf('--base');
  return i >= 0 ? argv[i + 1] : null;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function eventPayload(entry) {
  const copy = { ...(entry || {}) };
  delete copy.previous_event_hash;
  delete copy.event_hash;
  return copy;
}

function canonicalEventHash(entry) {
  const previous = String(entry?.previous_event_hash || '');
  if (!/^[0-9a-f]{64}$/i.test(previous)) return null;
  return sha256(previous + '|' + stableJson(eventPayload(entry)));
}

function hashOnlyRepairAllowed(beforeEvent, currentEvent) {
  const beforeWithoutHash = { ...(beforeEvent || {}) };
  const currentWithoutHash = { ...(currentEvent || {}) };
  delete beforeWithoutHash.event_hash;
  delete currentWithoutHash.event_hash;
  if (stableJson(beforeWithoutHash) !== stableJson(currentWithoutHash)) return false;
  const expected = canonicalEventHash(currentEvent);
  if (!expected) return false;
  return beforeEvent?.event_hash !== expected && currentEvent?.event_hash === expected;
}

function historyAppendOnlyProblems(before, current, options = {}) {
  const problems = [];
  if (options.enforceCompletion !== false && completion.hasCompleted(before) && current?.status !== 'COMPLETED') problems.push('COMPLETED_STATUS_REGRESSION');
  if (options.enforceCompletion !== false && completion.hasCompleted(before) && before.completed_at_utc && current.completed_at_utc !== before.completed_at_utc) problems.push('FIRST_COMPLETION_TIMESTAMP_CHANGED');
  if (before.completion?.human_order_required_since_utc && current.completion?.human_order_required_since_utc !== before.completion.human_order_required_since_utc) problems.push('COMPLETED_HUMAN_FREEZE_REMOVED_OR_REDATED');
  const index = Number(current?.index ?? before?.index ?? 0);
  const label = '#' + String(index).padStart(3, '0');
  const oldHistory = Array.isArray(before?.history) ? before.history : [];
  const newHistory = Array.isArray(current?.history) ? current.history : [];

  if (newHistory.length < oldHistory.length) {
    problems.push(
      label + ': history truncado; base=' + oldHistory.length + ' atual=' + newHistory.length
    );
    return problems;
  }

  for (let i = 0; i < oldHistory.length; i += 1) {
    if (stableJson(oldHistory[i]) !== stableJson(newHistory[i])) {
      if (hashOnlyRepairAllowed(oldHistory[i], newHistory[i])) continue;
      problems.push(
        label + ': history deixou de ser append-only na posição ' + i
        + ' (evento antigo removido, alterado ou deslocado)'
      );
      break;
    }
  }
  return problems;
}

function readBaseState(base, index) {
  const rel = 'docs/biblia/.state/' + String(index).padStart(3, '0') + '.json';
  try {
    return JSON.parse(git(['show', base + ':' + rel]));
  } catch (_) {
    return null;
  }
}

function readCurrentState(index) {
  const absolute = path.join(
    root,
    'docs',
    'biblia',
    '.state',
    String(index).padStart(3, '0') + '.json'
  );
  if (!fs.existsSync(absolute)) return null;
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function verify(base) {
  if (!base || /^0+$/.test(base)) return { skipped: true, problems: [] };

  const problems = [];
  for (let index = 1; index <= 233; index += 1) {
    const before = readBaseState(base, index);
    if (!before) continue;
    const current = readCurrentState(index);
    if (!current) {
      problems.push('#' + String(index).padStart(3, '0') + ': state existente na base foi removido');
      continue;
    }
    problems.push(...historyAppendOnlyProblems(before, current));
  }

  return { skipped: false, problems };
}

function verifyRepositoryHistory() {
  const problems = [];
  const raw = git([
    'log',
    '--since=' + LIFECYCLE_POLICY_EFFECTIVE_AT_UTC,
    '--format=',
    '--raw',
    '--no-abbrev',
    '--full-index',
    '--no-renames',
    '--',
    'docs/biblia/.state',
  ]);

  for (const change of parseRawHistory(raw)) {
    if (!/^docs\/biblia\/\.state\/\d{3}\.json$/.test(change.file || '')) continue;
    if (change.status === 'A') continue;
    if (change.status !== 'M') {
      problems.push('state history histórico não é append-only: status=' + change.status + ' file=' + change.file);
      continue;
    }
    if (!change.oldSha || !change.newSha || change.oldSha === ZERO_SHA || change.newSha === ZERO_SHA) {
      problems.push('state history histórico possui blobs inválidos: ' + change.file);
      continue;
    }
    try {
      const before = stateFromBlob(change.oldSha);
      const current = stateFromBlob(change.newSha);
      for (const problem of historyAppendOnlyProblems(before, current, { enforceCompletion: Boolean(before.completion?.achieved || current.completion?.achieved) })) {
        problems.push(change.file + ': ' + problem);
      }
    } catch (error) {
      problems.push(change.file + ': não foi possível validar blobs históricos: ' + error.message);
    }
  }
  return { problems };
}

function main(argv = process.argv.slice(2)) {
  const incremental = verify(parseBase(argv));
  const historical = verifyRepositoryHistory();
  const problems = [...new Set([...(incremental.problems || []), ...(historical.problems || [])])];
  if (problems.length) {
    console.error('State history append-only: BLOCKED');
    for (const problem of problems) console.error('- ' + problem);
    process.exit(1);
  }
  console.log(
    'State history append-only: PASS'
    + (incremental.skipped ? ' — incremental base unavailable; full Git history verified' : '')
  );
}

if (require.main === module) main();

module.exports = {
  ZERO_SHA,
  parseRawHistory,
  parseBase,
  stableJson,
  canonicalEventHash,
  hashOnlyRepairAllowed,
  historyAppendOnlyProblems,
  verify,
  verifyRepositoryHistory,
};
