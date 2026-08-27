'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { initialize } = require('../src/schema');

function tables(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
}

test('initialize creates all V1 tables', () => {
  const db = new DatabaseSync(':memory:');
  initialize(db);
  const names = tables(db);
  for (const expected of ['projects', 'sites', 'villagers', 'devices', 'activation_codes', 'journeys',
    'tasks', 'track_points', 'live_locations', 'records', 'audit_logs', 'app_logs', 'app_versions']) {
    assert.ok(names.includes(expected), `missing table ${expected}`);
  }
});

test('seed inserts 2 projects, 25 formal sites and villager cmy01', () => {
  const db = new DatabaseSync(':memory:');
  initialize(db);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM projects').get().c, 2);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM sites WHERE project_id=1").get().c, 25);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM sites WHERE project_id=1 AND code IN ('5.1','9.5','9.6')").get().c, 3,
    'historical decimal codes must be preserved');
  const villager = db.prepare("SELECT * FROM villagers WHERE username='cmy01'").get();
  assert.ok(villager, 'seeded villager');
  assert.notEqual(villager.pin_hash, '1234', 'pin hashed, never plain');
});

test('initialize is idempotent (no duplicate seed)', () => {
  const db = new DatabaseSync(':memory:');
  initialize(db);
  initialize(db);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM projects').get().c, 2);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM sites').get().c, 25);
});

test('migration adds server weather columns to legacy records table', () => {
  const db = new DatabaseSync(':memory:');
  // Simulate a database created before the server weather backfill existed:
  // full original records shape, but without the two server_weather columns.
  db.exec(`CREATE TABLE records (id INTEGER PRIMARY KEY AUTOINCREMENT, client_record_id TEXT NOT NULL UNIQUE,
    task_id INTEGER NOT NULL, device_id INTEGER NOT NULL, journey_id INTEGER, is_primary INTEGER NOT NULL DEFAULT 0,
    conflict_status TEXT NOT NULL DEFAULT 'none', no_water INTEGER NOT NULL DEFAULT 0, captured_at TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, latitude REAL NOT NULL, longitude REAL NOT NULL, accuracy_m REAL,
    distance_m REAL, weather_text TEXT NOT NULL DEFAULT '待补充', weather_status TEXT NOT NULL DEFAULT 'pending',
    exception_category TEXT, exception_detail TEXT, manual_code INTEGER NOT NULL DEFAULT 0, mock_location INTEGER NOT NULL DEFAULT 0,
    photo_path TEXT NOT NULL, photo_sha256 TEXT NOT NULL, review_status TEXT NOT NULL DEFAULT 'pending',
    review_note TEXT NOT NULL DEFAULT '', risk_flags TEXT NOT NULL DEFAULT '[]', invalidated_at TEXT, invalidated_reason TEXT)`);
  initialize(db);
  const columns = db.prepare('PRAGMA table_info(records)').all().map(c => c.name);
  assert.ok(columns.includes('server_weather_text'), 'server_weather_text column added');
  assert.ok(columns.includes('server_weather_status'), 'server_weather_status column added');
});

test('audit rows are appendable', () => {
  const db = new DatabaseSync(':memory:');
  initialize(db);
  const { audit } = require('../src/schema');
  audit(db, 'admin', 'admin', 'review', 'record', '12', { status: 'approved' }, '127.0.0.1');
  const row = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1').get();
  assert.equal(row.action, 'review');
  assert.equal(row.entity_id, '12');
  assert.equal(JSON.parse(row.details).status, 'approved');
});
