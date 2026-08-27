'use strict';

// Inverse of embed-source-doc.js: rebuilds repository source files from a
// generated Appendix L snapshot. Used when the real repository files are not
// available, e.g. when an AI agent receives only the handoff documents.
//
// Usage:
//   node tools/restore-from-appendix.js [path-to-APPENDIX_L_SOURCE_SNAPSHOT.md] [--force]
//
// Every file's content is verified against the SHA-256 declared in the
// appendix (the digest is computed over the LF-normalized content without
// trailing whitespace, exactly as embed-source-doc.js computed it). Existing
// files are skipped unless --force is given.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const serverRoot = path.resolve(__dirname, '..');
const workspace = path.resolve(serverRoot, '..');
const positional = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const appendixPath = positional[0] || path.join(serverRoot, 'docs', 'APPENDIX_L_SOURCE_SNAPSHOT.md');
const force = process.argv.includes('--force');

const text = fs.readFileSync(appendixPath, 'utf8').replace(/\r\n/g, '\n');
const lines = text.split('\n');
const digest = content => crypto.createHash('sha256').update(content).digest('hex');

let written = 0;
let skipped = 0;
let mismatches = 0;

for (let i = 0; i < lines.length; i++) {
  const header = /^#### `(.+)`$/.exec(lines[i]);
  if (!header) continue;
  const declared = /^SHA-256: `([0-9a-f]{64})`$/.exec(lines[i + 1] || '') || /^SHA-256: `([0-9a-f]{64})`$/.exec(lines[i + 2] || '');
  if (!declared) throw new Error(`Missing SHA-256 line after ${header[1]} (appendix line ${i + 2})`);
  let start = i + 2;
  while (start < lines.length && !/^~~~~[a-z]*$/.test(lines[start])) start++;
  if (start >= lines.length) throw new Error(`Missing code fence for ${header[1]}`);
  const end = lines.indexOf('~~~~', start + 1);
  if (end < 0) throw new Error(`Unclosed code fence for ${header[1]}`);
  const content = `${lines.slice(start + 1, end).join('\n')}\n`;
  const actual = digest(content.replace(/\s+$/u, ''));
  if (actual !== declared[1]) {
    mismatches++;
    console.error(`SHA-256 MISMATCH: ${header[1]} (declared ${declared[1]}, got ${actual})`);
  }
  const relative = header[1];
  if (!/^(bsc-android-native|bsc-sampling-v1)\//.test(relative) || relative.includes('..') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe path in snapshot: ${relative}`);
  }
  const target = path.join(workspace, ...relative.split('/'));
  if (fs.existsSync(target) && !force) {
    skipped++;
    continue;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  written++;
}

console.log(`Restored ${written} file(s), skipped ${skipped} existing, ${mismatches} digest mismatch(es) into ${workspace}`);
if (mismatches > 0) process.exitCode = 1;
