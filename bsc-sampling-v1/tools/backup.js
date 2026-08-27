'use strict';

// Daily backup for the V1 server (spec section 24):
//   node tools/backup.js [--photos] [--keep N] [--dir BACKUP_DIR] [--mirror OFFSITE_DIR]
// - DB snapshot uses VACUUM INTO, which is consistent under WAL and does not
//   rely on copying the live .sqlite file.
// - --photos also copies uploads/reference; identical files (size + mtime)
//   are skipped so repeated runs behave incrementally.
// - --mirror copies the finished backup into an offsite folder (network drive,
//   second disk, synced cloud folder) so the backups survive a disk failure.
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
const mirrorIdx = process.argv.indexOf('--mirror');
const mirrorRoot = mirrorIdx >= 0 ? path.resolve(process.argv[mirrorIdx + 1]) : null;
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
let backupDir = path.join(backupRoot, `backup-${stamp}`);
// 同一秒内重复执行（手动重试）会撞名导致 VACUUM INTO 失败；追加序号避免。
for (let n = 2; fs.existsSync(backupDir); n++) backupDir = path.join(backupRoot, `backup-${stamp}-${n}`);

fs.mkdirSync(backupDir, { recursive: true });

// 增量拷贝整棵目录（尺寸+mtime 相同的文件跳过），返回新增文件数。
// 先建目标目录再拷贝：reference/ 等目录可能顶层直接放文件，
// 旧实现只在遇到子目录时建目录，顶层文件会导致 ENOENT 备份失败。
let copied = 0;
function copyTree(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) { copyTree(src, dst); continue; }
    const st = fs.statSync(src);
    if (fs.existsSync(dst) && fs.statSync(dst).size === st.size && Math.abs(fs.statSync(dst).mtimeMs - st.mtimeMs) < 2000) continue;
    fs.copyFileSync(src, dst);
    copied++;
  }
}

// 1. Consistent database snapshot.
const dbFile = path.join(dataDir, 'bsc-v1.sqlite');
const snapshot = path.join(backupDir, 'bsc-v1.sqlite');
if (!fs.existsSync(dbFile)) throw new Error(`database not found: ${dbFile}`);
const db = new DatabaseSync(dbFile, { readOnly: true });
db.exec(`VACUUM INTO '${snapshot.replaceAll("'", "''")}'`);
db.close();
console.log(`database snapshot: ${snapshot} (${fs.statSync(snapshot).size} bytes)`);

// 2. Photos (optional, incremental by size+mtime).
if (withPhotos) {
  const target = path.join(backupDir, 'photos');
  copyTree(path.join(dataDir, 'uploads'), path.join(target, 'uploads'));
  copyTree(path.join(dataDir, 'reference'), path.join(target, 'reference'));
  console.log(`photos copied: ${copied}`);
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

// 4. Offsite mirror (optional): 把刚完成的备份增量同步到异机/云盘目录。
if (mirrorRoot) {
  try {
    const mirrorDir = path.join(mirrorRoot, 'backups', path.basename(backupDir));
    const before = copied;
    copyTree(backupDir, mirrorDir);
    console.log(`mirrored to: ${mirrorDir} (${copied - before} files)`);
  } catch (e) {
    console.error(`MIRROR FAILED: ${e.message}`);
    process.exitCode = 1;
  }
}
console.log(`backup complete: ${backupDir}`);
