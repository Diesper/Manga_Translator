'use strict';

module.exports = {
  rootDir: __dirname,
  testEnvironment: '<rootDir>/ci/diagnostic-node-environment.js',
  testMatch: ['<rootDir>/unit/background/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/mocks/chrome-api.mock.js'],
  testTimeout: 15000,
  verbose: false,
  cache: false,
};
