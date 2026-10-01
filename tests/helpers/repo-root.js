'use strict';

const fs = require('fs');
const path = require('path');

function findRepoRoot(startDir = __dirname) {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, 'extension', 'manifest.json'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(
        'Repository root not found from ' + startDir +
        ': expected extension/manifest.json in an ancestor directory.'
      );
    }
    current = parent;
  }
}

module.exports = { findRepoRoot };
