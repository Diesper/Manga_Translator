'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { verifyAppendOnly } = require('./verify-bible-audit-results-append-only');

function git(root, args) {
  return childProcess.execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function assert(name, condition, detail = '') {
  if (!condition) throw new Error(name + (detail ? ': ' + detail : ''));
  console.log('PASS ' + name);
}

function makeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bible-append-only-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'selftest@example.invalid']);
  git(root, ['config', 'user.name', 'Bible Selftest']);
  return root;
}

function commit(root, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', message]);
}

function resultFile(root) {
  return path.join(
    root,
    'docs/biblia/.coordination/audit-results/001/primary/result.json'
  );
}

const roots = [];
try {
  {
    const root = makeRepo(); roots.push(root);
    const file = resultFile(root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{"verdict":"APPROVED"}\n');
    commit(root, 'add result');
    assert(
      'resultado somente adicionado satisfaz append-only',
      verifyAppendOnly(root).length === 0
    );
  }

  {
    const root = makeRepo(); roots.push(root);
    const file = resultFile(root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{"verdict":"APPROVED"}\n');
    commit(root, 'add result');
    fs.writeFileSync(file, '{"verdict":"CHANGES_REQUIRED"}\n');
    commit(root, 'mutate result');
    const problems = verifyAppendOnly(root);
    assert(
      'resultado já publicado modificado é rejeitado',
      problems.some((p) => p.includes('status=M')),
      JSON.stringify(problems)
    );
  }

  {
    const root = makeRepo(); roots.push(root);
    const file = resultFile(root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{"verdict":"APPROVED"}\n');
    commit(root, 'add result');
    fs.unlinkSync(file);
    commit(root, 'delete result');
    const problems = verifyAppendOnly(root);
    assert(
      'resultado já publicado apagado é rejeitado',
      problems.some((p) => p.includes('status=D')),
      JSON.stringify(problems)
    );
  }

  console.log('Bible audit append-only self-test: SUCCESS');
} finally {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
}
