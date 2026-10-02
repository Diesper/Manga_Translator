'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const events = require('./unverified-finding-events');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finding-events-'));
const finding = {
  schema_version:1,
  id:'005-UF-001',
  index:5,
  status:'UNVERIFIED',
  reported_by:'CORRETOR-1',
  reported_at_utc:'2026-10-02T06:30:00Z',
  revision_observed:{
    production_sha:null,
    test_sha:'a'.repeat(40),
    bible_sha:'b'.repeat(40),
    revision_id:'c'.repeat(64),
    audit_epoch:2,
    handoff_id:'005-e2-fixture',
  },
  title:'possible race',
  finding:'possible race',
  evidence:'fixture',
  suggested_test:'fixture',
  may_change_lifecycle:false,
};

function writeAudit(phase, auditor, at, mentions=true) {
  const rel='docs/biblia/.coordination/audit-results/005/'+phase.toLowerCase()+'/'+auditor+'.json';
  const absolute=path.join(root,rel);
  fs.mkdirSync(path.dirname(absolute),{recursive:true});
  fs.writeFileSync(absolute,JSON.stringify({
    schema_version:3,
    index:5,
    phase,
    auditor,
    source_sha:finding.revision_observed.test_sha,
    bible_sha:finding.revision_observed.bible_sha,
    verdict:'CHANGES_REQUIRED',
    findings:mentions ? ['005-UF-001 confirmed by executable evidence'] : ['other issue'],
    completed_at_utc:at,
    audit_epoch:finding.revision_observed.audit_epoch,
    handoff_id:finding.revision_observed.handoff_id,
    revision_id:finding.revision_observed.revision_id,
  },null,2)+'\n');
  return rel;
}

function writeEvent(event) {
  const rel='docs/biblia/.coordination/unverified-finding-events/005/005-UF-001/'+event.event_id+'.json';
  const absolute=path.join(root,rel);
  fs.mkdirSync(path.dirname(absolute),{recursive:true});
  fs.writeFileSync(absolute,JSON.stringify(event,null,2)+'\n');
}

const primaryPath=writeAudit('PRIMARY','AUDITOR-1','2026-10-02T06:40:00Z');
const primaryEvent=events.buildEvent(root,finding,{
  action:'PRIMARY_CONFIRM',
  actor:'AUDITOR-1',
  auditor:'AUDITOR-1',
  at_utc:'2026-10-02T06:41:00Z',
  audit_result_path:primaryPath,
  reason:'reproduced',
},[finding]);
writeEvent(primaryEvent);

let evaluated=events.loadFindingEvents(root,[finding]);
assert.deepStrictEqual(evaluated.problems,[]);
assert.strictEqual(evaluated.findings[0].status,'CONFIRMED_BY_PRIMARY');
assert.strictEqual(evaluated.findings[0].confirmed_by_primary,'AUDITOR-1');
console.log('PASS PRIMARY audit-result promotes UNVERIFIED append-only');

const afterPrimary=evaluated.findings[0];
const adversarialPath=writeAudit('ADVERSARIAL','AUDITOR-2','2026-10-02T06:50:00Z');
const adversarialEvent=events.buildEvent(root,afterPrimary,{
  action:'ADVERSARIAL_CONFIRM',
  actor:'AUDITOR-2',
  auditor:'AUDITOR-2',
  at_utc:'2026-10-02T06:51:00Z',
  audit_result_path:adversarialPath,
  reason:'independent reproduction',
},[afterPrimary]);
writeEvent(adversarialEvent);

evaluated=events.loadFindingEvents(root,[finding]);
assert.deepStrictEqual(evaluated.problems,[]);
assert.strictEqual(evaluated.findings[0].status,'CONFIRMED');
assert.strictEqual(evaluated.findings[0].confirmed_by_adversarial,'AUDITOR-2');
console.log('PASS independent ADVERSARIAL audit confirms finding');

const selfPath=writeAudit('PRIMARY','CORRETOR-1','2026-10-02T07:00:00Z');
assert.throws(()=>events.buildEvent(root,finding,{
  action:'PRIMARY_CONFIRM',
  actor:'CORRETOR-1',
  auditor:'CORRETOR-1',
  at_utc:'2026-10-02T07:01:00Z',
  audit_result_path:selfPath,
},[finding]),/reporter não pode validar/);
console.log('PASS reporter cannot self-promote finding');

const noMentionPath=writeAudit('PRIMARY','AUDITOR-3','2026-10-02T07:10:00Z',false);
assert.throws(()=>events.buildEvent(root,finding,{
  action:'PRIMARY_CONFIRM',
  actor:'AUDITOR-3',
  auditor:'AUDITOR-3',
  at_utc:'2026-10-02T07:11:00Z',
  audit_result_path:noMentionPath,
},[finding]),/deve mencionar explicitamente finding id/);
console.log('PASS unrelated audit-result cannot promote finding');

const sameAdversarialPath=writeAudit('ADVERSARIAL','AUDITOR-1','2026-10-02T07:20:00Z');
assert.throws(()=>events.buildEvent(root,afterPrimary,{
  action:'ADVERSARIAL_CONFIRM',
  actor:'AUDITOR-1',
  auditor:'AUDITOR-1',
  at_utc:'2026-10-02T07:21:00Z',
  audit_result_path:sameAdversarialPath,
},[afterPrimary]),/independente do PRIMARY/);
console.log('PASS PRIMARY auditor cannot confirm adversarial stage');

fs.rmSync(root,{recursive:true,force:true});
console.log('Unverified finding events self-test: SUCCESS');
