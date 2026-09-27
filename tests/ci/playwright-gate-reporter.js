'use strict';

const baseline = require('./test-baseline.json');

class PlaywrightGateReporter {
  constructor() {
    this.total = 0;
    this.finalStatusById = new Map();
  }

  onBegin(_config, suite) {
    this.total = suite.allTests().length;
    console.log('[CI/E2E] Playwright descobriu ' + this.total + ' teste(s).');
  }

  onTestEnd(test, result) {
    this.finalStatusById.set(test.id, result.status);
  }

  async onEnd(result) {
    const skipped = [...this.finalStatusById.values()].filter((status) => status === 'skipped').length;
    const problems = [];

    if (this.total < baseline.e2e.minTests) {
      problems.push('somente ' + this.total + ' E2E descobertos; mínimo protegido: ' + baseline.e2e.minTests);
    }
    if (skipped > baseline.e2e.maxSkipped) {
      problems.push(skipped + ' E2E skipped; máximo permitido: ' + baseline.e2e.maxSkipped);
    }
    if (this.finalStatusById.size < this.total && result.status === 'passed') {
      problems.push('apenas ' + this.finalStatusById.size + '/' + this.total + ' testes produziram resultado final');
    }

    if (problems.length) {
      console.error('\nGate E2E falhou:');
      for (const problem of problems) console.error('- ' + problem);
      return { status: 'failed' };
    }

    console.log('Gate E2E aprovado: ' + this.total + ' teste(s), skipped=' + skipped + '.');
    return undefined;
  }
}

module.exports = PlaywrightGateReporter;
