const path = require('path');

module.exports = {
    reporter: [
        ['line'],
        [path.join(__dirname, 'playwright-gate-reporter.js')],
    ],
};
