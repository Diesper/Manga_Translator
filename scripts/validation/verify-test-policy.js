'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const problems = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() ? [full] : [];
  });
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

const testFiles = walk(path.join(root, 'tests'))
  .filter((file) => /\.(?:js|cjs|mjs)$/.test(file));

const forbiddenTestPatterns = [
  { label: '.skip', regex: /\b(?:test|it|describe)\.skip\b/ },
  { label: '.only', regex: /\b(?:test|it|describe)\.only\b/ },
  { label: 'test.todo', regex: /\btest\.todo\b/ },
];

for (const file of testFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const item of forbiddenTestPatterns) {
    if (item.regex.test(source)) {
      problems.push(rel(file) + ': uso proibido de ' + item.label);
    }
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const [name, command] of Object.entries(pkg.scripts || {})) {
  for (const token of ['--forceExit', '--passWithNoTests', '|| true']) {
    if (String(command).includes(token)) {
      problems.push('package.json#scripts.' + name + ': escape hatch proibido: ' + token);
    }
  }
}

const workflowDir = path.join(root, '.github', 'workflows');
for (const file of walk(workflowDir).filter((item) => /\.ya?ml$/i.test(item))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const token of ['--forceExit', '--passWithNoTests']) {
    if (source.includes(token)) {
      problems.push(rel(file) + ': escape hatch proibido: ' + token);
    }
  }
  if (/npm run test:[^\n]*\|\|\s*true/.test(source)) {
    problems.push(rel(file) + ': comando de teste mascarado com || true');
  }
}

const operationalJs = [
  ...walk(path.join(root, 'scripts', 'ci')),
  ...walk(path.join(root, 'scripts', 'maintenance')),
  ...walk(path.join(root, 'extension')),
].filter((file) => /\.js$/i.test(file));

for (const file of operationalJs) {
  const source = fs.readFileSync(file, 'utf8');
  for (const token of ['--forceExit', '--passWithNoTests']) {
    if (source.includes(token)) {
      problems.push(rel(file) + ': escape hatch proibido: ' + token);
    }
  }
}

if (problems.length) {
  console.error('Política de testes inválida:');
  for (const problem of problems) console.error('- ' + problem);
  process.exit(1);
}

console.log(
  'Política de testes validada: sem skip/only/todo, forceExit, passWithNoTests ou mascaramento de comandos de teste.'
);
