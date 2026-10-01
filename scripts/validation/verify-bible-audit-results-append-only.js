'use strict';

const childProcess = require('child_process');
const path = require('path');

const DEFAULT_RESULTS_ROOT = 'docs/biblia/.coordination/audit-results';

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

function verifyAppendOnly(root, relativeRoot = DEFAULT_RESULTS_ROOT) {
  const problems = [];
  const target = relativeRoot.replace(/\\/g, '/');

  // Resultado publicado é evento imutável. Com --no-renames, rename/copy
  // degrada para delete+add, logo o delete também é capturado.
  const history = git(root, [
    'log',
    '--format=',
    '--name-status',
    '--no-renames',
    '--diff-filter=MDT',
    '--',
    target,
  ]);

  for (const change of parseNameStatus(history)) {
    problems.push(
      'audit-result não é append-only: status=' + change.status + ' file=' + change.file
    );
  }

  // Também rejeita mutações locais ainda não commitadas quando o verificador
  // é usado por um operador antes do push.
  for (const args of [
    ['diff', '--name-status', '--no-renames', '--', target],
    ['diff', '--cached', '--name-status', '--no-renames', '--', target],
  ]) {
    const pending = git(root, args);
    for (const change of parseNameStatus(pending)) {
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
  parseNameStatus,
  verifyAppendOnly,
};
