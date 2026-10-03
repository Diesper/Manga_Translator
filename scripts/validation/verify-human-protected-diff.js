'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const life = require('../bible/core/lifecycle-core');
const humanGate = require('../bible/core/human-gate');
const completion = require('../bible/core/completion');
const completedAccess = require('../bible/core/completed-access');

const root = path.resolve(__dirname, '../..');

function git(args) {
  return childProcess.execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function baseArg(argv) {
  const i = argv.indexOf('--base');
  return i >= 0 ? argv[i + 1] : null;
}

function baseState(base, index) {
  const rel = 'docs/biblia/.state/' + String(index).padStart(3, '0') + '.json';
  try {
    return JSON.parse(git(['show', base + ':' + rel]));
  } catch (_) {
    return null;
  }
}

function currentStates() {
  const dir = path.join(root, 'docs', 'biblia', '.state');
  return fs.readdirSync(dir)
    .filter((name) => /^\d{3}\.json$/.test(name))
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
}

function protectedPaths(state) {
  const index = String(state.index).padStart(3, '0');
  const paths = new Set([
    state.file,
    state.bible,
    'docs/biblia/.state/' + index + '.json',
    'docs/biblia/.reservas/' + state.file + '.lock.md',
  ]);
  for (const file of state.production_files || []) paths.add(file);
  for (const request of state.audit_requests || []) {
    if (typeof request?.target_file === 'string' && request.target_file) paths.add(request.target_file);
  }
  return paths;
}

function humanAuditControlPath(index, pathValue) {
  const n = String(index).padStart(3, '0');
  return pathValue === 'docs/biblia/.coordination/audit-claims/' + n + '.lock.md'
    || new RegExp('^docs/biblia/\\.coordination/audit-leases/(?:primary|adversarial|reaudit)/' + n + '\\.lock\\.md$').test(pathValue)
    || pathValue.startsWith('docs/biblia/.coordination/audit-results/' + n + '/');
}

function addedHistory(before, current) {
  const oldLen = Array.isArray(before?.history) ? before.history.length : 0;
  return (Array.isArray(current?.history) ? current.history : []).slice(oldLen);
}

function humanCorrectionAuthorized(before, current) {
  const added = addedHistory(before, current);
  const startedNow = added.some((entry) => entry?.type === 'HUMAN_APPROVAL_CONSUMED')
    && added.some((entry) => entry?.type === 'HUMAN_AUTHORIZED_CORRECTION_STARTED');
  if (startedNow) return true;

  if (!life.activeHumanAuthorizedCorrection(before)) return false;
  if (completion.reviewStatus(current) === 'IN_PROGRESS' && current?.agent === before?.agent) return true;

  return added.some((entry) => (
    entry?.type === life.HANDOFF_EVENT
    && entry?.agent === before?.agent
  ));
}

function problemsForHumanDiff(before, current, changed, approvals = [], options = {}) {
  const beforeLife = life.lifecycleSnapshot(before);
  if (completion.hasCompleted(before) && before.completion?.human_order_required_since_utc) {
    const exact = protectedPaths(before);
    const touched = changed.filter(file => exact.has(file) || humanAuditControlPath(before.index, file));
    if (touched.length && !completedAccess.orderFor(before, approvals, options.atUtc || current.updated_at_utc)
      && !completedAccess.orderFor(current, approvals, options.atUtc || current.updated_at_utc, {allowClosed:true})) {
      return ['#' + before.index + ': COMPLETED exige ordem humana direta para alteração/auditoria: ' + touched.join(', ')];
    }
  }
  if (!beforeLife.human_locked) return [];

  const exact = protectedPaths(before);
  const touched = changed.filter((candidate) => (
    exact.has(candidate) || humanAuditControlPath(before.index, candidate)
  ));
  if (!touched.length) return [];

  const label = '#' + String(current.index).padStart(3, '0');
  const auditControl = touched.filter((candidate) => humanAuditControlPath(before.index, candidate));
  const correctionTouched = touched.filter((candidate) => !humanAuditControlPath(before.index, candidate));
  if (auditControl.length) {
    const approval = humanGate.activeHumanApproval(
      before,
      beforeLife,
      approvals,
      'ALLOW_AUDIT_ONLY'
    );
    if (!approval) {
      return [
        label + ': HUMAN não permite lease/resultado de auditoria sem ALLOW_AUDIT_ONLY válido: '
          + auditControl.join(', '),
      ];
    }
  }

  if (correctionTouched.length && !humanCorrectionAuthorized(before, current)) {
    return [
      label + ': HUMAN protegido alterado sem correction approval one-shot ativa: ' + correctionTouched.join(', '),
    ];
  }
  return [];
}

function main(argv = process.argv.slice(2)) {
  const base = baseArg(argv);
  if (!base || /^0+$/.test(base)) {
    console.log('Human protected diff: SKIP — base SHA indisponível');
    return;
  }

  let changed;
  try {
    changed = git(['diff', '--name-only', base + '..HEAD'])
      .split(/\r?\n/)
      .filter(Boolean)
      .map((value) => value.replace(/\\/g, '/'));
  } catch (_) {
    throw new Error('base inválida');
  }

  const approvalLoad = humanGate.loadHumanApprovals(root);
  if (approvalLoad.problems.length) {
    throw new Error('aprovações humanas inválidas: ' + approvalLoad.problems.join('; '));
  }

  const problems = [];
  for (const current of currentStates()) {
    const before = baseState(base, current.index);
    if (!before) continue;
    problems.push(...problemsForHumanDiff(before, current, changed, approvalLoad.approvals, {atUtc:git(['show','-s','--format=%cI','HEAD'])}));
  }

  if (problems.length) {
    console.error('Human protected diff: BLOCKED');
    for (const problem of problems) console.error('- ' + problem);
    process.exitCode = 1;
    return;
  }
  console.log('Human protected diff: PASS');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Human protected diff: ERROR — ' + error.message);
    process.exit(1);
  }
}

module.exports = {
  baseArg,
  protectedPaths,
  humanAuditControlPath,
  addedHistory,
  humanCorrectionAuthorized,
  problemsForHumanDiff,
  main,
};
