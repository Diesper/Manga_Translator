'use strict';

const fs = require('fs');
const path = require('path');
const life = require('../../docs/biblia/.coordination/lifecycle-core');

const root = path.resolve(__dirname, '../..');

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, rank))];
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function historyOf(state) {
  return Array.isArray(state?.history) ? state.history : [];
}

function agentsForState(state) {
  const out = new Set();
  for (const entry of historyOf(state)) {
    for (const key of ['agent', 'actor', 'auditor', 'approved_by']) {
      const value = String(entry?.[key] || '').trim();
      if (value) out.add(value);
    }
    for (const key of ['primary_auditor', 'adversarial_auditor', 'reaudit_auditor']) {
      const value = String(entry?.[key] || '').trim();
      if (value) out.add(value);
    }
  }
  return out;
}

function handoffDecisionDurationsMinutes(state) {
  const history = historyOf(state);
  const durations = [];
  for (let i = 0; i < history.length; i += 1) {
    const handoff = history[i];
    if (handoff?.type !== life.HANDOFF_EVENT) continue;
    const handoffMs = Date.parse(handoff.at_utc || '');
    if (!Number.isFinite(handoffMs)) continue;
    const decision = history.slice(i + 1).find((entry) => (
      entry?.type === 'DISTRIBUTED_AUDIT_DECISION'
      && Number.isFinite(Date.parse(entry?.at_utc || ''))
    ));
    if (!decision) continue;
    const delta = Date.parse(decision.at_utc) - handoffMs;
    if (delta >= 0) durations.push(delta / 60000);
  }
  return durations;
}

function correctionStartCount(state) {
  return historyOf(state).filter((entry) => (
    entry?.to_status === 'IN_PROGRESS'
    || entry?.type === 'EDITOR_CORRECTION_STARTED'
    || entry?.type === 'HUMAN_AUTHORIZED_CORRECTION_STARTED'
  )).length;
}

function buildMetrics(states) {
  const snapshots = states.map((state) => ({ state, lifecycle: life.lifecycleSnapshot(state) }));
  const cycles = snapshots.map((item) => item.lifecycle.lifetime_correction_cycles);
  const currentCycles = snapshots.map((item) => item.lifecycle.current_escalation_cycle);
  const auditedDurations = states.flatMap(handoffDecisionDurationsMinutes);
  const agentsPerUnit = states.map((state) => agentsForState(state).size);
  const reopened = snapshots.filter((item) => item.lifecycle.lifetime_correction_cycles >= 2).length;
  const human = snapshots.filter((item) => item.lifecycle.escalation_level === 'HUMAN').length;
  const handoffs = cycles.reduce((sum, value) => sum + value, 0);
  const correctionStarts = states.reduce((sum, state) => sum + correctionStartCount(state), 0);
  const decisions = states.reduce((sum, state) => (
    sum + historyOf(state).filter((entry) => entry?.type === 'DISTRIBUTED_AUDIT_DECISION').length
  ), 0);

  const metrics = {
    schema_version: 1,
    units: states.length,
    correction_cycles: {
      total_lifetime: handoffs,
      mean_per_unit: round(mean(cycles)),
      p90_per_unit: percentile(cycles, 90),
      max_per_unit: cycles.length ? Math.max(...cycles) : 0,
      current_mean_per_unit: round(mean(currentCycles)),
    },
    reopening: {
      units_reopened: reopened,
      percent_units_reopened: states.length ? round((reopened / states.length) * 100, 2) : 0,
    },
    human_escalation: {
      units_at_human: human,
      percent_units_at_human: states.length ? round((human / states.length) * 100, 2) : 0,
    },
    audit_latency_minutes: {
      samples: auditedDurations.length,
      mean: round(mean(auditedDurations), 2),
      p90: round(percentile(auditedDurations, 90), 2),
      max: auditedDurations.length ? round(Math.max(...auditedDurations), 2) : 0,
    },
    agents: {
      mean_distinct_agents_per_unit: round(mean(agentsPerUnit)),
      p90_distinct_agents_per_unit: percentile(agentsPerUnit, 90),
      max_distinct_agents_per_unit: agentsPerUnit.length ? Math.max(...agentsPerUnit) : 0,
    },
    ai_cost_proxy: {
      explanation: 'Proxy operacional, não valor monetário: correction starts + handoffs + distributed audit decisions.',
      correction_starts: correctionStarts,
      handoffs,
      distributed_audit_decisions: decisions,
      total_work_units: correctionStarts + handoffs + decisions,
    },
  };

  metrics.targets = {
    mean_cycles_lt_1_5: metrics.correction_cycles.mean_per_unit < 1.5,
    p90_cycles_lte_4: metrics.correction_cycles.p90_per_unit <= 4,
    human_escalation_rare: metrics.human_escalation.percent_units_at_human < 5,
  };
  return metrics;
}

function readStates() {
  const dir = path.join(root, 'docs', 'biblia', '.state');
  return fs.readdirSync(dir)
    .filter((name) => /^\d{3}\.json$/.test(name))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
}

function targetProblems(metrics) {
  const targets = metrics?.targets || {};
  const labels = {
    mean_cycles_lt_1_5: 'mean correction cycles must stay < 1.5',
    p90_cycles_lte_4: 'p90 correction cycles must stay <= 4',
    human_escalation_rare: 'HUMAN escalation must stay < 5%',
  };
  return Object.entries(targets)
    .filter(([, value]) => value !== true)
    .map(([key]) => labels[key] || key);
}

function enforceTargets(metrics) {
  const problems = targetProblems(metrics);
  if (!problems.length) return metrics;
  const error = new Error('BIBLE_LIFECYCLE_SLO_BLOCKED:' + problems.join('; '));
  error.problems = problems;
  throw error;
}

function render(metrics) {
  return [
    'Bible lifecycle metrics',
    'units=' + metrics.units,
    'mean_cycles=' + metrics.correction_cycles.mean_per_unit,
    'p90_cycles=' + metrics.correction_cycles.p90_per_unit,
    'max_cycles=' + metrics.correction_cycles.max_per_unit,
    'reopened=' + metrics.reopening.percent_units_reopened + '%',
    'human=' + metrics.human_escalation.percent_units_at_human + '%',
    'audit_latency_mean_min=' + metrics.audit_latency_minutes.mean,
    'audit_latency_p90_min=' + metrics.audit_latency_minutes.p90,
    'agents_mean=' + metrics.agents.mean_distinct_agents_per_unit,
    'ai_work_units=' + metrics.ai_cost_proxy.total_work_units,
    'target_mean_lt_1.5=' + metrics.targets.mean_cycles_lt_1_5,
    'target_p90_lte_4=' + metrics.targets.p90_cycles_lte_4,
    'target_human_rare=' + metrics.targets.human_escalation_rare,
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const metrics = buildMetrics(readStates());
  if (argv.includes('--json')) {
    process.stdout.write(JSON.stringify(metrics, null, 2) + '\n');
  } else {
    console.log(render(metrics));
  }
  if (argv.includes('--check')) {
    const problems = targetProblems(metrics);
    if (problems.length) {
      console.error('Bible lifecycle SLO gate: BLOCKED');
      for (const problem of problems) console.error('- ' + problem);
      process.exitCode = 1;
      return;
    }
    console.log('Bible lifecycle SLO gate: PASS');
  }
}

if (require.main === module) main();

module.exports = {
  mean,
  percentile,
  agentsForState,
  handoffDecisionDurationsMinutes,
  correctionStartCount,
  buildMetrics,
  targetProblems,
  enforceTargets,
  render,
};
