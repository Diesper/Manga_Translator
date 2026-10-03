'use strict';
const rank = { WAITING_PRIMARY: 0, WAITING_ADVERSARIAL: 1, REAUDIT_REQUIRED: 2 };
const byteCompare = (a,b) => Buffer.compare(Buffer.from(String(a)),Buffer.from(String(b)));
function preservedStage(state, records, decision, currentBibleSha) {
  if (!(decision in rank)) return { audit_status: decision, revision_revalidation_required: false };
  const revisions = new Map();
  for (const record of records) {
    if (record.index !== state.index) continue;
    if (record.source_sha === state.source_sha && (record.bible_sha || null) === currentBibleSha) continue;
    const key=JSON.stringify([record.source_sha,record.bible_sha,record.audit_epoch,record.handoff_id,record.revision_id]);
    if (!revisions.has(key)) revisions.set(key,new Map());
    const phases=revisions.get(key), previous=phases.get(record.phase);
    if (!previous || record.completed_at_ms > previous.completed_at_ms
      || (record.completed_at_ms === previous.completed_at_ms && byteCompare(record.path,previous.path)>0)) phases.set(record.phase,record);
  }
  let stage=decision;
  for (const phases of revisions.values()) {
    const primary=phases.get('PRIMARY'), adversarial=phases.get('ADVERSARIAL'), reaudit=phases.get('REAUDIT');
    if (!primary || primary.auditor === adversarial?.auditor) continue;
    const previous=!adversarial ? 'WAITING_ADVERSARIAL' : primary.verdict !== adversarial.verdict && !reaudit ? 'REAUDIT_REQUIRED' : null;
    if (previous && rank[previous]>rank[stage]) stage=previous;
  }
  return { audit_status: stage, revision_revalidation_required: stage!==decision };
}
module.exports={preservedStage};
