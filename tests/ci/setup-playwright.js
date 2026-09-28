'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const testsRoot = path.resolve(__dirname, '..');
const playwrightCli = path.join(testsRoot, 'node_modules', 'playwright', 'cli.js');

if (!fs.existsSync(playwrightCli)) {
  console.error('[Playwright Setup] Dependências npm ausentes. Execute npm ci antes deste comando.');
  process.exit(1);
}

const args = [playwrightCli, 'install', 'chromium'];

if (process.platform === 'linux') {
  // Mantém a mesma preparação usada pela CI: bibliotecas do Chromium + Xvfb,
  // sem baixar o headless shell redundante.
  args.push('--with-deps', '--no-shell');
}

console.log(
  '[Playwright Setup] Plataforma=' + process.platform +
  ' | Chromium' + (process.platform === 'linux' ? ' + dependências Linux/Xvfb' : '')
);

const result = spawnSync(process.execPath, args, {
  cwd: testsRoot,
  env: process.env,
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  console.error('[Playwright Setup] Falha ao iniciar Playwright: ' + result.error.message);
  process.exit(1);
}

process.exit(result.status == null ? 1 : result.status);
