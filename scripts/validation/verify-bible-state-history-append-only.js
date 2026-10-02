'use strict';

const childProcess = require('child_process');
const fs = require('fs');
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

function historyAppendOnlyProblems(before, current) {
  const problems = [];
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

function main(argv = process.argv.slice(2)) {
  const result = verify(parseBase(argv));
  if (result.skipped) {
    console.log('State history append-only: SKIP — base SHA indisponível');
    return;
  }
  if (result.problems.length) {
    console.error('State history append-only: BLOCKED');
    for (const problem of result.problems) console.error('- ' + problem);
    process.exit(1);
  }
  console.log('State history append-only: PASS');
}

if (require.main === module) main();

module.exports = {
  parseBase,
  stableJson,
  historyAppendOnlyProblems,
  verify,
};
