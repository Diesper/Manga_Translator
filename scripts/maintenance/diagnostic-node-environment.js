'use strict';

const fs = require('fs');
const path = require('path');
const asyncHooks = require('async_hooks');
const { TestEnvironment: NodeEnvironment } = require('jest-environment-node');

const TRACKED_TYPES = new Set([
  'Timeout',
  'Immediate',
  'TCPWRAP',
  'TCPSERVERWRAP',
  'PIPEWRAP',
  'MESSAGEPORT',
  'TTYWRAP',
  'SIGNALWRAP',
  'FSEVENTWRAP',
]);

function sanitize(value) {
  return String(value || 'unknown')
    .replace(/\\/g, '/')
    .replace(/[^a-zA-Z0-9._/-]+/g, '-')
    .replace(/\/+ /g, '/')
    .replace(/\//g, '__')
    .slice(-180);
}

function cleanStack(stack) {
  return String(stack || '')
    .split(/\r?\n/)
    .slice(2)
    .filter(line => !line.includes('node:async_hooks'))
    .filter(line => !line.includes('diagnostic-node-environment.js'))
    .slice(0, 14)
    .join('\n');
}

class DiagnosticNodeEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);
    this.testPath = context.testPath;
    this._resources = new Map();
    this._insideHook = false;
    this._hook = null;
  }

  async setup() {
    await super.setup();

    this._hook = asyncHooks.createHook({
      init: (asyncId, type, triggerAsyncId) => {
        if (this._insideHook || !TRACKED_TYPES.has(type)) return;
        this._insideHook = true;
        try {
          this._resources.set(asyncId, {
            asyncId,
            type,
            triggerAsyncId,
            createdAt: Date.now(),
            stack: cleanStack(new Error('async resource created').stack),
          });
        } finally {
          this._insideHook = false;
        }
      },
      destroy: (asyncId) => {
        this._resources.delete(asyncId);
      },
    });
    this._hook.enable();
  }

  async teardown() {
    if (this._hook) this._hook.disable();

    const pending = [...this._resources.values()]
      .sort((a, b) => a.asyncId - b.asyncId)
      .map(resource => ({
        ...resource,
        ageMs: Date.now() - resource.createdAt,
      }));

    const repoRoot = path.resolve(__dirname, '../..');
    const rel = path.relative(repoRoot, this.testPath).replace(/\\/g, '/');
    const outDir = path.join(repoRoot, '.ci-results', 'async-leaks');
    fs.mkdirSync(outDir, { recursive: true });

    const report = {
      generatedAt: new Date().toISOString(),
      pid: process.pid,
      workerId: process.env.JEST_WORKER_ID || null,
      node: process.version,
      testPath: rel,
      pendingCount: pending.length,
      pending,
    };

    const file = path.join(outDir, sanitize(rel) + '.json');
    fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');

    if (pending.length) {
      const counts = {};
      for (const item of pending) counts[item.type] = (counts[item.type] || 0) + 1;
      // eslint-disable-next-line no-console
      console.log(
        '[async-leak-trace] worker=' + String(report.workerId) +
        ' file=' + rel +
        ' pending=' + String(pending.length) +
        ' types=' + JSON.stringify(counts)
      );
    }

    this._resources.clear();
    await super.teardown();
  }
}

module.exports = DiagnosticNodeEnvironment;
