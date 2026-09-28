'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const forwardedArgs = process.argv.slice(2);
const npmArgs = ['--prefix', 'tests', 'run', 'test:e2e'];

if (forwardedArgs.length) {
  npmArgs.push('--', ...forwardedArgs);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    console.error('[Root E2E] Falha ao iniciar ' + command + ': ' + result.error.message);
    process.exit(1);
  }

  process.exit(result.status == null ? 1 : result.status);
}

const needsVirtualDisplay =
  process.platform === 'linux' &&
  !process.env.DISPLAY &&
  !process.env.WAYLAND_DISPLAY;

if (needsVirtualDisplay) {
  const probe = spawnSync('xvfb-run', ['--help'], {
    cwd: repoRoot,
    stdio: 'ignore',
    shell: false,
  });

  if (probe.error || probe.status !== 0) {
    console.error(
      '[Root E2E] Linux sem DISPLAY detectado, mas xvfb-run não está disponível.\n' +
      '[Root E2E] Execute "npm run setup" para instalar as dependências Linux do Chromium/Playwright.'
    );
    process.exit(1);
  }

  console.log('[Root E2E] Linux sem DISPLAY: executando o runner oficial dentro de Xvfb.');
  run('xvfb-run', ['--auto-servernum', '--', npmCommand, ...npmArgs]);
}

run(npmCommand, npmArgs);
