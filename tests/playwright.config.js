const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

/**
 * playwright.config.js — MangaTranslator v3.2
 *
 * POSIÇÃO: tests/playwright.config.js
 *
 * CORREÇÃO APLICADA:
 * Original: webServer.command usava process.cwd() + "/tests/e2e/fixtures/..."
 * → Se executado de dentro de tests/, process.cwd() = tests/, portanto
 *   o caminho resultante seria "tests/tests/e2e/fixtures/..." ← ERRADO.
 * Corrigido: usa path.join(__dirname, 'e2e/fixtures/...') que é sempre
 * relativo ao diretório DESTE arquivo (tests/), independente do cwd. ✓
 */
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
    testDir: './e2e',
    outputDir: './test-results',
    timeout: 60000, // 60s por teste E2E (operações de UI são lentas)
    // Distribuição em nível de teste permite sharding equilibrado mesmo quando
    // muitos cenários vivem no mesmo arquivo. Suites que compartilham contexto
    // declaram mode: 'serial' explicitamente.
    fullyParallel: true,
    workers: isCi ? ciWorkers : undefined,
    // O gate do PR47 rejeita flaky/retry. Em CI, repetir só desperdiçaria tempo.
    retries: isCi ? 0 : localRetries,
    forbidOnly: isCi,
    // Cada shard grava um blob. O inventário completo (>=21, 0 skip/flaky/fail)
    // é validado somente depois do merge dos blobs.
    reporter: isCi
        ? (isShardRun
            ? [['line'], ['blob']]
            : [['line'], ['./ci/playwright-gate-reporter.js']])
        : [['list']],

    use: {
        // Carrega a extensão real do Chrome
        // CRÍTICO: Playwright suporta extensões apenas com chromium
        channel: 'chromium',

        launchOptions: {
            args: [
                '--headless=new', // BROWSER FANTASMA REAL: Roda extensões 100% invisível
                `--disable-extensions-except=${path.join(__dirname, '../extension')}`,
                `--load-extension=${path.join(__dirname, '../extension')}`,
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        },

        // Sem headless puro nativo — extensões Chrome não funcionam no modo antigo
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

    // Servidor local para servir a página de mangá fake
    webServer: {
        command: `"${process.execPath}" "${path.join(__dirname, 'e2e/fixtures/gemini-mock-server.js')}"`,
        port: 3999,
        reuseExistingServer: true,
    },
});
