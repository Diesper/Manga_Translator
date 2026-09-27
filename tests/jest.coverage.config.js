'use strict';

const base = require('./jest.config.js');

const {
  collectCoverageFrom: _legacyCollectCoverageFrom,
  coverageDirectory: _legacyCoverageDirectory,
  coverageProvider: _legacyCoverageProvider,
  coverageReporters: _legacyCoverageReporters,
  coverageThreshold: _legacyCoverageThreshold,
  ...shared
} = base;

module.exports = {
  ...shared,
  // V8 mede código executado pelo Node sem depender apenas da transformação Babel/Istanbul.
  coverageProvider: 'v8',

  // A arquitetura atual é modular. Todo JavaScript da extensão entra no inventário;
  // exclusões futuras devem ser explícitas e tecnicamente justificadas.
  collectCoverageFrom: [
    '<rootDir>/../extension/**/*.js',
  ],

  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: [
    'text',
    'text-summary',
    'lcov',
    'json-summary',
    'html',
  ],

  // Thresholds percentuais são aplicados pelo verify-coverage.js usando o baseline
  // medido. Assim não herdamos os 70/80% antigos antes de conhecer a cobertura real.
  coverageThreshold: undefined,
};
