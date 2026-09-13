'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { initialize } = require('../src/schema');
const collaboration = require('../src/task-collaboration');

function fixture() {
  const db = new DatabaseSync(':memory:');
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
