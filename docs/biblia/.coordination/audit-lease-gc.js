'use strict';

const fs = require('fs');
const path = require('path');
const {
  loadModel,
  parseClaimField,
} = require('./audit-protocol');

const repoRoot = path.resolve(__dirname, '../../..');

function slash(value) {
  return String(value || '').replace(/\\/g, '/');
}

function phaseFromLeasePath(rel) {
  const m = /\/audit-leases\/(primary|adversarial|reaudit)\//i.exec(rel);
  return m ? m[1].toUpperCase() : 'PRIMARY';
}

function resultFor(model, index, phase, auditor, sourceSha, bibleSha) {
  return model.results
    .filter((record) => (
      record.index === index
      && record.phase === phase
      && record.auditor === auditor
      && record.source_sha === sourceSha
      && (!bibleSha || !record.bible_sha || record.bible_sha === bibleSha)
    ))
    .sort((a, b) => a.completed_at_ms - b.completed_at_ms)
    .at(-1) || null;
}

function classify(model) {
  const safe = [];
  const manual = [];
  const all = [
    ...(model.active_claims_and_leases || []),
    ...(model.expired_leases || []),
  ];

  for (const rel of [...new Set(all)].sort()) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) continue;
    const source = fs.readFileSync(abs, 'utf8');
    const index = Number(parseClaimField(source, 'INDEX'));
    const auditor = parseClaimField(source, 'AUDITOR');
    const sourceSha = parseClaimField(source, 'SOURCE_SHA');
    const bibleSha = parseClaimField(source, 'BIBLE_SHA');
    const phase = phaseFromLeasePath(rel);
    const published = resultFor(model, index, phase, auditor, sourceSha, bibleSha);

    if (published) {
      safe.push({ rel, index, phase, auditor, reason: 'matching_result_published' });
      continue;
    }

    // Claims legados não têm TTL. Só os coletamos automaticamente quando
    // existe prova append-only de que o MESMO auditor concluiu trabalho em
    // outro índice depois do timestamp do claim. Isso demonstra que o claim
    // antigo foi abandonado/supersedido sem depender de timeout inventado.
    if (rel.includes('/audit-claims/')) {
      const claimedAt = parseClaimField(source, 'UPDATED_AT_UTC')
        || parseClaimField(source, 'CLAIMED_AT_UTC');
      const claimedMs = Date.parse(claimedAt || '');
      if (Number.isFinite(claimedMs) && auditor) {
        const later = (model.results || [])
          .filter((record) => (
            record.auditor === auditor
            && record.index !== index
            && Number.isFinite(record.completed_at_ms)
            && record.completed_at_ms > claimedMs
          ))
          .sort((a, b) => b.completed_at_ms - a.completed_at_ms)[0];
        if (later) {
          safe.push({
            rel,
            index,
            phase,
            auditor,
            reason: 'legacy_claim_superseded_by_later_auditor_result',
            evidence: later.path,
          });
          continue;
        }
      }
    }

    // Leases possuem TTL explícito: após expirar, ownership acabou por
    // contrato mesmo que o auditor não tenha publicado resultado. Claims
    // legados sem TTL continuam fora desta regra e exigem decisão manual.
    if (rel.includes('/audit-leases/') && (model.expired_leases || []).includes(rel)) {
      safe.push({ rel, index, phase, auditor, reason: 'lease_expired' });
      continue;
    }

    const pipeline = model.pipelines.find((item) => item.index === index);
    if (pipeline && pipeline.next_phase && pipeline.next_phase !== phase) {
      safe.push({ rel, index, phase, auditor, reason: 'phase_already_superseded' });
      continue;
    }

    manual.push({ rel, index, phase, auditor, reason: 'ownership_may_still_be_live' });
  }

  return { safe, manual };
}

function revalidateBeforeDelete(item) {
  const abs = path.join(repoRoot, item.rel);
  if (!fs.existsSync(abs)) return false;
  const before = fs.readFileSync(abs, 'utf8');
  const model = loadModel();
  const again = classify(model).safe.find((candidate) => candidate.rel === item.rel);
  if (!again) return false;
  const now = fs.readFileSync(abs, 'utf8');
  return before === now;
}

function main(argv = process.argv.slice(2)) {
  const write = argv.includes('--write-safe');
  const model = loadModel();
  const classified = classify(model);

  console.log('Audit lease GC: safe=' + classified.safe.length + ' manual=' + classified.manual.length);
  for (const item of classified.safe) console.log('SAFE ' + item.rel + ' reason=' + item.reason);
  for (const item of classified.manual) console.log('MANUAL ' + item.rel + ' reason=' + item.reason);

  if (!write) return;

  let removed = 0;
  for (const item of classified.safe) {
    if (!revalidateBeforeDelete(item)) {
      console.error('SKIP changed during revalidation: ' + item.rel);
      continue;
    }
    fs.unlinkSync(path.join(repoRoot, item.rel));
    removed += 1;
  }
  console.log('Audit lease GC: removed=' + removed);
}

if (require.main === module) main();

module.exports = {
  phaseFromLeasePath,
  resultFor,
  classify,
  revalidateBeforeDelete,
};
