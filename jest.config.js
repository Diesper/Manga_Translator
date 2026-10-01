'use strict';

const isCoverage = process.env.COVERAGE_MODE === '1';

const unitProjects = [
  {
    displayName: 'background',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/tests/unit/background/**/*.test.js'],
    setupFilesAfterEnv: ['<rootDir>/tests/mocks/chrome-api.mock.js'],
  },
  {
    displayName: 'gtc',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/tests/unit/gtc/**/*.test.js'],
  },
  {
    displayName: 'content-scripts',
    testEnvironment: 'jsdom',
    testMatch: [
      '<rootDir>/tests/unit/content-manga/**/*.test.js',
      '<rootDir>/tests/unit/content-gemini/**/*.test.js',
      '<rootDir>/tests/unit/inject/**/*.test.js',
    ],
    setupFilesAfterEnv: [
      '<rootDir>/tests/mocks/chrome-api.mock.js',
      '<rootDir>/tests/mocks/dom-environment.js',
    ],
  },
  {
    displayName: 'popup',
    testEnvironment: 'jsdom',
    testMatch: ['<rootDir>/tests/unit/popup/**/*.test.js'],
    setupFilesAfterEnv: [
      '<rootDir>/tests/mocks/chrome-api.mock.js',
      '<rootDir>/tests/mocks/dom-environment.js',
    ],
  },
  {
    displayName: 'reader',
    testEnvironment: 'jsdom',
    testMatch: ['<rootDir>/tests/unit/reader/**/*.test.js'],
    setupFilesAfterEnv: [
      '<rootDir>/tests/mocks/chrome-api.mock.js',
      '<rootDir>/tests/mocks/dom-environment.js',
    ],
  },
  {
    displayName: 'manifest',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/tests/unit/manifest/**/*.test.js'],
  },
  {
    displayName: 'shared-ui',
    testEnvironment: 'jsdom',
    testMatch: ['<rootDir>/tests/unit/shared-ui/**/*.test.js'],
    setupFilesAfterEnv: [
      '<rootDir>/tests/mocks/chrome-api.mock.js',
      '<rootDir>/tests/mocks/dom-environment.js',
    ],
  },
];

module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  verbose: true,
  cache: true,
  cacheDirectory: isCoverage ? '<rootDir>/.jest-cache-coverage' : '<rootDir>/.jest-cache',
  testTimeout: isCoverage ? 60000 : 15000,
  projects: [
    ...unitProjects,
    {
      displayName: 'integration',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      setupFilesAfterEnv: [
        '<rootDir>/tests/mocks/chrome-api.mock.js',
        '<rootDir>/tests/mocks/dom-environment.js',
      ],
    },
  ],
  ...(isCoverage ? {
    coverageProvider: 'v8',
    collectCoverageFrom: ['<rootDir>/extension/**/*.js'],
    coverageDirectory: '<rootDir>/coverage',
    coverageReporters: ['text', 'text-summary', 'lcov', 'json-summary', 'html'],
    coverageThreshold: undefined,
  } : {}),
};
