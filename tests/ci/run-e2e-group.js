'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const testsRoot = path.resolve(__dirname, '..');
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, 'e2e-shard-plan.json'), 'utf8'));
const groupId = String(process.argv[2] || process.env.MANGA_E2E_GROUP || '').trim();
const group = (plan.groups || []).find(item => item.id === groupId);

if (!group) {
  console.error('[E2E/GROUP] Grupo inválido: ' + (groupId || '<vazio>'));
  console.error('[E2E/GROUP] Grupos válidos: ' + (plan.groups || []).map(item => item.id).join(', '));
  process.exit(2);
}

if (!Number.isInteger(group.workers) || group.workers <= 0) {
  console.error('[E2E/GROUP] workers inválido para ' + group.id + ': ' + group.workers);
  process.exit(2);
}

console.log(
  '[E2E/GROUP] ' + group.id +
  ' | tag=' + group.tag +
  ' | expectedTests=' + group.expectedTests +
  ' | workers=' + group.workers +
  ' | estimatedSeconds=' + group.estimatedSeconds
);

const child = spawn(
  process.execPath,
  [path.join(testsRoot, 'run-e2e.js'), '--grep', group.tag],
  {
    cwd: testsRoot,
    env: {
      ...process.env,
      MANGA_E2E_GROUP: group.id,
      MANGA_E2E_SHARD: '1',
      MANGA_E2E_WORKERS: String(group.workers),
    },
    stdio: 'inherit',
    shell: false,
  }
);

child.on('error', error => {
  console.error(error);
  process.exit(1);
});
child.on('close', code => process.exit(code == null ? 1 : code));
