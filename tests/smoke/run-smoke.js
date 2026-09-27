// Roda todos os testes de fumaça em sequência e resume o resultado.
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const baseline = require('../ci/test-baseline.json');

const files = fs.readdirSync(__dirname)
    .filter(f => /^smoke-\d+.*\.js$/.test(f))
    .sort();

if (files.length < baseline.smoke.minFiles) {
    console.error(`\n❌ Smoke: apenas ${files.length} arquivo(s) descobertos; mínimo protegido: ${baseline.smoke.minFiles}.`);
    process.exit(1);
}

let failed = 0;
for (const f of files) {
    console.log(`\n=== ${f} ===`);
    const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
    if (r.error || r.status !== 0) failed++;
}

console.log(failed === 0
    ? `\n✅ ${files.length} arquivo(s), todos passaram.`
    : `\n❌ ${failed} de ${files.length} arquivo(s) com falha.`);
process.exit(failed === 0 ? 0 : 1);
