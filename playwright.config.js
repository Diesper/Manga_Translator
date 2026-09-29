const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const isCi = !!process.env.CI;
const isShardRun = process.env.MANGA_E2E_SHARD === '1';
const requestedWorkers = Number(process.env.MANGA_E2E_WORKERS || 1);
const ciWorkers = Number.isFinite(requestedWorkers) && requestedWorkers > 0
  ? Math.floor(requestedWorkers)
  : 1;
const requestedRetries = Number(process.env.MANGA_E2E_RETRIES || 0);
const localRetries = Number.isFinite(requestedRetries) && requestedRetries >= 0
  ? Math.floor(requestedRetries)
  : 0;

module.exports = defineConfig({
  testDir: './tests/e2e',
  outputDir: './tests/test-results',
  timeout: 60000,
  fullyParallel: true,
  workers: isCi ? ciWorkers : undefined,
  retries: isCi ? 0 : localRetries,
  forbidOnly: isCi,
  reporter: isCi
    ? (isShardRun
      ? [['line'], ['blob']]
      : [['line'], ['./scripts/ci/playwright-gate-reporter.js']])
    : [['list']],
  use: {
    channel: 'chromium',
    launchOptions: {
      args: [
        '--headless=new',
        `--disable-extensions-except=${path.join(__dirname, 'extension')}`,
        `--load-extension=${path.join(__dirname, 'extension')}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    },
    headless: false,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'extension-tests',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `"${process.execPath}" "${path.join(__dirname, 'tests/fixtures/gemini-mock-server.js')}"`,
    port: 3999,
    reuseExistingServer: true,
  },
});
