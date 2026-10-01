'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const roots = ['extension', 'tests', 'scripts'].map((dir) => path.join(root, dir));

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
  });
}

const files = roots.flatMap(walk).sort();
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}
if (!files.length) {
  console.error('Nenhum arquivo JavaScript encontrado para validação.');
  process.exit(1);
}
if (failed) process.exit(1);
console.log('Sintaxe JS validada em ' + files.length + ' arquivo(s).');
