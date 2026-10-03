'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_ENFORCEMENT_BASELINE,
  verifyAppendOnly,
} = require('./verify-bible-audit-results-append-only');

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
      'resultado já publicado com outro blob é rejeitado',
      problems.some((p) => p.includes('conteúdo foi alterado')),
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
      'resultado publicado ausente no HEAD é rejeitado',
      problems.some((p) => p.includes('ausente no HEAD')),
      JSON.stringify(problems)
    );
  }

  {
    const root = makeRepo(); roots.push(root);
    const readme = path.join(root, 'docs/biblia/.coordination/audit-results/README.md');
    fs.mkdirSync(path.dirname(readme), { recursive: true });
    fs.writeFileSync(readme, '# Audit results\n');
    commit(root, 'add readme');
    fs.writeFileSync(readme, '# Audit results\n\nDocumentation may evolve.\n');
    commit(root, 'update readme');
    assert(
      'README mutável não é autoridade append-only',
      verifyAppendOnly(root).length === 0,
      JSON.stringify(verifyAppendOnly(root))
    );
  }

  {
    const root = makeRepo(); roots.push(root);
    const file = resultFile(root);
    const original = '{"verdict":"APPROVED"}\n';
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, original);
    commit(root, 'add result');
    fs.unlinkSync(file);
    commit(root, 'temporary tree loss');
    fs.writeFileSync(file, original);
    commit(root, 'restore exact result');
    const problems = verifyAppendOnly(root);
    assert(
      'deleção transitória permanece proibida mesmo após restauração byte-idêntica',
      problems.some((p) => p.includes('histórico não é append-only') && p.includes('status=D')),
      JSON.stringify(problems)
    );
  }

  {
    const root = makeRepo(); roots.push(root);
    const legacy = resultFile(root);
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, '{"verdict":"LEGACY"}\n');
    commit(root, 'legacy add');
    fs.unlinkSync(legacy);
    commit(root, 'legacy delete before policy');
    const baseline = git(root, ['rev-parse', 'HEAD']);
    const marker = path.join(root, 'policy-marker.txt');
    fs.writeFileSync(marker, 'policy active\n');
    commit(root, 'policy active');
    assert(
      'deleção legada anterior ao baseline é grandfathered',
      verifyAppendOnly(root, undefined, { baselineRef: baseline }).length === 0,
      JSON.stringify(verifyAppendOnly(root, undefined, { baselineRef: baseline }))
    );

    const post = resultFile(root);
    fs.writeFileSync(post, '{"verdict":"POST_POLICY"}\n');
    commit(root, 'post policy add');
    fs.unlinkSync(post);
    commit(root, 'post policy delete');
    const problems = verifyAppendOnly(root, undefined, { baselineRef: baseline });
    assert(
      'deleção posterior ao baseline continua proibida',
      problems.some((p) => p.includes('histórico não é append-only') && p.includes('status=D')),
      JSON.stringify(problems)
    );
  }

  console.log('Bible audit append-only self-test: SUCCESS');
} finally {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
}
