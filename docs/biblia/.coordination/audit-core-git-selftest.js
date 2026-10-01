'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  clearGitSnapshotCache,
  gitWorkingTreeBlobSha,
} = require('./audit-core');

function git(root, args, options = {}) {
  return childProcess.execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function assert(name, condition, detail = '') {
  if (!condition) throw new Error(name + (detail ? ': ' + detail : ''));
  console.log('PASS ' + name);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'manga-bible-git-selftest-'));
const rel = 'docs/biblia/fixture/Bíblia.md';
const abs = path.join(root, rel);

try {
  git(root, ['init']);
  git(root, ['config', 'user.email', 'selftest@example.invalid']);
  git(root, ['config', 'user.name', 'Bible Selftest']);

  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(path.join(root, '.gitattributes'), '*.md text eol=lf\n', 'utf8');
  fs.writeFileSync(abs, 'linha 1\nlinha 2\n', 'utf8');
  git(root, ['add', '.gitattributes', rel]);
  git(root, ['commit', '-m', 'fixture']);

  const indexSha = git(root, ['rev-parse', ':' + rel]).toLowerCase();

  clearGitSnapshotCache(root);
  assert(
    'arquivo limpo usa blob canônico do índice',
    gitWorkingTreeBlobSha(root, rel) === indexSha
  );

  // Simula working tree CRLF como pode ocorrer no Windows. Os clean filters
  // devem produzir o mesmo blob LF versionado.
  fs.writeFileSync(abs, 'linha 1\r\nlinha 2\r\n', 'utf8');
  clearGitSnapshotCache(root);
  assert(
    'CRLF equivalente mantém o mesmo BIBLE_SHA',
    gitWorkingTreeBlobSha(root, rel) === indexSha
  );

  // Alteração semântica precisa sair do fast-path do índice e gerar novo blob.
  fs.writeFileSync(abs, 'linha 1\r\nlinha 2 alterada\r\n', 'utf8');
  clearGitSnapshotCache(root);
  const changedSha = gitWorkingTreeBlobSha(root, rel);
  const expectedChanged = git(root, ['hash-object', '--path=' + rel, abs]).toLowerCase();
  assert('mudança real usa hash-object com clean filter', changedSha === expectedChanged);
  assert('mudança real invalida revisão anterior', changedSha !== indexSha);

  console.log('Audit core Git revision self-test: SUCCESS');
} finally {
  clearGitSnapshotCache(root);
  fs.rmSync(root, { recursive: true, force: true });
}
