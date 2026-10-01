'use strict';

const childProcess = require('child_process');
const path = require('path');

const RESULT_ROOT = 'docs/biblia/.coordination/audit-results';

function runGit(root, args) {
  return childProcess.execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function normalizeStatus(raw) {
  const status = String(raw || '').trim();
  if (!status) return null;
  // Git may emit R100/C100 etc.
  return status[0].toUpperCase();
}

function parseNameStatusLog(source) {
  const events = [];
  let commit = null;
  for (const rawLine of String(source || '').split(/\r?\n/)) {
    if (!rawLine) continue;
    if (rawLine.startsWith('@@COMMIT ')) {
      commit = rawLine.slice('@@COMMIT '.length).trim();
      continue;
    }
    const parts = rawLine.split('\t');
    if (parts.length < 2) continue;
    const rawStatus = parts[0];
    const status = normalizeStatus(rawStatus);
    if (!status) continue;

    if (status === 'R' || status === 'C') {
      events.push({
        commit,
        status,
        raw_status: rawStatus,
        old_path: parts[1],
        path: parts[2] || null,
      });
    } else {
      events.push({
        commit,
        status,
        raw_status: rawStatus,
        path: parts[1],
      });
    }
  }
  return events;
}

function isAuditResultPath(value) {
  const p = String(value || '').replace(/\\/g, '/');
  return p === RESULT_ROOT || p.startsWith(RESULT_ROOT + '/');
}

function appendOnlyViolations(events) {
  const violations = [];
  for (const event of events || []) {
    const touchesNew = isAuditResultPath(event.path);
    const touchesOld = isAuditResultPath(event.old_path);
    if (!touchesNew && !touchesOld) continue;

    // Append-only permits only creation of a new path. Any modification,
    // deletion, rename, type change, conflict, etc. means a published result
    // ceased to be immutable.
    if (event.status !== 'A') {
      violations.push({
        commit: event.commit,
        status: event.raw_status || event.status,
        path: event.path || event.old_path,
        old_path: event.old_path || null,
      });
    }
  }
  return violations;
}

function resolveBase(root, explicitBase) {
  if (explicitBase) return explicitBase;

  const envBase = process.env.GITHUB_BASE_REF;
  const candidates = [];
  if (envBase) {
    candidates.push('origin/' + envBase, envBase);
  }
  candidates.push('origin/main', 'main');

  for (const candidate of candidates) {
    try {
      runGit(root, ['rev-parse', '--verify', candidate]);
      return candidate;
    } catch (_error) {}
  }

  try {
    return runGit(root, ['rev-parse', 'HEAD^']);
  } catch (_error) {
    throw new Error('não foi possível resolver base; use --base <ref>');
  }
}

function collectEvents(root, baseRef) {
  const mergeBase = runGit(root, ['merge-base', baseRef, 'HEAD']);
  const output = runGit(root, [
    'log',
    '--reverse',
    '--format=@@COMMIT %H',
    '--name-status',
    '--find-renames',
    mergeBase + '..HEAD',
    '--',
    RESULT_ROOT,
  ]);
  return { mergeBase, events: parseNameStatusLog(output) };
}

function parseArgs(argv) {
  let base = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base') {
      base = argv[++i];
      if (!base) throw new Error('--base exige um ref');
    } else {
      throw new Error('argumento desconhecido: ' + argv[i]);
    }
  }
  return { base };
}

function main(argv = process.argv.slice(2)) {
  const root = path.resolve(__dirname, '../../..');
  const args = parseArgs(argv);
  const baseRef = resolveBase(root, args.base);
  const { mergeBase, events } = collectEvents(root, baseRef);
  const violations = appendOnlyViolations(events);

  if (violations.length) {
    console.error('Audit results append-only: FAILED');
    console.error('base=' + baseRef + ' merge_base=' + mergeBase);
    for (const item of violations) {
      console.error(
        '- ' + (item.commit || '?')
        + ' ' + item.status
        + ' ' + (item.old_path ? item.old_path + ' -> ' : '')
        + item.path
      );
    }
    process.exit(1);
  }

  console.log(
    'Audit results append-only: SUCCESS — nenhuma modificação/deleção/rename em resultados publicados'
    + ' desde ' + mergeBase
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Audit results append-only: ERROR — ' + error.message);
    process.exit(1);
  }
}

module.exports = {
  RESULT_ROOT,
  normalizeStatus,
  parseNameStatusLog,
  isAuditResultPath,
  appendOnlyViolations,
  resolveBase,
  collectEvents,
};
