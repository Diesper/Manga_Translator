'use strict';

const fs = require('fs');
const path = require('path');
const findings = require('./unverified-findings');
const events = require('./unverified-finding-events');

const root = path.resolve(__dirname, '../../..');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--id') args.id = String(argv[++i] || '');
    else if (arg === '--action') args.action = String(argv[++i] || '').toUpperCase();
    else if (arg === '--actor') args.actor = String(argv[++i] || '');
    else if (arg === '--auditor') args.auditor = String(argv[++i] || '');
    else if (arg === '--at') args.at_utc = String(argv[++i] || '');
    else if (arg === '--audit-result') args.audit_result_path = String(argv[++i] || '');
    else if (arg === '--replacement-finding') args.replacement_finding_id = String(argv[++i] || '');
    else if (arg === '--reason') args.reason = String(argv[++i] || '');
    else throw new Error('argumento desconhecido: ' + arg);
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.id) throw new Error('--id obrigatório');
  if (!args.action) throw new Error('--action obrigatório');
  if (['PRIMARY_CONFIRM','ADVERSARIAL_CONFIRM','REAUDIT_CONFIRM','REJECT'].includes(args.action)) {
    throw new Error('AUDIT_BOUND_FINDING_TRANSITION_REQUIRES_AUDIT_RESULT_PUBLISHER');
  }
  if (!args.actor && !args.auditor) throw new Error('--actor ou --auditor obrigatório');
  if (!Number.isFinite(Date.parse(args.at_utc || ''))) throw new Error('--at inválido');

  const loaded = findings.loadUnverifiedFindings(root);
  if (loaded.problems.length) throw new Error('finding store inválido: ' + loaded.problems.join('; '));
  const finding = loaded.findings.find((item) => item.id === args.id);
  if (!finding) throw new Error('FINDING_NOT_FOUND:' + args.id);

  const event = events.buildEvent(root, finding, args, loaded.findings);
  const dir = path.join(
    root,
    'docs',
    'biblia',
    '.coordination',
    'unverified-finding-events',
    String(finding.index).padStart(3, '0'),
    finding.id
  );
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, event.event_id + '.json');
  fs.writeFileSync(out, JSON.stringify(event, null, 2) + '\n', { flag: 'wx' });
  console.log(path.relative(root, out).replace(/\\/g, '/'));
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error('Unverified finding transition: ERROR — ' + error.message);
    process.exit(1);
  }
}

module.exports = { parseArgs };
