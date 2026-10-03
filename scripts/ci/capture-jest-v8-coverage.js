'use strict';

const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual } = require('util');

function copyTransform(transform) {
  if (!transform) return null;
  let sourceMapContent = null;
  if (transform.sourceMapPath && fs.existsSync(transform.sourceMapPath)) {
    sourceMapContent = JSON.parse(fs.readFileSync(transform.sourceMapPath, 'utf8'));
  }
  return {
    code: transform.code,
    originalCode: transform.originalCode,
    wrapperLength: transform.wrapperLength,
    sourceMapContent,
  };
}

class CaptureJestV8CoverageReporter {
  constructor() {
    this.testProfiles = [];
    this.transforms = Object.create(null);
  }

  onTestResult(_context, testResult) {
    if (!Array.isArray(testResult.v8Coverage)) return;
    const profiles = testResult.v8Coverage.map((entry) => {
      const transform = copyTransform(entry.codeTransformResult);
      if (transform) {
        const prior = this.transforms[entry.result.url];
        if (prior && !isDeepStrictEqual(prior, transform)) {
          throw new Error('Jest produziu transformações V8 divergentes para ' + entry.result.url + '.');
        }
        if (!prior) this.transforms[entry.result.url] = transform;
      }
      return entry.result;
    });
    this.testProfiles.push({
      testFile: testResult.testFilePath,
      profiles,
    });
  }

  onRunComplete() {
    const output = process.env.COVERAGE_V8_PROFILE_OUTPUT;
    if (!output) throw new Error('COVERAGE_V8_PROFILE_OUTPUT não foi definido.');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify({
      schemaVersion: 1,
      nodeVersion: process.version,
      v8Version: process.versions.v8,
      testProfiles: this.testProfiles,
      transforms: this.transforms,
    }) + '\n');
  }
}

module.exports = CaptureJestV8CoverageReporter;
