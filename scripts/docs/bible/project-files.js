'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const OUTPUT_REL = 'docs/Bíblia.md';

const ROOT_FILES = new Set([
  '.gitignore',
  'package.json',
  'jest.config.js',
  'playwright.config.js',
]);

const PREFIXES = [
  'extension/',
  'scripts/',
  'tests/',
  '.github/workflows/',
];

const EXCLUDED = new Set([
  OUTPUT_REL,
  'package-lock.json',
  '.github/workflows/generate-bible-branch.yml',
]);

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'coverage',
  'playwright-report',
  'test-results',
  '.ci-results',
  'dist',
  'build',
  'blob-report',
  'all-blob-reports',
]);

const TEXT_EXTS = new Set([
  '.js', '.cjs', '.mjs', '.json', '.html', '.css', '.yml', '.yaml', '.md', '.txt',
]);

const STOP = new Set([
  'await','break','case','catch','class','const','continue','debugger','default',
  'delete','do','else','export','extends','false','finally','for','function','if',
  'import','in','instanceof','let','new','null','return','static','super','switch',
  'this','throw','true','try','typeof','undefined','var','void','while','with',
  'yield','async','of','from','require','module','exports','object','string',
  'number','boolean','array','promise','error','event','window','document','value',
  'values','result','results','data','item','items','entry','entries','source',
  'target','options','config','state','message','response','request','callback',
  'handler','element','elements','index','length','name','type','path','file',
  'files','content','text','status','payload','context','current','next','output',
  'input','key','keys','map','set','list','resolve','reject','then','chrome',
]);

function normalizeRel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function included(relative) {
  if (EXCLUDED.has(relative)) return false;
  if (ROOT_FILES.has(relative)) return true;
  if (!PREFIXES.some(prefix => relative.startsWith(prefix))) return false;
  return TEXT_EXTS.has(path.extname(relative).toLowerCase());
}

function isTestOrGate(relative) {
  return relative.startsWith('tests/')
    || relative.startsWith('scripts/validation/')
    || /\.(?:test|spec)\.[cm]?js$/i.test(relative);
}

function language(relative) {
  const ext = path.extname(relative).toLowerCase();
  if (['.js', '.cjs', '.mjs'].includes(ext)) return 'JavaScript';
  if (ext === '.json') return 'JSON';
  if (ext === '.html') return 'HTML';
  if (ext === '.css') return 'CSS';
  if (ext === '.yml' || ext === '.yaml') return 'YAML';
  if (ext === '.md') return 'Markdown';
  return 'texto/configuração';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function identifiers(text) {
  const found = String(text).match(/[A-Za-z_$][\w$]{3,}/g) || [];
  return [...new Set(found)]
    .filter(id => !STOP.has(id.toLowerCase()))
    .sort((a, b) => b.length - a.length);
}

function declaredSymbol(line) {
  const patterns = [
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/,
    /\bclass\s+([A-Za-z_$][\w$]*)\b/,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/,
    /^\s*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/,
  ];
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function executable(line, relative) {
  const text = line.trim();
  if (!text) return false;
  if (/^(?:\/\/|\/\*|\*|\*\/|<!--|-->)/.test(text)) return false;
  const ext = path.extname(relative).toLowerCase();
  if ((ext === '.yml' || ext === '.yaml') && text.startsWith('#')) return false;
  if (ext === '.md') return false;
  return true;
}

function loadFiles() {
  return walk(ROOT)
    .map(full => ({ full, rel: normalizeRel(full) }))
    .filter(file => included(file.rel))
    .map(file => {
      const content = fs.readFileSync(file.full, 'utf8').replace(/\r\n/g, '\n');
      return { ...file, content, lines: content.split('\n') };
    })
    .sort((a, b) => a.rel.localeCompare(b.rel));
}

module.exports = {
  ROOT,
  OUTPUT_REL,
  STOP,
  included,
  isTestOrGate,
  language,
  escapeHtml,
  identifiers,
  declaredSymbol,
  executable,
  loadFiles,
};
