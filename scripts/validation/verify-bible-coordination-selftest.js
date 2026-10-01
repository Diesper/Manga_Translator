'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  gitBlobSha,
  buildDerived,
  validateBibleCoordination,
  evaluateMergeReadiness,
} = require('./bible-coordination');

function write(root, rel, content) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
function statePath(i) { return 'docs/biblia/.state/' + String(i).padStart(3, '0') + '.json'; }
function sourcePath(i) { return 'fixture/file-' + String(i).padStart(3, '0') + '.js'; }
function biblePath(i) { return 'docs/biblia/' + sourcePath(i) + '/Bíblia.md'; }

function v2Bible(file, sha, source, coverage) {
  return [
    '# Bíblia técnica — ' + String.fromCharCode(96) + file + String.fromCharCode(96),
    '',
    '> **Schema da Bíblia:** 2',
    '> **Índice:** 1',
    '> **Fonte:** ' + String.fromCharCode(96) + file + String.fromCharCode(96),
    '> **SHA auditado:** ' + String.fromCharCode(96) + sha + String.fromCharCode(96),
    '> **Autoauditoria:** READY_FOR_AUDIT',
    '',
    '## Invariantes',
    '',
    'Fixture.',
    '',
    '## Lacunas',
    '',
    'SEM_PROVA_ESPECIFICA.',
    '',
    '## Fonte integral exata',
    '',
    String.fromCharCode(96).repeat(3) + 'js',
    source.endsWith('\n') ? source.slice(0, -1) : source,
    String.fromCharCode(96).repeat(3),
    '',
    coverage,
    '',
  ].join('\n');
}
function auditRow(i, file, sha, result='✅ APROVADO') {
  return '| ' + i + ' | ' + String.fromCharCode(96) + file + String.fromCharCode(96)
    + ' | SHA ' + String.fromCharCode(96) + sha + String.fromCharCode(96)
    + ' | ok | ok | ok | ' + result + ' |';
}
function makeFixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bible-validator-'));
  fs.mkdirSync(path.join(root,'docs/biblia/.coordination'),{recursive:true});
  write(root,'docs/biblia/.coordination/README.md','coordination\n');
  write(root,'docs/biblia/.reservas/README.md','reservas\n');
  const states=[];
  const rows=[];
  for(let i=1;i<=233;i+=1){
    const file=sourcePath(i);
    const source='const n = '+i+';\n';
    write(root,file,source);
    const sha=gitBlobSha(source);
    const bible=biblePath(i);
    write(root,bible,v2Bible(file,sha,source,'### Posições 1–2'));
    const state={
      schema_version:2,index:i,file,bible,source_sha:sha,status:'COMPLETED',
      coordination_status:'OK',agent:null,started_at_utc:null,updated_at_utc:null,
      completed_at_utc:null,audit_requests:[],history:[],evidence:[]
    };
    write(root,statePath(i),JSON.stringify(state,null,2)+'\n');
    states.push(state);
    rows.push(auditRow(i,file,sha));
  }
  write(root,'docs/biblia/AUDITORIA.md','# Auditoria\n\n'+rows.join('\n')+'\n');
  const audits=require('./bible-coordination').parseAuditRegistry(fs.readFileSync(path.join(root,'docs/biblia/AUDITORIA.md'),'utf8'));
  const derived=buildDerived(states,audits,'fixture');
  write(root,'docs/biblia/STATUS.md',derived.status);
  write(root,'docs/biblia/CHECKLIST.md',derived.checklist);
  return root;
}
function readJson(root,rel){return JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));}
function writeJson(root,rel,value){write(root,rel,JSON.stringify(value,null,2)+'\n');}
function lockFor(root,state,agent='AGENT-X'){
  const rel='docs/biblia/.reservas/'+state.file+'.lock.md';
  write(root,rel,[
    'AGENTE: '+agent,
    'ARQUIVO: '+state.file,
    'BÍBLIA: '+state.bible,
    'SHA_DO_FONTE_AO_RESERVAR: '+state.source_sha,
    'ESTADO: ATIVA',
    ''
  ].join('\n'));
  return rel;
}
function auditClaimFor(root,state,auditor='AUDITOR-X',overrides={}){
  const index=overrides.index ?? state.index;
  const filename=overrides.filename ?? String(index).padStart(3,'0')+'.lock.md';
  const rel='docs/biblia/.coordination/audit-claims/'+filename;
  write(root,rel,[
    'AUDITOR: '+auditor,
    'INDEX: '+index,
    'ARQUIVO: '+(overrides.file ?? state.file),
    'BIBLIA: '+(overrides.bible ?? state.bible),
    'SOURCE_SHA: '+(overrides.sourceSha ?? state.source_sha),
    'CLAIMED_AT_UTC: 2026-10-01T04:20:00Z',
    'UPDATED_AT_UTC: 2026-10-01T04:20:00Z',
    'PR: #66',
    'BRANCH: docs/project-bible',
    'ESTADO: '+(overrides.claimState ?? 'ACTIVE'),
    ''
  ].join('\n'));
  return rel;
}
function stagedAuditClaimFor(root,state,phase='PRIMARY',auditor='AUDITOR-X',overrides={}){
  const index=overrides.index ?? state.index;
  const dir=phase.toLowerCase();
  const filename=overrides.filename ?? String(index).padStart(3,'0')+'.lock.md';
  const rel='docs/biblia/.coordination/audit-claims/'+dir+'/'+filename;
  write(root,rel,[
    'AUDITOR: '+auditor,
    'PHASE: '+(overrides.declaredPhase ?? phase),
    'INDEX: '+index,
    'ARQUIVO: '+(overrides.file ?? state.file),
    'BIBLIA: '+(overrides.bible ?? state.bible),
    'SOURCE_SHA: '+(overrides.sourceSha ?? state.source_sha),
    'CLAIMED_AT_UTC: 2026-10-01T04:20:00Z',
    'UPDATED_AT_UTC: 2026-10-01T04:20:00Z',
    'LEASE_EXPIRES_AT_UTC: '+(overrides.leaseExpiresAt ?? '2099-01-01T00:00:00Z'),
    'PR: #66',
    'BRANCH: docs/project-bible',
    'ESTADO: '+(overrides.claimState ?? 'ACTIVE'),
    ''
  ].join('\n'));
  return rel;
}
function progressLockFor(root,state,auditor='AUDITOR-X'){
  const rel='docs/biblia/.coordination/PROGRESS.lock.md';
  write(root,rel,[
    'OWNER: '+auditor,
    'PURPOSE: Finalizar auditoria independente do índice '+state.index,
    'INDEX: '+state.index,
    'PR: #66',
    'BRANCH: docs/project-bible',
    'ACQUIRED_AT_UTC: 2026-10-01T04:21:00Z',
    'ESTADO: ACTIVE',
    ''
  ].join('\n'));
  return rel;
}
function validate(root,checkDerived=false,enforceSingleAuditClaimPerAuditor=false){
  return validateBibleCoordination(root,{checkDerived,enforceSingleAuditClaimPerAuditor,headLabel:'fixture'}).problems;
}
function readiness(root, options = {}) {
  const validation = validateBibleCoordination(root,{checkDerived:false,enforceSingleAuditClaimPerAuditor:true,headLabel:'fixture'});
  return evaluateMergeReadiness(validation, options);
}
function expectReadiness(name, expectedReady, setup, options = {}, needle = null) {
  const root=makeFixture();
  try {
    if (setup) setup(root);
    const result=readiness(root,options);
    if (result.ready !== expectedReady) {
      throw new Error(name+' expected ready='+expectedReady+', got '+JSON.stringify(result));
    }
    if (needle && !result.blockers.some((blocker)=>blocker.includes(needle))) {
      throw new Error(name+' expected blocker containing '+JSON.stringify(needle)+', got '+JSON.stringify(result.blockers));
    }
    process.stdout.write('PASS '+name+' -> merge-ready='+result.ready+'\n');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
}
function expectPass(name,setup){
  const root=makeFixture();
  try{
    if(setup) setup(root);
    const problems=validate(root,false);
    if(problems.length) throw new Error(name+' expected PASS, got:\n'+problems.join('\n'));
    process.stdout.write('PASS '+name+'\n');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
}
function expectFail(name,needle,setup,checkDerived=false,enforceSingleAuditClaimPerAuditor=false){
  const root=makeFixture();
  try{
    setup(root);
    const problems=validate(root,checkDerived,enforceSingleAuditClaimPerAuditor);
    if(!problems.some((p)=>p.includes(needle))){
      throw new Error(name+' expected problem containing '+JSON.stringify(needle)+', got:\n'+problems.join('\n'));
    }
    process.stdout.write('PASS '+name+' -> '+needle+'\n');
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
}

expectPass('.state/.reservas/.coordination permitidos');

function expectDerivedAuditStatus(name, auditSourceSha, currentSourceSha, auditResult, expected) {
  const state = {
    index: 65,
    file: '.github/workflows/ci.yml',
    status: 'READY_FOR_AUDIT',
    agent: null,
    source_sha: currentSourceSha,
    audit_requests: [],
  };
  const audits = new Map([[65, {
    index: 65,
    file: state.file,
    sourceSha: auditSourceSha,
    result: auditResult,
  }]]);
  const row = buildDerived([state], audits, 'fixture').status
    .split('\n')
    .find((line) => line.startsWith('| 065 |'));
  if (!row || !row.includes('| ' + expected + ' |')) {
    throw new Error(name + ' expected audit=' + expected + ', got ' + JSON.stringify(row));
  }
  process.stdout.write('PASS ' + name + ' -> ' + expected + '\n');
}
expectDerivedAuditStatus(
  'STATUS não reutiliza aprovação de SHA antigo',
  'b'.repeat(12),
  'a'.repeat(40),
  'APPROVED',
  'NOT_AUDITED'
);
expectDerivedAuditStatus(
  'STATUS preserva aprovação quando SHA auditado corresponde ao atual',
  'a'.repeat(12),
  'a'.repeat(40),
  'APPROVED',
  'APPROVED'
);

expectReadiness('merge readiness baseline passa', true);
expectReadiness('request ACCEPTED não bloqueia merge readiness', true, (root)=>{
  const s=readJson(root,statePath(1));
  s.audit_requests=[{id:'001-001',status:'ACCEPTED'}];
  writeJson(root,statePath(1),s);
});
expectReadiness('request OPEN bloqueia merge readiness', false, (root)=>{
  const s=readJson(root,statePath(1));
  s.audit_requests=[{id:'001-001',status:'OPEN'}];
  writeJson(root,statePath(1),s);
}, {}, 'audit_requests OPEN=1');
expectReadiness('state READY_FOR_AUDIT bloqueia merge readiness', false, (root)=>{
  const s=readJson(root,statePath(1));
  s.status='READY_FOR_AUDIT';
  s.completed_at_utc=null;
  writeJson(root,statePath(1),s);
}, {}, 'states não-COMPLETED=1');
expectReadiness('coordination_status REPAIR_REQUIRED bloqueia merge readiness', false, (root)=>{
  const s=readJson(root,statePath(1));
  s.coordination_status='REPAIR_REQUIRED';
  writeJson(root,statePath(1),s);
}, {}, 'coordination_status não-OK=1');
expectReadiness('reserva ativa bloqueia merge readiness', false, (root)=>{
  const s=readJson(root,statePath(1));
  s.status='IN_PROGRESS';
  s.agent='AGENT-X';
  writeJson(root,statePath(1),s);
  lockFor(root,s,'AGENT-X');
}, {}, 'reservas ativas=1');
expectReadiness('audit claim ativo bloqueia merge readiness', false, (root)=>{
  const s=readJson(root,statePath(1));
  s.status='READY_FOR_AUDIT';
  s.completed_at_utc=null;
  writeJson(root,statePath(1),s);
  auditClaimFor(root,s,'AUDITOR-X');
}, {}, 'audit claims ativos=1');
expectReadiness('PROGRESS lock residual bloqueia merge readiness', false, null, {progressLockActive:true}, 'PROGRESS.lock.md ainda está ativo');
expectReadiness('BOOTSTRAP lock residual bloqueia merge readiness', false, null, {bootstrapLockActive:true}, 'BOOTSTRAP.lock.md ainda está ativo');
expectPass('lifecycle de audit_request é canônico no state; status textual da Bíblia é informativo',(root)=>{
  const s=readJson(root,statePath(1));
  s.audit_requests=[{id:'001-001',status:'ACCEPTED'}];
  writeJson(root,statePath(1),s);
  const bible=fs.readFileSync(path.join(root,s.bible),'utf8')+'\n### 001-001 — TEST_REQUIRED — OPEN\n';
  write(root,s.bible,bible);
});

expectFail('state ausente','quantidade de states deve ser 233',(root)=>fs.unlinkSync(path.join(root,statePath(1))));
expectFail('Bible ausente','Bible ausente',(root)=>fs.unlinkSync(path.join(root,biblePath(1))));
expectFail('source ausente','source ausente',(root)=>fs.unlinkSync(path.join(root,sourcePath(1))));
expectFail('índice duplicado','índice duplicado',(root)=>{const s=readJson(root,statePath(2));s.index=1;writeJson(root,statePath(2),s);});
expectFail('path divergente','bible path divergente',(root)=>{const s=readJson(root,statePath(1));s.bible='docs/biblia/errada/Bíblia.md';writeJson(root,statePath(1),s);});

expectFail('lock de COMPLETED','COMPLETED com lock proibido',(root)=>{const s=readJson(root,statePath(1));lockFor(root,s);});
expectFail('IN_PROGRESS sem lock','IN_PROGRESS sem lock',(root)=>{const s=readJson(root,statePath(1));s.status='IN_PROGRESS';s.agent='AGENT-X';writeJson(root,statePath(1),s);});
expectFail('dois locks para agente','agente possui >1 lock ativo',(root)=>{
  for(const i of [1,2]){const s=readJson(root,statePath(i));s.status='IN_PROGRESS';s.agent='AGENT-X';writeJson(root,statePath(i),s);lockFor(root,s);}
});
expectFail('lock de outro arquivo não satisfaz ownership','lock não satisfaz ownership',(root)=>{
  const s=readJson(root,statePath(1));s.status='IN_PROGRESS';s.agent='AGENT-X';writeJson(root,statePath(1),s);lockFor(root,s,'AGENT-Y');
});

expectPass('audit claim legado PRIMARY em READY_FOR_AUDIT passa',(root)=>{
  const s=readJson(root,statePath(1));s.status='READY_FOR_AUDIT';s.completed_at_utc=null;writeJson(root,statePath(1),s);auditClaimFor(root,s);
});
expectFail('audit claim legado PRIMARY em COMPLETED falha','audit claim PRIMARY incompatível com status',(root)=>{
  const s=readJson(root,statePath(1));auditClaimFor(root,s);
});
expectPass('claim PRIMARY particionado em READY_FOR_AUDIT passa',(root)=>{
  const s=readJson(root,statePath(1));s.status='READY_FOR_AUDIT';s.completed_at_utc=null;writeJson(root,statePath(1),s);stagedAuditClaimFor(root,s,'PRIMARY');
});
expectPass('claim ADVERSARIAL pode revisar COMPLETED legado',(root)=>{
  const s=readJson(root,statePath(1));stagedAuditClaimFor(root,s,'ADVERSARIAL','AUDITOR-Y');
});
expectFail('claim PRIMARY particionado não aceita COMPLETED','audit claim PRIMARY incompatível com status',(root)=>{
  const s=readJson(root,statePath(1));stagedAuditClaimFor(root,s,'PRIMARY');
});
expectFail('claim particionado exige lease válido','audit claim LEASE_EXPIRES_AT_UTC inválido/ausente',(root)=>{
  const s=readJson(root,statePath(1));s.status='READY_FOR_AUDIT';s.completed_at_utc=null;writeJson(root,statePath(1),s);stagedAuditClaimFor(root,s,'PRIMARY','AUDITOR-X',{leaseExpiresAt:''});
});
expectFail('claim particionado rejeita PHASE divergente','audit claim PHASE diverge do path',(root)=>{
  const s=readJson(root,statePath(1));s.status='READY_FOR_AUDIT';s.completed_at_utc=null;writeJson(root,statePath(1),s);stagedAuditClaimFor(root,s,'PRIMARY','AUDITOR-X',{declaredPhase:'ADVERSARIAL'});
});

expectPass('modo ativo tolera auditor com dois claims transitórios',(root)=>{
  for(const i of [1,2]){
    const s=readJson(root,statePath(i));s.status='READY_FOR_AUDIT';s.completed_at_utc=null;writeJson(root,statePath(i),s);auditClaimFor(root,s,'AUDITOR-X');
  }
});
expectFail('modo estrito rejeita auditor com dois claims','auditor possui >1 audit claim ativo',(root)=>{
  for(const i of [1,2]){
    const s=readJson(root,statePath(i));s.status='READY_FOR_AUDIT';s.completed_at_utc=null;writeJson(root,statePath(i),s);auditClaimFor(root,s,'AUDITOR-X');
  }
},false,true);
expectFail('audit claim com SHA stale falha','audit claim SOURCE_SHA diverge do state',(root)=>{
  const s=readJson(root,statePath(1));s.status='READY_FOR_AUDIT';s.completed_at_utc=null;writeJson(root,statePath(1),s);auditClaimFor(root,s,'AUDITOR-X',{sourceSha:'0'.repeat(40)});
});
expectFail('audit claim conflita com lock de edição','audit claim conflita com reserva de edição',(root)=>{
  const s=readJson(root,statePath(1));s.status='READY_FOR_AUDIT';s.completed_at_utc=null;writeJson(root,statePath(1),s);lockFor(root,s);auditClaimFor(root,s);
});
expectFail('audit claim filename/index divergente','audit claim filename/index divergente',(root)=>{
  const s=readJson(root,statePath(1));s.status='READY_FOR_AUDIT';s.completed_at_utc=null;writeJson(root,statePath(1),s);auditClaimFor(root,s,'AUDITOR-X',{filename:'002.lock.md'});
});

expectPass('SHA correto passa');
expectFail('SHA stale falha','SHA stale',(root)=>{const s=readJson(root,statePath(1));s.source_sha='0'.repeat(40);writeJson(root,statePath(1),s);});
expectPass('fonte integral exata passa');
expectFail('fonte realmente divergente falha','fonte integral realmente divergente',(root)=>{
  const p=biblePath(1);const src=fs.readFileSync(path.join(root,p),'utf8').replace('const n = 1;','const n = 999;');write(root,p,src);
});

expectPass('coverage V2 por intervalos passa');
expectPass('coverage em tabela legada passa',(root)=>{
  const s=readJson(root,statePath(1));const source=fs.readFileSync(path.join(root,s.file),'utf8');
  const bible=v2Bible(s.file,s.source_sha,source,'## Mapa integral\n\n| Linhas | Papel |\n|---:|---|\n| 1–2 | fixture |');
  write(root,s.bible,bible);
});
expectPass('coverage Linha/posição e Pos. passa',(root)=>{
  const s=readJson(root,statePath(1));const source=fs.readFileSync(path.join(root,s.file),'utf8');
  write(root,s.bible,v2Bible(s.file,s.source_sha,source,'### Linha/posição 1\nok\n\n### Pos. 2\nok'));
});
expectPass('coverage tabela com newline literal passa',(root)=>{
  const s=readJson(root,statePath(1));const source=fs.readFileSync(path.join(root,s.file),'utf8');
  write(root,s.bible,v2Bible(s.file,s.source_sha,source,'## Mapa integral\n\n| Linhas/posição | Papel |\\n|---:|---|\\n| 1–2 | fixture |'));
});
expectPass('SHA de CRLF usa bytes brutos',(root)=>{
  const s=readJson(root,statePath(1));
  const raw='const n = 1;\r\n';
  write(root,s.file,raw);
  s.source_sha=gitBlobSha(raw);
  s.status='READY_FOR_AUDIT';
  s.completed_at_utc=null;
  writeJson(root,statePath(1),s);
  write(root,s.bible,v2Bible(s.file,s.source_sha,raw,'### Posições 1–2'));
});
expectPass('coverage com heading numerado passa',(root)=>{
  const s=readJson(root,statePath(1));const source=fs.readFileSync(path.join(root,s.file),'utf8');
  write(root,s.bible,v2Bible(s.file,s.source_sha,source,'### 1. Linhas 1–2 — fixture'));
});
expectPass('coverage V1 passa',(root)=>{
  const s=readJson(root,statePath(1));const source=fs.readFileSync(path.join(root,s.file),'utf8');
  write(root,s.bible,v2Bible(s.file,s.source_sha,source,'### Linha 1\nok\n\n### Linha 2\nok'));
});
expectPass('coverage Bloco linhas dentro da seção final passa',(root)=>{
  const s=readJson(root,statePath(1));const source=fs.readFileSync(path.join(root,s.file),'utf8');
  const coverage='### Linhas 90–99 — referência fora do mapa\n\n## Cobertura documental por faixas contíguas\n\n### Bloco 01 — linhas 1–2\nfixture';
  write(root,s.bible,v2Bible(s.file,s.source_sha,source,coverage));
});
expectPass('gaps somente de linhas vazias são estruturais',(root)=>{
  const s=readJson(root,statePath(1));
  const source='const a = 1;\n\nconst b = 2;\n';
  write(root,s.file,source);
  s.source_sha=gitBlobSha(source);
  s.status='READY_FOR_AUDIT';
  s.completed_at_utc=null;
  writeJson(root,statePath(1),s);
  const coverage='## Mapa integral por faixas\n\n| Linhas | Papel |\n|---:|---|\n| 1 | a |\n| 3 | b |\n| posição 4 | newline |';
  write(root,s.bible,v2Bible(s.file,s.source_sha,source,coverage));
});
expectFail('gap falha','gap de cobertura',(root)=>{
  const s=readJson(root,statePath(1));const source=fs.readFileSync(path.join(root,s.file),'utf8');
  write(root,s.bible,v2Bible(s.file,s.source_sha,source,'### Posição 2'));
});
expectFail('overlap falha','overlap de cobertura',(root)=>{
  const s=readJson(root,statePath(1));const source=fs.readFileSync(path.join(root,s.file),'utf8');
  write(root,s.bible,v2Bible(s.file,s.source_sha,source,'## Mapa integral\n\n| Linhas | Papel |\n|---:|---|\n| 1–2 | base |\n| 2 | duplicada |'));
});
expectFail('range fora do fonte falha','faixa fora do fonte',(root)=>{
  const s=readJson(root,statePath(1));const source=fs.readFileSync(path.join(root,s.file),'utf8');
  write(root,s.bible,v2Bible(s.file,s.source_sha,source,'### Posições 1–3'));
});

expectFail('CHECKLIST derivado divergente','CHECKLIST.md derivado divergente',(root)=>{
  write(root,'docs/biblia/CHECKLIST.md','# stale\n');
},true);
expectFail('STATUS derivado divergente','STATUS.md derivado divergente',(root)=>{
  write(root,'docs/biblia/STATUS.md','# stale\n');
},true);

expectFail('COMPLETED sem auditoria aprovada','COMPLETED sem auditoria APPROVED',(root)=>{
  const audit=fs.readFileSync(path.join(root,'docs/biblia/AUDITORIA.md'),'utf8').split('\n').filter((line)=>!line.startsWith('| 1 | ')).join('\n');
  write(root,'docs/biblia/AUDITORIA.md',audit);
});
expectFail('auditoria aprovada de outro SHA','COMPLETED sem auditoria APPROVED',(root)=>{
  let audit=fs.readFileSync(path.join(root,'docs/biblia/AUDITORIA.md'),'utf8');
  const s=readJson(root,statePath(1));
  audit=audit.replace(auditRow(1,s.file,s.source_sha),auditRow(1,s.file,'f'.repeat(40)));
  write(root,'docs/biblia/AUDITORIA.md',audit);
});

process.stdout.write('Bible coordination validator self-test: SUCCESS\n');
