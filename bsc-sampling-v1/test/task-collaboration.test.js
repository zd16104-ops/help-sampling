'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { initialize } = require('../src/schema');
const collaboration = require('../src/task-collaboration');

function fixture(dbPath = ':memory:') {
  const db = new DatabaseSync(dbPath);
  initialize(db);
  const primary = db.prepare("SELECT id FROM villagers WHERE username='cmy01'").get().id;
  const backup = Number(db.prepare("INSERT INTO villagers(username,display_name,pin_salt,pin_hash) VALUES('backup','备用管理员','','')").run().lastInsertRowid);
  const third = Number(db.prepare("INSERT INTO villagers(username,display_name,pin_salt,pin_hash) VALUES('third','第三人','','')").run().lastInsertRowid);
  const primaryDevice = Number(db.prepare("INSERT INTO devices(villager_id,device_uuid) VALUES(?,'primary-device')").run(primary).lastInsertRowid);
  const backupDevice = Number(db.prepare("INSERT INTO devices(villager_id,device_uuid) VALUES(?,'backup-device')").run(backup).lastInsertRowid);
  const task = Number(db.prepare(`INSERT INTO tasks(project_id,site_id,villager_id,backup_villager_id,active_villager_id,
    planned_date,base_sample_code,sample_code,sample_type,qr_token) VALUES(1,1,?,?,?,'2026-09-20','260920-R-1','260920-R-1-01','R','qr')`)
    .run(primary, backup, primary).lastInsertRowid);
  collaboration.markAssigned(db, task, primary, backup);
  return { db, primary, backup, third, primaryDevice, backupDevice, task };
}

test('backup can take over atomically and duplicate request is idempotent', () => {
  const f = fixture();
  const request = { taskId: f.task, villagerId: f.backup, deviceId: f.backupDevice, confirmationCode: '1234',
    reasonCode: 'ADMIN_ON_SITE_REPLACEMENT', expectedVersion: 1, clientRequestId: 'takeover-1' };
  const first = collaboration.takeover(f.db, request);
  assert.equal(first.assignment.activeVillagerId, f.backup);
  assert.equal(first.assignment.assignmentVersion, 2);
  assert.equal(first.assignment.handoverCount, 1);
  const duplicate = collaboration.takeover(f.db, request);
  assert.equal(duplicate.idempotent, true);
  assert.equal(duplicate.assignment.assignmentVersion, 2);
  assert.equal(f.db.prepare("SELECT COUNT(*) count FROM task_assignment_events WHERE event_type='takeover'").get().count, 1);
});

test('takeover validates confirmation, participant, version and cooldown', () => {
  const f = fixture();
  assert.throws(() => collaboration.takeover(f.db, { taskId: f.task, villagerId: f.backup, deviceId: f.backupDevice,
    confirmationCode: '9999', reasonCode: 'DEVICE_FAILURE', expectedVersion: 1, clientRequestId: 'bad-code' }), e => e.code === 'INVALID_CONFIRMATION_CODE');
  collaboration.takeover(f.db, { taskId: f.task, villagerId: f.backup, deviceId: f.backupDevice,
    confirmationCode: '1234', reasonCode: 'DEVICE_FAILURE', expectedVersion: 1, clientRequestId: 'first' });
  assert.throws(() => collaboration.takeover(f.db, { taskId: f.task, villagerId: f.primary, deviceId: f.primaryDevice,
    confirmationCode: '1234', reasonCode: 'SCHEDULE_CHANGED', expectedVersion: 2, clientRequestId: 'too-soon' }), e => e.code === 'TAKEOVER_COOLDOWN');
  f.db.prepare("UPDATE tasks SET last_handover_at=datetime('now','-2 minutes') WHERE id=?").run(f.task);
  const back = collaboration.takeover(f.db, { taskId: f.task, villagerId: f.primary, deviceId: f.primaryDevice,
    confirmationCode: '1234', reasonCode: 'SCHEDULE_CHANGED', expectedVersion: 2, clientRequestId: 'back' });
  assert.equal(back.assignment.activeVillagerId, f.primary);
  assert.equal(back.assignment.assignmentVersion, 3);
  assert.throws(() => collaboration.participantTask(f.db, f.task, f.third), e => e.code === 'TASK_NOT_FOUND');
});

test('progress events are idempotent and old assignment events stay supporting evidence', () => {
  const f = fixture();
  const event = { clientEventId: 'progress-1', eventType: 'photo_captured', assignmentVersion: 1, occurredAt: new Date().toISOString(), metadata: {} };
  const first = collaboration.addProgress(f.db, { taskId: f.task, villagerId: f.primary, deviceId: f.primaryDevice, events: [event] });
  assert.equal(first.accepted, 1);
  const duplicate = collaboration.addProgress(f.db, { taskId: f.task, villagerId: f.primary, deviceId: f.primaryDevice, events: [event] });
  assert.equal(duplicate.accepted, 0);
  collaboration.takeover(f.db, { taskId: f.task, villagerId: f.backup, deviceId: f.backupDevice,
    confirmationCode: '1234', reasonCode: 'DEVICE_FAILURE', expectedVersion: 1, clientRequestId: 'takeover' });
  const stale = collaboration.addProgress(f.db, { taskId: f.task, villagerId: f.primary, deviceId: f.primaryDevice,
    events: [{ ...event, clientEventId: 'progress-stale' }] });
  assert.equal(stale.scopes[0].scope, 'pre_handover');
  assert.equal(collaboration.getProgress(f.db, f.task, f.primary).progressEvents.length, 2);
});

test('admin may replace inactive backup but not active backup after progress', () => {
  const f = fixture();
  const changed = collaboration.updateAssignees(f.db, { taskId: f.task, primaryVillagerId: f.primary, backupVillagerId: f.third, reason: '调整' });
  assert.equal(changed.assignment.backupVillagerId, f.third);
  f.db.prepare("INSERT INTO devices(villager_id,device_uuid) VALUES(?,'third-device')").run(f.third);
  const thirdDevice = f.db.prepare("SELECT id FROM devices WHERE villager_id=?").get(f.third).id;
  collaboration.takeover(f.db, { taskId: f.task, villagerId: f.third, deviceId: thirdDevice,
    confirmationCode: '1234', reasonCode: 'PRIMARY_CANNOT_ARRIVE', expectedVersion: 2, clientRequestId: 'third-takeover' });
  assert.throws(() => collaboration.updateAssignees(f.db, { taskId: f.task, primaryVillagerId: f.primary, backupVillagerId: f.backup, reason: '再次调整' }), e => e.code === 'BACKUP_IS_ACTIVE');
});

function journey(f, { villagerId = f.primary, deviceId = f.primaryDevice, taskId = null,
  recordedAt = '2026-09-19T17:00:00Z' } = {}) {
  const id = Number(f.db.prepare(`INSERT INTO journeys(villager_id,device_id,site_id,task_id,started_at)
    VALUES(?,?,1,?,?)`).run(villagerId, deviceId, taskId, recordedAt).lastInsertRowid);
  f.db.prepare(`INSERT INTO track_points(journey_id,sequence,recorded_at,latitude,longitude)
    VALUES(?,1,?,30,94)`).run(id, recordedAt);
  return id;
}

function anotherTask(f, villagerId = f.primary, date = '2026-09-20') {
  const suffix = f.db.prepare('SELECT COUNT(*) count FROM tasks').get().count;
  return Number(f.db.prepare(`INSERT INTO tasks(project_id,site_id,villager_id,planned_date,
    base_sample_code,sample_code,sample_type,qr_token) VALUES(1,1,?,?,'base',?,'R',?)`)
    .run(villagerId, date, `extra-${suffix}`, `qr-${suffix}`).lastInsertRowid);
}

test('progress recovers unique orphan tracks in sampling-site time and excludes other owners', () => {
  const f = fixture();
  try {
    const thirdDevice = Number(f.db.prepare("INSERT INTO devices(villager_id,device_uuid) VALUES(?,'outsider')").run(f.third).lastInsertRowid);
    const otherTask = anotherTask(f, f.third);
    journey(f, { villagerId: f.third, deviceId: thirdDevice, taskId: otherTask });
    journey(f, { taskId: otherTask });
    journey(f, { villagerId: f.third, deviceId: thirdDevice });
    journey(f, { recordedAt: '2026-09-18T17:00:00Z' });
    const evidenceTask = anotherTask(f, f.primary, '2026-09-18');
    const evidenceJourney = journey(f);
    collaboration.addProgress(f.db, { taskId: evidenceTask, villagerId: f.primary, deviceId: f.primaryDevice,
      events: [{ clientEventId: 'owned-evidence', eventType: 'journey_started', journeyId: evidenceJourney }] });
    const recovered = journey(f);
    const backup = journey(f, { villagerId: f.backup, deviceId: f.backupDevice, recordedAt: '2026-09-20T01:00:00+08:00' });
    assert.deepEqual(collaboration.getProgress(f.db, f.task, f.primary).journeys.map(j => j.id), [recovered, backup]);
    assert.equal(f.db.prepare('SELECT task_id FROM journeys WHERE id=?').get(recovered).task_id, null, 'viewing must not mutate the database');
  } finally { f.db.close(); }
});

test('progress skips ambiguous orphan tracks and honors record-linked late journeys', () => {
  const f = fixture();
  try {
    const ambiguous = journey(f);
    const otherTask = anotherTask(f);
    assert.equal(collaboration.getProgress(f.db, f.task, f.primary).journeys.length, 0);
    assert.equal(collaboration.getProgress(f.db, otherTask, f.primary).journeys.length, 0);
    const late = journey(f, { recordedAt: '2026-09-21T01:00:00+08:00' });
    f.db.prepare(`INSERT INTO records(client_record_id,task_id,device_id,journey_id,captured_at,
      latitude,longitude,photo_path,photo_sha256) VALUES('late',?,?,?,'2026-09-21T01:00:00+08:00',30,94,'/x','hash')`)
      .run(f.task, f.primaryDevice, late);
    assert.deepEqual(collaboration.getProgress(f.db, f.task, f.primary).journeys.map(j => j.id), [late]);
    f.db.prepare('UPDATE tasks SET journey_id=? WHERE id=?').run(ambiguous, otherTask);
    assert.deepEqual(collaboration.getProgress(f.db, f.task, f.primary).journeys.map(j => j.id), [late]);
  } finally { f.db.close(); }
});

test('backfill honors DATA_DIR, defaults to dry-run, skips ambiguity and is idempotent', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsc-journey-backfill-'));
  const f = fixture(path.join(dataDir, 'bsc-v1.sqlite'));
  try {
    const unique = journey(f);
    const ambiguousTask = anotherTask(f, f.primary, '2026-09-22');
    anotherTask(f, f.primary, '2026-09-22');
    const ambiguous = journey(f, { recordedAt: '2026-09-22T01:00:00+08:00' });
    const outsiderDevice = Number(f.db.prepare("INSERT INTO devices(villager_id,device_uuid) VALUES(?,'outsider')").run(f.third).lastInsertRowid);
    const outsider = journey(f, { villagerId: f.third, deviceId: outsiderDevice });
    const gapTask = anotherTask(f, f.primary, '2026-09-25');
    const gap = journey(f, { recordedAt: '2026-09-24T01:00:00+08:00' });
    f.db.prepare('INSERT INTO track_points(journey_id,sequence,recorded_at,latitude,longitude) VALUES(?,2,?,30,94)')
      .run(gap, '2026-09-26T01:00:00+08:00');
    const lateTask = anotherTask(f, f.primary, '2026-09-27');
    const late = journey(f, { recordedAt: '2026-09-28T01:00:00+08:00' });
    const evidenceTask = anotherTask(f, f.primary, '2026-09-29');
    const evidenceJourney = journey(f, { recordedAt: '2026-09-29T01:00:00+08:00' });
    collaboration.addProgress(f.db, { taskId: f.task, villagerId: f.primary, deviceId: f.primaryDevice,
      events: [{ clientEventId: 'backfill-evidence', eventType: 'journey_started', journeyId: evidenceJourney }] });
    f.db.prepare(`INSERT INTO records(client_record_id,task_id,device_id,captured_at,
      latitude,longitude,photo_path,photo_sha256) VALUES('late-unlinked',?,?,'2026-09-28T01:00:00+08:00',30,94,'/x','hash')`)
      .run(lateTask, f.primaryDevice);
    const tool = path.join(__dirname, '..', 'tools', 'backfill-journey-task.js');
    const run = args => spawnSync(process.execPath, [tool, ...args], { env: { ...process.env, DATA_DIR: dataDir }, encoding: 'utf8' });
    const dry = run([]);
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /DRY-RUN/);
    assert.equal(f.db.prepare('SELECT COUNT(*) count FROM journeys WHERE task_id IS NOT NULL').get().count, 0);
    const apply = run(['--apply']);
    assert.equal(apply.status, 0, apply.stderr);
    assert.equal(f.db.prepare('SELECT task_id FROM journeys WHERE id=?').get(unique).task_id, f.task);
    assert.equal(f.db.prepare('SELECT task_id FROM journeys WHERE id=?').get(late).task_id, lateTask);
    for (const id of [ambiguous, outsider, gap, evidenceJourney]) assert.equal(f.db.prepare('SELECT task_id FROM journeys WHERE id=?').get(id).task_id, null);
    assert.equal(collaboration.getProgress(f.db, ambiguousTask, f.primary).journeys.length, 0);
    assert.equal(collaboration.getProgress(f.db, gapTask, f.primary).journeys.length, 0);
    assert.equal(collaboration.getProgress(f.db, evidenceTask, f.primary).journeys.length, 0);
    const again = run(['--apply']);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /\[APPLIED\] 0 journeys/);
  } finally {
    f.db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
