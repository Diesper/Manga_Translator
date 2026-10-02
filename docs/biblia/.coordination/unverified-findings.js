'use strict';

const fs = require('fs');
const path = require('path');
const lifecycle = require('./lifecycle-core');
const findingEvents = require('./unverified-finding-events');

const FINDING_STATUSES = new Set([
  'UNVERIFIED',
  'CONFIRMED_BY_PRIMARY',
  'CONFIRMED',
  'REJECTED',
  'SUPERSEDED',
  'STALE',
]);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : (entry.isFile() ? [full] : []);
  });
}

function validSha(value, length = 40) {
  const re = length === 64 ? /^[0-9a-f]{64}$/i : /^[0-9a-f]{40}$/i;
  return re.test(String(value || ''));
}

function validateFinding(raw, rel = '<memory>') {
  const problems = [];
  const index = Number(raw?.index);
  if (raw?.schema_version !== 1) problems.push(rel + ': schema_version deve ser 1');
  if (!Number.isInteger(index) || index < 1 || index > 233) problems.push(rel + ': index inválido');
  if (typeof raw?.id !== 'string' || !raw.id.trim()) problems.push(rel + ': id ausente');
  if (!FINDING_STATUSES.has(String(raw?.status || ''))) problems.push(rel + ': status inválido');
  if (typeof raw?.reported_by !== 'string' || !raw.reported_by.trim()) problems.push(rel + ': reported_by ausente');
  if (!Number.isFinite(Date.parse(raw?.reported_at_utc || ''))) problems.push(rel + ': reported_at_utc inválido');
  if (raw?.may_change_lifecycle !== false) problems.push(rel + ': may_change_lifecycle deve ser false');
  if (typeof raw?.title !== 'string' || !raw.title.trim()) problems.push(rel + ': title ausente');
  if (typeof raw?.finding !== 'string' || !raw.finding.trim()) problems.push(rel + ': finding ausente');

  const revision = raw?.revision_observed || {};
  if (revision.production_sha !== null && revision.production_sha !== undefined && !validSha(revision.production_sha)) {
    problems.push(rel + ': production_sha inválido');
  }
  if (!validSha(revision.test_sha)) problems.push(rel + ': test_sha inválido');
  if (!validSha(revision.bible_sha)) problems.push(rel + ': bible_sha inválido');
  if (!validSha(revision.revision_id, 64)) problems.push(rel + ': revision_id inválido');

  const reporter = String(raw?.reported_by || '').trim();
  if (raw?.status === 'CONFIRMED_BY_PRIMARY') {
    const primary = String(raw?.confirmed_by_primary || '').trim();
    if (!primary) problems.push(rel + ': CONFIRMED_BY_PRIMARY exige confirmed_by_primary');
    if (primary && primary === reporter) problems.push(rel + ': autor do finding não pode auto-confirmar PRIMARY');
  }
  if (raw?.status === 'CONFIRMED') {
    const primary = String(raw?.confirmed_by_primary || '').trim();
    const adversarial = String(raw?.confirmed_by_adversarial || '').trim();
    if (!primary || !adversarial) problems.push(rel + ': CONFIRMED exige PRIMARY + ADVERSARIAL');
    if (primary && primary === reporter) problems.push(rel + ': reporter não pode ser PRIMARY confirmador');
    if (adversarial && adversarial === reporter) problems.push(rel + ': reporter não pode ser ADVERSARIAL confirmador');
    if (primary && adversarial && primary === adversarial) problems.push(rel + ': confirmadores PRIMARY/ADVERSARIAL devem ser distintos');
  }
  return problems;
}

function loadUnverifiedFindings(root) {
  const base = path.join(root, 'docs', 'biblia', '.coordination', 'unverified-findings');
  const findings = [];
  const problems = [];
  const ids = new Set();
  for (const absolute of walk(base)) {
    const rel = path.relative(root, absolute).replace(/\\/g, '/');
    if (/\/README\.md$/i.test(rel)) continue;
    if (!/\.json$/i.test(rel)) {
      problems.push(rel + ': arquivo inesperado; somente JSON é permitido');
      continue;
    }
    let raw;
    try { raw = JSON.parse(fs.readFileSync(absolute, 'utf8')); }
    catch (error) {
      problems.push(rel + ': JSON inválido: ' + error.message);
      continue;
    }
    problems.push(...validateFinding(raw, rel));
    if (ids.has(raw?.id)) problems.push(rel + ': finding id duplicado: ' + raw.id);
    if (raw?.id) ids.add(raw.id);
    findings.push({ ...raw, path: rel });
  }
  const evaluated = findingEvents.loadFindingEvents(root, findings);
  return {
    findings: evaluated.findings,
    base_findings: findings,
    events: evaluated.events,
    problems: [...problems, ...evaluated.problems],
  };
}

function buildFinding(state, snapshot, input) {
  if (!state || !snapshot) throw new Error('state + lifecycle snapshot são obrigatórios');
  const now = input?.reported_at_utc;
  if (!Number.isFinite(Date.parse(now || ''))) throw new Error('reported_at_utc inválido');
  const id = String(input?.id || '').trim();
  if (!id) throw new Error('id obrigatório');
  const finding = {
    schema_version: 1,
    id,
    index: state.index,
    status: 'UNVERIFIED',
    reported_by: String(input?.reported_by || '').trim(),
    reported_at_utc: now,
    revision_observed: {
      production_sha: snapshot.production_sha,
      test_sha: snapshot.test_sha,
      bible_sha: snapshot.bible_sha,
      revision_id: snapshot.revision_id,
      audit_epoch: snapshot.audit_epoch,
      handoff_id: snapshot.handoff_id,
    },
    title: String(input?.title || '').trim(),
    finding: String(input?.finding || '').trim(),
    evidence: String(input?.evidence || '').trim(),
    suggested_test: String(input?.suggested_test || '').trim(),
    may_change_lifecycle: false,
  };
  const problems = validateFinding(finding);
  if (problems.length) throw new Error(problems.join('; '));
  return finding;
}

function parseArgs(argv) {
  const args = {};
  for (let i=0;i<argv.length;i+=1) {
    const arg=argv[i];
    if (arg === '--index') args.index=Number(argv[++i]);
    else if (arg === '--id') args.id=String(argv[++i] || '');
    else if (arg === '--reported-by') args.reported_by=String(argv[++i] || '');
    else if (arg === '--at') args.reported_at_utc=String(argv[++i] || '');
    else if (arg === '--title') args.title=String(argv[++i] || '');
    else if (arg === '--finding') args.finding=String(argv[++i] || '');
    else if (arg === '--evidence') args.evidence=String(argv[++i] || '');
    else if (arg === '--suggested-test') args.suggested_test=String(argv[++i] || '');
    else throw new Error('argumento desconhecido: ' + arg);
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args=parseArgs(argv);
  if (!Number.isInteger(args.index)) throw new Error('--index obrigatório');
  const root=path.resolve(__dirname,'../../..');
  const statePath=path.join(root,'docs','biblia','.state',String(args.index).padStart(3,'0')+'.json');
  const state=JSON.parse(fs.readFileSync(statePath,'utf8'));
  const snapshot=lifecycle.lifecycleSnapshot(state);
  const finding=buildFinding(state,snapshot,args);
  const dir=path.join(root,'docs','biblia','.coordination','unverified-findings',String(args.index).padStart(3,'0'));
  fs.mkdirSync(dir,{recursive:true});
  const out=path.join(dir,finding.id+'.json');
  fs.writeFileSync(out,JSON.stringify(finding,null,2)+'\n',{flag:'wx'});
  console.log(path.relative(root,out).replace(/\\/g,'/'));
}

if (require.main === module) {
  try { main(); }
  catch (error) { console.error('Unverified finding: ERROR — '+error.message); process.exit(1); }
}

module.exports = {
  FINDING_STATUSES,
  validateFinding,
  loadUnverifiedFindings,
  buildFinding,
};
