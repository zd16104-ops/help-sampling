'use strict';

// 备份回归测试：reference/ 顶层直接放文件时 --photos 必须成功（历史 ENOENT bug），
// 且同一秒重复执行不因目录撞名失败。

const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

test('backup --photos copies top-level reference files and survives same-second rerun', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bsc-backup-test-'));
  try {
    const data = path.join(tmp, 'data', 'v1');
    fs.mkdirSync(path.join(data, 'reference'), { recursive: true });
    fs.mkdirSync(path.join(data, 'uploads', '1'), { recursive: true });
    const db = new DatabaseSync(path.join(data, 'bsc-v1.sqlite'));
    db.exec('CREATE TABLE t(x)');
    db.close();
    fs.writeFileSync(path.join(data, 'reference', 'ref-real.jpg'), Buffer.alloc(128, 1));
    fs.writeFileSync(path.join(data, 'uploads', '1', 'p.jpg'), Buffer.alloc(64, 2));
    const bk = path.join(tmp, 'bk');
    const args = [path.join(__dirname, '..', 'tools', 'backup.js'), '--photos', '--dir', bk];
    const env = { ...process.env, DATA_DIR: data };
    const run = spawnSync(process.execPath, args, { env, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const newest = fs.readdirSync(bk).filter(d => d.startsWith('backup-')).sort().pop();
    assert.ok(newest, '备份目录已创建');
    assert.ok(fs.existsSync(path.join(bk, newest, 'photos', 'reference', 'ref-real.jpg')), 'reference 顶层文件已拷贝（ENOENT 回归）');
    assert.ok(fs.existsSync(path.join(bk, newest, 'photos', 'uploads', '1', 'p.jpg')), 'uploads 嵌套文件已拷贝');
    const run2 = spawnSync(process.execPath, args, { env, encoding: 'utf8' });
    assert.equal(run2.status, 0, `同一秒重复执行不应失败: ${run2.stderr}`);
    const dirs = fs.readdirSync(bk).filter(d => d.startsWith('backup-'));
    assert.equal(dirs.length, 2, '两次执行生成两个不撞名的备份目录');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
