'use strict';

const path = require('path');
const rootDir = path.resolve(__dirname, '../../..');

module.exports = {
  rootDir,
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/docs/biblia/.coordination/load-content-script-selftest.test.js'],
  setupFilesAfterEnv: [
    '<rootDir>/tests/mocks/chrome-api.mock.js',
    '<rootDir>/tests/mocks/dom-environment.js',
  ],
  testTimeout: 15000,
  cache: false,
  transform: {},
  verbose: true,
};
