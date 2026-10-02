'use strict';

const childProcess = require('child_process');
const path = require('path');

const DEFAULT_RESULTS_ROOT = 'docs/biblia/.coordination/audit-results';
const DEFAULT_ENFORCEMENT_BASELINE = '0a27c07802c3266ccf71d550599f8769c845d747';
const ZERO_SHA = '0'.repeat(40);

function git(root, args) {
  return childProcess.execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function parseNameStatus(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^([A-Z])\s+(.+)$/.exec(line);
      return match ? { status: match[1], file: match[2] } : { status: '?', file: line };
    });
}

function isAuditResultPath(file, relativeRoot = DEFAULT_RESULTS_ROOT) {
  const normalized = String(file || '').replace(/\\/g, '/');
  const target = String(relativeRoot || '').replace(/\\/g, '/').replace(/\/$/, '');
  return normalized.startsWith(target + '/') && /\.json$/i.test(normalized);
}

function isAncestor(root, ref) {
  if (!ref) return false;
  try {
    childProcess.execFileSync('git', ['merge-base', '--is-ancestor', ref, 'HEAD'], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch (_) {
    return false;
  }
}

function parseRawHistory(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(':'))
    .map((line) => {
      const match = /^:(\d{6})\s+(\d{6})\s+([0-9a-f]{40})\s+([0-9a-f]{40})\s+([A-Z])\t(.+)$/i.exec(line);
      if (!match) return { status: '?', file: line, oldSha: null, newSha: null };
      return {
        oldMode: match[1],
        newMode: match[2],
        oldSha: match[3].toLowerCase(),
        newSha: match[4].toLowerCase(),
        status: match[5].toUpperCase(),
        file: match[6],
      };
    });
}

function verifyAppendOnly(root, relativeRoot = DEFAULT_RESULTS_ROOT, options = {}) {
  const problems = [];
  const target = relativeRoot.replace(/\\/g, '/');
  const requestedBaseline = Object.prototype.hasOwnProperty.call(options, 'baselineRef')
    ? options.baselineRef
    : DEFAULT_ENFORCEMENT_BASELINE;
  const baselineRef = isAncestor(root, requestedBaseline) ? requestedBaseline : null;

  // Regra histórica desde a ativação do controle. Evidência anterior ao
  // baseline é legado imutável: não deve bloquear para sempre uma política
  // criada depois, mas qualquer mutação posterior continua proibida.
  // Regra histórica: um resultado publicado pode aparecer em vários commits
  // (por exemplo, recuperação de árvore), mas o conteúdo versionado daquele
  // path deve ser sempre o MESMO blob. Qualquer segundo blob é mutação.
  const historyArgs = [
    'log',
    '--format=',
    '--raw',
    '--no-abbrev',
    '--full-index',
    '--no-renames',
  ];
  if (baselineRef) historyArgs.push(baselineRef + '..HEAD');
  historyArgs.push('--', target);
  const history = git(root, historyArgs);

  const blobsByPath = new Map();
  for (const change of parseRawHistory(history)) {
    if (!change.file || change.status === '?') {
      problems.push('histórico de audit-result não pôde ser interpretado: ' + change.file);
      continue;
    }
    if (!isAuditResultPath(change.file, target)) continue;
    if (change.status !== 'A') {
      problems.push(
        'audit-result histórico não é append-only: status='
        + change.status + ' file=' + change.file
      );
    }

    const set = blobsByPath.get(change.file) || new Set();
    for (const sha of [change.oldSha, change.newSha]) {
      if (sha && sha !== ZERO_SHA) set.add(sha);
    }
    blobsByPath.set(change.file, set);
  }

  const currentPaths = new Set(
    git(root, ['ls-tree', '-r', '--name-only', 'HEAD', '--', target])
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => isAuditResultPath(line, target))
  );

  for (const [file, blobs] of blobsByPath) {
    if (blobs.size > 1) {
      problems.push(
        'audit-result conteúdo foi alterado: file=' + file
        + ' blobs=' + [...blobs].sort().join(',')
      );
    }
    if (!currentPaths.has(file)) {
      problems.push('audit-result publicado está ausente no HEAD: file=' + file);
    }
  }

  // Também rejeita mutações locais ainda não commitadas quando o verificador
  // é usado por um operador antes do push. Adições novas são permitidas.
  for (const args of [
    ['diff', '--name-status', '--no-renames', '--', target],
    ['diff', '--cached', '--name-status', '--no-renames', '--', target],
  ]) {
    const pending = git(root, args);
    for (const change of parseNameStatus(pending)) {
      if (!isAuditResultPath(change.file, target)) continue;
      if (change.status !== 'A') {
        problems.push(
          'audit-result possui mutação local não append-only: status='
          + change.status + ' file=' + change.file
        );
      }
    }
  }

  return [...new Set(problems)];
}

function main() {
  const root = path.resolve(__dirname, '../..');
  const problems = verifyAppendOnly(root);
  if (problems.length) {
    console.error('Bible audit append-only: FAIL');
    for (const problem of problems) console.error(' - ' + problem);
    process.exit(1);
  }
  console.log('Bible audit append-only: SUCCESS');
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error('Bible audit append-only: ERROR — ' + error.message);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_RESULTS_ROOT,
  DEFAULT_ENFORCEMENT_BASELINE,
  ZERO_SHA,
  isAncestor,
  isAuditResultPath,
  parseNameStatus,
  parseRawHistory,
  verifyAppendOnly,
};
