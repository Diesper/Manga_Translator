'use strict';

const fs = require('fs');
const path = require('path');

const manifestPath = path.resolve(__dirname, '../../extension/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
for (const field of ['manifest_version', 'name', 'version', 'permissions']) {
  if (!manifest[field]) {
    console.error('Falta campo obrigatório no manifest: ' + field);
    process.exit(1);
  }
}
if (manifest.manifest_version !== 3) {
  console.error('manifest_version deve ser 3');
  process.exit(1);
}
console.log('manifest.json válido: ' + manifest.name + ' v' + manifest.version);
