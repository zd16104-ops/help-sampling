'use strict';

const crypto = require('node:crypto');
const { audit, ensureSingleActiveDeviceIndex } = require('./schema');
const { randomToken } = require('./security');

function policyError(status, message, code) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = fn();
    db.exec('COMMIT');
    return value;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    throw e;
  }
}

function activeDevices(db, villagerId) {
  return db.prepare('SELECT * FROM devices WHERE villager_id=? AND enabled=1 ORDER BY id').all(villagerId);
}

function touch(db, deviceId) {
  // Avoid a write on every mobile request while keeping the online indicator useful.
  db.prepare("UPDATE devices SET last_seen_at=CURRENT_TIMESTAMP WHERE id=? AND (last_seen_at IS NULL OR datetime(last_seen_at)<datetime('now','-1 minute'))").run(deviceId);
}

function listDevices(db, villagerId) {
  const villager = db.prepare('SELECT id,username,display_name,enabled FROM villagers WHERE id=?').get(villagerId);
  if (!villager) throw policyError(404, '采样员不存在', 'VILLAGER_NOT_FOUND');
  const devices = db.prepare(`SELECT d.*, 
      (SELECT COUNT(*) FROM journeys j WHERE j.device_id=d.id AND j.status='active') AS active_journeys,
      (SELECT COUNT(*) FROM tasks t WHERE t.locked_device_id=d.id AND t.status='in_progress' AND t.canceled_at IS NULL) AS locked_tasks
    FROM devices d WHERE d.villager_id=? ORDER BY d.enabled DESC,d.id DESC`).all(villagerId);
  const active = devices.filter(d => d.enabled);
  return { villager, devices, activeDevices: active, conflict: active.length > 1 };
}

function createActivation(db, { villagerId, mode = 'initial', currentDeviceId = null, actor = 'admin', ip = '' }) {
  const purpose = mode === 'replace' ? 'replace' : 'initial';
  const result = transaction(db, () => {
    const villager = db.prepare('SELECT * FROM villagers WHERE id=?').get(villagerId);
    if (!villager) throw policyError(404, '采样员不存在', 'VILLAGER_NOT_FOUND');
    if (!villager.enabled) throw policyError(422, '采样员已停用', 'VILLAGER_DISABLED');
    const active = activeDevices(db, villagerId);
    if (purpose === 'initial' && active.length) throw policyError(409, '该采样员已有有效设备，请使用更换设备', 'ACTIVE_DEVICE_EXISTS');
    if (purpose === 'replace') {
      if (active.length !== 1) throw policyError(409, active.length ? '该采样员存在多台有效设备，请先选择唯一设备' : '该采样员没有可更换的有效设备', active.length ? 'DEVICE_CONFLICT' : 'ACTIVE_DEVICE_MISSING');
      if (Number(currentDeviceId) !== Number(active[0].id)) throw policyError(409, '当前设备状态已变化，请刷新后重新操作', 'ACTIVE_DEVICE_CHANGED');
    }
    const raw = randomToken(24);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const expires = new Date(Date.now() + 24 * 3600_000).toISOString();
    const id = Number(db.prepare('INSERT INTO activation_codes(villager_id,token_hash,expires_at,purpose,current_device_id,created_by) VALUES(?,?,?,?,?,?)').run(villagerId, hash, expires, purpose, purpose === 'replace' ? active[0].id : null, actor).lastInsertRowid);
    audit(db, 'admin', actor, purpose === 'replace' ? 'create_device_replacement' : 'create_activation', 'villager', villagerId, { activationCodeId: id, purpose, currentDeviceId: purpose === 'replace' ? active[0].id : null, expiresAt: expires }, ip);
    return { id, raw, expires, purpose, currentDeviceId: purpose === 'replace' ? active[0].id : null, username: villager.username };
  });
  return result;
}

function closeDeviceWork(db, villagerId, deviceIds) {
  if (!deviceIds.length) return { interruptedJourneys: 0, releasedTasks: 0 };
  const marks = deviceIds.map(() => '?').join(',');
  const journeyResult = db.prepare(`UPDATE journeys SET status='completed',ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP),interrupted=1 WHERE villager_id=? AND device_id IN (${marks}) AND status='active'`).run(villagerId, ...deviceIds);
  const taskResult = db.prepare(`UPDATE tasks SET locked_device_id=NULL,locked_at=NULL,journey_id=NULL,status='assigned',updated_at=CURRENT_TIMESTAMP WHERE villager_id=? AND locked_device_id IN (${marks}) AND canceled_at IS NULL AND id NOT IN (SELECT task_id FROM records WHERE is_primary=1)`).run(villagerId, ...deviceIds);
  return { interruptedJourneys: journeyResult.changes, releasedTasks: taskResult.changes };
}

function redeemActivation(db, { user, activationId, deviceUuid, deviceName = '', androidVersion = '', appVersion = '', actorIp = '' }) {
  const result = transaction(db, () => {
    const act = db.prepare('SELECT * FROM activation_codes WHERE id=? AND villager_id=? AND used_at IS NULL').get(activationId, user.id);
    if (!act) throw policyError(403, '激活二维码已被使用，请让管理员重新生成', 'ACTIVATION_USED');
    if (new Date(act.expires_at) <= new Date()) throw policyError(403, '激活二维码已过期（24小时有效），请让管理员重新生成', 'ACTIVATION_EXPIRED');
    const uuid = String(deviceUuid || '').trim();
    if (!uuid) throw policyError(400, '请填写设备编号', 'DEVICE_UUID_REQUIRED');
    const incoming = db.prepare('SELECT * FROM devices WHERE villager_id=? AND device_uuid=?').get(user.id, uuid);
    const active = activeDevices(db, user.id);
    const purpose = act.purpose || 'initial';
    if (purpose === 'initial' && active.length) throw policyError(409, '该采样员已有有效设备，请使用管理员生成的更换设备二维码', 'ACTIVE_DEVICE_EXISTS');
    if (purpose === 'replace') {
      if (active.length !== 1 || Number(act.current_device_id) !== Number(active[0].id)) throw policyError(409, '当前设备状态已变化，请让管理员重新生成换机二维码', 'ACTIVE_DEVICE_CHANGED');
    }
    const oldIds = active.filter(d => !incoming || d.id !== incoming.id).map(d => d.id);
    let deviceId = incoming ? incoming.id : Number(db.prepare(`INSERT INTO devices(villager_id,device_uuid,device_name,android_version,app_version,enabled,last_seen_at)
        VALUES(?,?,?,?,?,0,CURRENT_TIMESTAMP)`).run(user.id, uuid, String(deviceName), String(androidVersion), String(appVersion)).lastInsertRowid);
    if (oldIds.length) {
      const marks = oldIds.map(() => '?').join(',');
      db.prepare(`UPDATE devices SET enabled=0,disabled_at=CURRENT_TIMESTAMP,disabled_reason='replaced',replaced_by_device_id=? WHERE id IN (${marks})`).run(deviceId, ...oldIds);
      closeDeviceWork(db, user.id, oldIds);
    }
    db.prepare(`UPDATE devices SET enabled=1,device_name=?,android_version=?,app_version=?,last_seen_at=CURRENT_TIMESTAMP,
        disabled_at=NULL,disabled_reason=NULL WHERE id=?`).run(String(deviceName), String(androidVersion), String(appVersion), deviceId);
    db.prepare('UPDATE activation_codes SET used_at=CURRENT_TIMESTAMP WHERE id=? AND used_at IS NULL').run(act.id);
    if (act.purpose === 'replace' || oldIds.length) audit(db, 'mobile', user.id, 'redeem_device_replacement', 'device', deviceId, { oldDeviceIds: oldIds, activationCodeId: act.id }, actorIp);
    else audit(db, 'mobile', user.id, 'activate', 'device', deviceId, { activationCodeId: act.id }, actorIp);
    return { deviceId, oldDeviceIds: oldIds, purpose };
  });
  ensureSingleActiveDeviceIndex(db);
  return result;
}

function selectUniqueDevice(db, villagerId, deviceId, { actor = 'admin', reason = 'legacy_conflict', ip = '' } = {}) {
  const result = transaction(db, () => {
    const villager = db.prepare('SELECT * FROM villagers WHERE id=?').get(villagerId);
    if (!villager) throw policyError(404, '采样员不存在', 'VILLAGER_NOT_FOUND');
    if (!villager.enabled) throw policyError(422, '采样员已停用', 'VILLAGER_DISABLED');
    const selected = db.prepare('SELECT * FROM devices WHERE id=? AND villager_id=?').get(deviceId, villagerId);
    if (!selected) throw policyError(404, '设备不存在', 'DEVICE_NOT_FOUND');
    const others = db.prepare('SELECT id FROM devices WHERE villager_id=? AND enabled=1 AND id<>?').all(villagerId, deviceId).map(d => d.id);
    db.prepare("UPDATE devices SET enabled=0,disabled_at=CURRENT_TIMESTAMP,disabled_reason='legacy_conflict' WHERE villager_id=? AND id<>? AND enabled=1").run(villagerId, deviceId);
    db.prepare('UPDATE devices SET enabled=1,disabled_at=NULL,disabled_reason=NULL WHERE id=?').run(deviceId);
    const work = closeDeviceWork(db, villagerId, others);
    audit(db, 'admin', actor, 'select_unique_device', 'villager', villagerId, { selectedDeviceId: deviceId, disabledDeviceIds: others, reason, ...work }, ip);
    return { selectedDeviceId: deviceId, disabledDeviceIds: others, ...work };
  });
  ensureSingleActiveDeviceIndex(db);
  return result;
}

function revokeDevice(db, deviceId, { actor = 'admin', reason = 'revoked', ip = '' } = {}) {
  return transaction(db, () => {
    const device = db.prepare('SELECT * FROM devices WHERE id=?').get(deviceId);
    if (!device) throw policyError(404, '设备不存在', 'DEVICE_NOT_FOUND');
    if (!device.enabled) return { deviceId, alreadyRevoked: true, interruptedJourneys: 0, releasedTasks: 0 };
    db.prepare("UPDATE devices SET enabled=0,disabled_at=CURRENT_TIMESTAMP,disabled_reason=? WHERE id=?").run(String(reason || 'revoked'), deviceId);
    const work = closeDeviceWork(db, device.villager_id, [deviceId]);
    audit(db, 'admin', actor, 'revoke_device', 'device', deviceId, { reason, ...work }, ip);
    return { deviceId, alreadyRevoked: false, ...work };
  });
}

function renameDevice(db, deviceId, deviceName, { actor = 'admin', ip = '' } = {}) {
  const name = String(deviceName || '').trim().slice(0, 120);
  if (!name) throw policyError(400, '请填写设备名称', 'DEVICE_NAME_REQUIRED');
  const device = db.prepare('SELECT id,villager_id,device_name FROM devices WHERE id=?').get(deviceId);
  if (!device) throw policyError(404, '设备不存在', 'DEVICE_NOT_FOUND');
  db.prepare('UPDATE devices SET device_name=? WHERE id=?').run(name, deviceId);
  audit(db, 'admin', actor, 'rename_device', 'device', deviceId, { before: device.device_name, after: name }, ip);
  return { deviceId, deviceName: name };
}

function setVillagerEnabled(db, villagerId, enabled, displayName, { actor = 'admin', ip = '' } = {}) {
  return transaction(db, () => {
    const villager = db.prepare('SELECT * FROM villagers WHERE id=?').get(villagerId);
    if (!villager) throw policyError(404, '采样员不存在', 'VILLAGER_NOT_FOUND');
    const active = activeDevices(db, villagerId);
    db.prepare('UPDATE villagers SET display_name=?,enabled=? WHERE id=?').run(String(displayName || villager.display_name), enabled ? 1 : 0, villagerId);
    let work = { interruptedJourneys: 0, releasedTasks: 0 };
    if (!enabled && active.length) {
      const ids = active.map(d => d.id);
      const marks = ids.map(() => '?').join(',');
      db.prepare(`UPDATE devices SET enabled=0,disabled_at=CURRENT_TIMESTAMP,disabled_reason='villager_disabled' WHERE id IN (${marks})`).run(...ids);
      work = closeDeviceWork(db, villagerId, ids);
    }
    audit(db, 'admin', actor, enabled ? 'enable_villager' : 'disable_villager', 'villager', villagerId, { enabled: enabled ? 1 : 0, activeDeviceIds: active.map(d => d.id), ...work }, ip);
    return { ok: true, enabled: enabled ? 1 : 0, ...work };
  });
}

module.exports = { policyError, activeDevices, touch, listDevices, createActivation, redeemActivation, selectUniqueDevice, revokeDevice, renameDevice, setVillagerEnabled };
