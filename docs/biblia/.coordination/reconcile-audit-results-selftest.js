'use strict';

const {
  projectState,
  replaceProjectionSection,
} = require('./reconcile-audit-results');

function assert(name, condition) {
  if (!condition) throw new Error(name);
  console.log('PASS ' + name);
}

const base = {
  index: 4,
  file: 'fixture.js',
  bible: 'docs/biblia/fixture.js/Bíblia.md',
  status: 'COMPLETED',
  agent: null,
  source_sha: 'a'.repeat(40),
  completed_at_utc: '2026-10-01T10:00:00Z',
  updated_at_utc: '2026-10-01T10:00:00Z',
  history: [],
  schema_version: 2,
  coordination_status: 'OK',
};

const changes = {
  index: 4,
  source_sha: base.source_sha,
  bible_sha: 'b'.repeat(40),
  decision: 'CHANGES_REQUIRED',
  primary: { verdict: 'APPROVED' },
  adversarial: { verdict: 'CHANGES_REQUIRED', completed_at_utc: '2026-10-01T11:00:00Z' },
  reaudit: { verdict: 'CHANGES_REQUIRED', completed_at_utc: '2026-10-01T12:00:00Z' },
};
let projected = projectState(base, changes);
assert('CHANGES_REQUIRED reabre lifecycle', projected.changed && projected.state.status === 'CHANGES_REQUIRED');
assert('CHANGES_REQUIRED limpa completed_at', projected.state.completed_at_utc === null);
assert('histórico registra source+bible revision', projected.state.history[0].bible_sha === 'b'.repeat(40));

const approved = {
  ...changes,
  decision: 'APPROVED',
  primary: { verdict: 'APPROVED' },
  adversarial: { verdict: 'APPROVED', completed_at_utc: '2026-10-01T13:00:00Z' },
  reaudit: null,
};
projected = projectState({ ...base, status: 'READY_FOR_AUDIT', completed_at_utc: null }, approved);
assert('APPROVED materializa COMPLETED', projected.state.status === 'COMPLETED');
assert('APPROVED usa timestamp determinístico', projected.state.completed_at_utc === '2026-10-01T13:00:00Z');

const second = projectState(projected.state, approved);
assert('projeção de state é idempotente', second.changed === false);

let guarded = projectState({ ...base, status: 'BLOCKED' }, approved);
assert('APPROVED não sobrescreve BLOCKED', guarded.blocker && guarded.state.status === 'BLOCKED');

guarded = projectState({ ...base, coordination_status: 'REPAIR_REQUIRED' }, approved);
assert('APPROVED não mascara REPAIR_REQUIRED', guarded.blocker && guarded.state.coordination_status === 'REPAIR_REQUIRED');

guarded = projectState({
  ...base,
  status: 'READY_FOR_AUDIT',
  audit_requests: [{ id: '001-001', status: 'OPEN' }],
}, approved);
assert('APPROVED não fecha item com request OPEN', guarded.blocker && guarded.state.status === 'READY_FOR_AUDIT');

const section = '<!-- DISTRIBUTED_AUDIT_PROJECTION:BEGIN -->\nnew\n<!-- DISTRIBUTED_AUDIT_PROJECTION:END -->';
const once = replaceProjectionSection('# Auditoria\n', section);
const twice = replaceProjectionSection(once, section);
assert('projeção de AUDITORIA é idempotente', once === twice);

console.log('Bible distributed reconciliation self-test: SUCCESS');
