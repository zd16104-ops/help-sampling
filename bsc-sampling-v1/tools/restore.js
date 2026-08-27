'use strict';

// Restore drill for a backup produced by tools/backup.js (spec section 24:
// restore from backup into a temporary directory at least monthly).
//   node tools/restore.js <backup-dir> [target-dir]
// Opens the restored database read-only, counts tables, and verifies that at
// least one record photo file exists — the acceptance check is "open any
// photo record from the restored copy", not merely that files exist.

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const source = path.resolve(process.argv[2] || '');
if (!source || !fs.existsSync(source)) {
  console.error('usage: node tools/restore.js <backup-dir> [target-dir]');
  process.exit(1);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const target = path.resolve(process.argv[3] || path.join(path.dirname(source), `restore-drill-${stamp}`));
fs.mkdirSync(target, { recursive: true });

const dbSource = path.join(source, 'bsc-v1.sqlite');
if (!fs.existsSync(dbSource)) {
  console.error(`no database in backup: ${dbSource}`);
  process.exit(1);
}
const dbTarget = path.join(target, 'bsc-v1.sqlite');
fs.copyFileSync(dbSource, dbTarget);
const photosSource = path.join(source, 'photos');
if (fs.existsSync(photosSource)) fs.cpSync(photosSource, target, { recursive: true });

const db = new DatabaseSync(dbTarget, { readOnly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
console.log(`restored ${tables.length} tables: ${tables.join(', ')}`);

const record = db.prepare('SELECT id, photo_path, photo_sha256 FROM records ORDER BY id LIMIT 1').get();
if (!record) {
  console.error('restored database has no records — drill incomplete');
  process.exit(1);
}
const photoFile = path.join(target, String(record.photo_path).replace(/^[/\\]+/, ''));
const photoOk = fs.existsSync(photoFile);
console.log(`sample record id=${record.id} photo=${record.photo_path}`);
console.log(`photo present after restore: ${photoOk ? 'YES' : 'NO'}`);
if (!photoOk) console.log('(photos may not have been included in the backup; --photos was off)');

db.close();
console.log(`restore drill complete into ${target}`);
console.log(photoOk ? 'DRILL PASSED' : 'DRILL FAILED (photo missing)');
process.exit(photoOk ? 0 : 1);
