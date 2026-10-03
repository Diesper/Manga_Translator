'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// All cooperative writers take the same per-unit lock before reading the model.
// An interrupted lock is deliberately never stolen: recovery must inspect its
// journal and ownership rather than overwrite a possibly live writer.
function withUnitLock(root, index, operation) {
  if (!Number.isInteger(index) || index < 1) throw new Error('INVALID_UNIT_INDEX');
  const directory = path.join(root, 'docs/biblia/.coordination/write-locks');
  fs.mkdirSync(directory, { recursive: true });
  const lock = path.join(directory, String(index).padStart(3, '0') + '.json');
  const owner = JSON.stringify({ pid: process.pid, host: os.hostname(), nonce: crypto.randomUUID() });
  try { fs.writeFileSync(lock, owner, { flag: 'wx' }); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('UNIT_WRITE_LOCKED:' + index); throw error; }
  try { return operation(); }
  finally { if (fs.existsSync(lock) && fs.readFileSync(lock, 'utf8') === owner) fs.unlinkSync(lock); }
}

function atomicWrite(file, content, options = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx');
    fs.writeFileSync(fd, content);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    if (options.expected !== undefined && fs.readFileSync(file, 'utf8') !== options.expected) throw new Error('STATE_CAS_CONFLICT');
    if (options.beforeCommit) options.beforeCommit();
    if (options.createOnly) { fs.linkSync(temporary, file); fs.unlinkSync(temporary); }
    else fs.renameSync(temporary, file);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function transaction(root, index, metadata, operation) {
  const directory = path.join(root, 'docs/biblia/.coordination/write-journal', String(index).padStart(3, '0'));
  const id = crypto.randomUUID();
  const record = { schema_version: 1, id, index, at_utc: new Date().toISOString(), ...metadata };
  const write = (phase, extra = {}) => atomicWrite(path.join(directory, id + '.' + phase + '.json'),
    JSON.stringify({ ...record, phase, ...extra }, null, 2) + '\n', { createOnly: true });
  write('intent');
  try { const result = operation(); write('committed'); return result; }
  catch (error) { write('failed', { error: error.message }); throw error; }
}

function pendingTransactions(root) {
  const directory = path.join(root, 'docs/biblia/.coordination/write-journal');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).flatMap(unit => {
    const base = path.join(directory, unit);
    if (!fs.statSync(base).isDirectory()) return [];
    return fs.readdirSync(base).filter(name => name.endsWith('.intent.json')
      && !fs.existsSync(path.join(base, name.replace('.intent.json', '.committed.json'))))
      .map(name => JSON.parse(fs.readFileSync(path.join(base, name), 'utf8')));
  });
}
module.exports = { withUnitLock, atomicWrite, transaction, pendingTransactions };
