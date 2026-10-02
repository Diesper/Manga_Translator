'use strict';

const assert = require('assert');
const metrics = require('./bible-lifecycle-metrics');
const life = require('../../docs/biblia/.coordination/lifecycle-core');

function state(index, handoffs, options = {}) {
  const history = [];
  for (let i = 1; i <= handoffs; i += 1) {
    history.push({
      at_utc: '2026-10-01T0' + i + ':00:00Z',
      type: 'EDITOR_CORRECTION_STARTED',
      to_status: 'IN_PROGRESS',
      agent: 'A' + index + '-' + i,
    });
    history.push({
      at_utc: '2026-10-01T0' + i + ':10:00Z',
      type: life.HANDOFF_EVENT,
      agent: 'A' + index + '-' + i,
    });
    if (options.decisions !== false) {
      history.push({
        at_utc: '2026-10-01T0' + i + ':40:00Z',
        type: 'DISTRIBUTED_AUDIT_DECISION',
        decision: i === handoffs ? 'APPROVED' : 'CHANGES_REQUIRED',
        actor: 'SYSTEM',
      });
    }
  }
  return {
    index,
    status: handoffs >= 7 ? 'HUMAN_LOCKED' : 'READY_FOR_AUDIT',
    file: 'f' + index + '.js',
    bible: 'b' + index + '.md',
    source_sha: String(index).padStart(40, '0'),
    bible_sha: String(index).padStart(40, 'f'),
    history,
  };
}

assert.strictEqual(metrics.mean([1,2,3]),2);
assert.strictEqual(metrics.percentile([1,2,3,4,5],90),5);
assert.strictEqual(metrics.percentile([0,0,1,2,3,4,7,8,9,10],90),9);
console.log('PASS mean/p90 deterministic');

const states=[state(1,0),state(2,1),state(3,2),state(4,7)];
const result=metrics.buildMetrics(states);
assert.strictEqual(result.units,4);
assert.strictEqual(result.correction_cycles.total_lifetime,10);
assert.strictEqual(result.correction_cycles.max_per_unit,7);
assert.strictEqual(result.reopening.units_reopened,2);
assert.strictEqual(result.human_escalation.units_at_human,1);
assert.strictEqual(result.audit_latency_minutes.samples,10);
assert.strictEqual(result.audit_latency_minutes.mean,30);
assert.ok(result.agents.mean_distinct_agents_per_unit > 0);
assert.strictEqual(
  result.ai_cost_proxy.total_work_units,
  result.ai_cost_proxy.correction_starts
    + result.ai_cost_proxy.handoffs
    + result.ai_cost_proxy.distributed_audit_decisions
);
console.log('PASS lifecycle metrics derive cycles, reopening, HUMAN, latency, agents and cost proxy');

const rendered=metrics.render(result);
assert.ok(rendered.includes('mean_cycles='));
assert.ok(rendered.includes('p90_cycles='));
assert.ok(rendered.includes('ai_work_units='));
console.log('PASS metrics render is audit-friendly');

console.log('Bible lifecycle metrics self-test: SUCCESS');
