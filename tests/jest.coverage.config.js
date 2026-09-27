'use strict';

const path = require('path');
const base = require('./jest.config.js');

const repoRoot = path.resolve(__dirname, '..');

function remapRootToken(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/^<rootDir>\//, '<rootDir>/tests/');
}

function remapProject(project) {
  return {
    ...project,
    rootDir: repoRoot,
    testMatch: (project.testMatch || []).map(remapRootToken),
    setupFiles: (project.setupFiles || []).map(remapRootToken),
    setupFilesAfterEnv: (project.setupFilesAfterEnv || []).map(remapRootToken),
  };
}

module.exports = {
  rootDir: repoRoot,
  testEnvironment: base.testEnvironment,
  verbose: base.verbose,
  cache: true,
  cacheDirectory: '<rootDir>/tests/.jest-cache-coverage',
  // Coverage V8 adiciona overhead relevante. Os limites temporais funcionais
  // continuam sendo testados no Jest normal; aqui damos margem à instrumentação.
  testTimeout: 60000,

  projects: base.projects.map(remapProject),

  coverageProvider: 'v8',

  // Toda a arquitetura JavaScript atual entra na medição.
  collectCoverageFrom: [
    '<rootDir>/extension/**/*.js',
  ],

  coverageDirectory: '<rootDir>/tests/coverage',
  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'json-summary',
    'html',
  ],

  // Thresholds são aplicados por tests/ci/verify-coverage.js após medir o
  // baseline real. Não herdamos os 70/80% históricos antes dessa medição.
  coverageThreshold: undefined,
};
