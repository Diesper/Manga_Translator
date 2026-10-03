'use strict';
const crypto = require('crypto');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const snapshots = new Map();
const slash = value => String(value).replace(/\\/g, '/');
function gitBlobShaBuffer(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return crypto.createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
}
function fileBlobSha(file) { return fs.existsSync(file) ? gitBlobShaBuffer(fs.readFileSync(file)) : null; }
function stamp(file) {
  try { const s = fs.statSync(file, { bigint: true }); return [s.ino, s.size, s.mtimeNs, s.ctimeNs].join(':'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function git(root, args) { return cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
function clearGitSnapshotCache(root = null) { if (root) snapshots.delete(path.resolve(root)); else snapshots.clear(); }
function loadGitSnapshot(root) {
  const key = path.resolve(root);
  const previous = snapshots.get(key);
  if (previous && (!previous.isGit || (previous.indexStamp === stamp(previous.indexPath)
    && [...previous.attributes].every(([file, value]) => stamp(file) === value)))) return previous;
  let indexPath;
  try { indexPath = path.resolve(key, git(key, ['rev-parse', '--git-path', 'index']).trim()); }
  catch (error) {
    if (!/not a git repository/i.test(String(error.stderr || ''))) throw error;
    const fixture = { isGit: false, index: new Map(), dirty: new Set() };
    snapshots.set(key, fixture); return fixture;
  }
  const index = new Map(), dirty = new Set(), stamps = new Map(), attributes = new Map(), pathAttributes = new Map();
  const metadata = git(key, ['rev-parse', '--git-path', 'HEAD', '--git-path', 'packed-refs', '--git-path', 'config', '--git-path', 'info/attributes']).trim().split(/\r?\n/).map(file => path.resolve(key, file));
  for (const file of metadata) attributes.set(file, stamp(file));
  const headSource = fs.readFileSync(metadata[0], 'utf8').trim();
  if (headSource.startsWith('ref: ')) {
    const reference = path.resolve(key, git(key, ['rev-parse', '--git-path', headSource.slice(5)]).trim());
    attributes.set(reference, stamp(reference));
  }
  for (const row of git(key, ['ls-files', '-s', '-z']).split('\0')) {
    const match = /^\d+\s+([0-9a-f]{40})\s+0\t([\s\S]+)$/i.exec(row);
    if (!match) continue;
    const relative = slash(match[2]);
    index.set(relative, match[1].toLowerCase());
    stamps.set(relative, stamp(path.join(key, relative)));
    if (path.basename(relative) === '.gitattributes') attributes.set(path.join(key, relative), stamps.get(relative));
    for (let directory = path.dirname(path.join(key, relative)); directory.startsWith(key + path.sep) || directory === key; directory = path.dirname(directory)) {
      const attribute = path.join(directory, '.gitattributes');
      if (!pathAttributes.has(attribute)) pathAttributes.set(attribute, stamp(attribute));
    }
  }
  // Also detect creation/removal of the root attributes file.
  attributes.set(path.join(key, '.gitattributes'), stamp(path.join(key, '.gitattributes')));
  for (const relative of git(key, ['diff', '--name-only', '-z', '--no-ext-diff']).split('\0')) if (relative) dirty.add(slash(relative));
  const snapshot = { isGit: true, index, dirty, stamps, attributes, pathAttributes, hashes: new Map(), indexPath, indexStamp: stamp(indexPath), head: null };
  snapshots.set(key, snapshot); return snapshot;
}
function gitWorkingTreeBlobSha(root, relativePath) {
  if (!root || !relativePath) return null;
  const relative = slash(relativePath), absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return null;
  const snapshot = loadGitSnapshot(root);
  if (!snapshot.isGit) return fileBlobSha(absolute);
  let attributesUnchanged = true;
  const attributeIdentity = [];
  const attributePaths = [];
  const resolvedRoot = path.resolve(root);
  for (let directory = path.dirname(absolute); directory.startsWith(resolvedRoot + path.sep) || directory === resolvedRoot; directory = path.dirname(directory)) {
    const attribute = path.join(directory, '.gitattributes');
    attributePaths.push(attribute);
    const value = stamp(attribute);
    attributeIdentity.push(value);
    if (snapshot.pathAttributes.get(attribute) !== value) attributesUnchanged = false;
  }
  const identity = stamp(absolute) + '|' + attributeIdentity.join('|');
  const cached = snapshot.hashes.get(relative);
  if (cached?.identity === identity) return cached.sha;
  if (snapshot.index.has(relative) && !snapshot.dirty.has(relative)
    && attributesUnchanged && snapshot.stamps.get(relative) === stamp(absolute)) return snapshot.index.get(relative);
  const result = git(root, ['hash-object', '--path=' + relative, absolute]).trim();
  if (!/^[a-f0-9]{40}$/i.test(result)) throw new Error('INVALID_GIT_BLOB_SHA');
  const sha = result.toLowerCase();
  if (identity === stamp(absolute) + '|' + attributePaths.map(stamp).join('|')
    && snapshot.indexStamp === stamp(snapshot.indexPath)
    && [...snapshot.attributes].every(([file,value]) => stamp(file) === value)) snapshot.hashes.set(relative, { identity, sha });
  else throw new Error('REVISION_CHANGED_DURING_HASH');
  return sha;
}
function headBlobSha(root, relativePath, fallbackSource) {
  const snapshot = loadGitSnapshot(root);
  if (!snapshot.isGit) return gitBlobShaBuffer(Buffer.from(fallbackSource, 'utf8'));
  // HEAD and refs can change without touching the index (reset --soft).
  if (!snapshot.head) {
    snapshot.head = new Map();
    for (const row of git(root, ['ls-tree', '-r', '-z', 'HEAD']).split('\0')) {
      const match = /^\d+ blob ([a-f0-9]{40})\t([\s\S]+)$/i.exec(row);
      if (match) snapshot.head.set(slash(match[2]), match[1].toLowerCase());
    }
  }
  return snapshot.head.get(slash(relativePath)) || gitBlobShaBuffer(Buffer.from(fallbackSource, 'utf8'));
}
module.exports = { gitBlobShaBuffer, fileBlobSha, loadGitSnapshot, clearGitSnapshotCache, gitWorkingTreeBlobSha, headBlobSha };
