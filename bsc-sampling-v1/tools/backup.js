'use strict';

// Daily backup for the V1 server (spec section 24):
//   node tools/backup.js [--photos] [--keep N] [--dir BACKUP_DIR]
// - DB snapshot uses VACUUM INTO, which is consistent under WAL and does not
//   rely on copying the live .sqlite file.
// - --photos also copies uploads/reference; identical files (size + mtime)
//   are skipped so repeated runs behave incrementally.
// - Old backup folders beyond --keep days are removed.
// ASCII filename per spec section 30; run with `npm run backup`.

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data', 'v1'));
const backupRoot = path.resolve(process.argv.includes('--dir')
  ? process.argv[process.argv.indexOf('--dir') + 1]
  : path.join(dataDir, 'backups'));
const withPhotos = process.argv.includes('--photos');
const keepIdx = process.argv.indexOf('--keep');
const keepDays = keepIdx >= 0 ? Number(process.argv[keepIdx + 1]) : 14;
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
let backupDir = path.join(backupRoot, `backup-${stamp}`);
// 同一秒内重复执行（手动重试）会撞名导致 VACUUM INTO 失败；追加序号避免。
for (let n = 2; fs.existsSync(backupDir); n++) backupDir = path.join(backupRoot, `backup-${stamp}-${n}`);

fs.mkdirSync(backupDir, { recursive: true });

// 1. Consistent database snapshot.
const dbFile = path.join(dataDir, 'bsc-v1.sqlite');
const snapshot = path.join(backupDir, 'bsc-v1.sqlite');
if (!fs.existsSync(dbFile)) throw new Error(`database not found: ${dbFile}`);
const db = new DatabaseSync(dbFile, { readOnly: true });
db.exec(`VACUUM INTO '${snapshot.replaceAll("'", "''")}'`);
db.close();
console.log(`database snapshot: ${snapshot} (${fs.statSync(snapshot).size} bytes)`);

// 2. Photos (optional, incremental by size+mtime).
let photoCount = 0;
if (withPhotos) {
  const target = path.join(backupDir, 'photos');
  fs.mkdirSync(target, { recursive: true });
  const copyDir = (from, to) => {
    if (!fs.existsSync(from)) return;
    // 先建目标目录再拷贝：reference/ 等目录可能顶层直接放文件，
    // 旧实现只在遇到子目录时建目录，顶层文件会导致 ENOENT 备份失败。
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      const src = path.join(from, entry.name);
      const dst = path.join(to, entry.name);
      if (entry.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); copyDir(src, dst); continue; }
      const st = fs.statSync(src);
      if (fs.existsSync(dst) && fs.statSync(dst).size === st.size && Math.abs(fs.statSync(dst).mtimeMs - st.mtimeMs) < 2000) continue;
      fs.copyFileSync(src, dst);
      photoCount++;
    }
  };
  copyDir(path.join(dataDir, 'uploads'), path.join(target, 'uploads'));
  copyDir(path.join(dataDir, 'reference'), path.join(target, 'reference'));
  console.log(`photos copied: ${photoCount}`);
}

// 3. Retention.
for (const entry of fs.readdirSync(backupRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith('backup-')) continue;
  const age = Date.now() - fs.statSync(path.join(backupRoot, entry.name)).mtimeMs;
  if (age > keepDays * 86400_000) {
    fs.rmSync(path.join(backupRoot, entry.name), { recursive: true, force: true });
    console.log(`removed old backup: ${entry.name}`);
  }
}
console.log(`backup complete: ${backupDir}`);
