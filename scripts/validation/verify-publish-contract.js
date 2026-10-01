'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const publishPath = path.join(root, '.github', 'workflows', 'publish.yml');
const syncPath = path.join(root, 'scripts', 'release', 'sync-version.js');
const docsPath = path.join(root, 'docs', 'Documentação.md');
const manifestPath = path.join(root, 'extension', 'manifest.json');
const problems = [];

for (const [label, file] of [
  ['publish.yml', publishPath],
  ['sync-version.js', syncPath],
  ['Documentação.md', docsPath],
  ['extension/manifest.json', manifestPath],
]) {
  if (!fs.existsSync(file)) problems.push(label + ' ausente');
}

if (fs.existsSync(publishPath)) {
  const source = fs.readFileSync(publishPath, 'utf8');
  const required = [
    'name: Publish Manga Translator',
    'workflow_dispatch:',
    'run: npm run version:check',
    'node scripts/release/sync-version.js --print-env',
    'cp -R extension/. "dist/${RELEASE_BASENAME}/"',
    'zip -qr "${RELEASE_BASENAME}.zip" "${RELEASE_BASENAME}"',
    'cp "docs/Documentação.md" "dist/${DOC_ARTIFACT}"',
    'sha256sum "${RELEASE_BASENAME}.zip" "${DOC_ARTIFACT}" > SHA256SUMS.txt',
  ];
  for (const marker of required) {
    if (!source.includes(marker)) problems.push('publish.yml perdeu contrato: ' + marker);
  }
  const legacyPublishPaths = [
    'scripts/' + 'sync-version.js',
    'tests/' + 'package.json',
    'tests/' + 'package-lock.json',
  ];
  for (const legacy of legacyPublishPaths) {
    if (source.includes(legacy)) problems.push('publish.yml reintroduziu caminho legado: ' + legacy);
  }
  if (!/tags:\s*\n\s*-\s*["']v\*["']/.test(source)) {
    problems.push('publish.yml precisa continuar aceitando tags v*');
  }
}

if (fs.existsSync(syncPath)) {
  const syncSource = fs.readFileSync(syncPath, 'utf8');
  for (const marker of [
    "path.resolve(__dirname, '../..')",
    "path.join(root, 'package-lock.json')",
    "path.join(root, 'extension', 'manifest.json')",
    "path.join(root, 'docs', 'Documentação.md')",
  ]) {
    if (!syncSource.includes(marker)) problems.push('sync-version.js perdeu contrato: ' + marker);
  }
  for (const legacy of ["'tests', 'package.json'", "'tests', 'package-lock.json'"]) {
    if (syncSource.includes(legacy)) problems.push('sync-version.js reintroduziu workspace legado: ' + legacy);
  }
}

if (problems.length) {
  console.error('Contrato de publicação inválido:');
  for (const problem of problems) console.error('- ' + problem);
  process.exit(1);
}

console.log('Contrato de publicação validado: extensão, docs e versionamento apontam para os caminhos canônicos.');
