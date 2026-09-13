'use strict';

const TAKEOVER_CODE = '1234';
const TAKEOVER_COOLDOWN_SECONDS = 60;
const TAKEOVER_REASONS = new Set([
  'PRIMARY_CANNOT_ARRIVE',
  'DEVICE_FAILURE',
  'PRIMARY_UNREACHABLE',
  'SCHEDULE_CHANGED',
  'ADMIN_ON_SITE_REPLACEMENT',
  'OTHER'
]);
const PROGRESS_TYPES = new Set([
  'journey_started', 'arrived', 'qr_scanned', 'photo_captured',
  'record_saved_local', 'record_submitted'
]);

function fault(status, code, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  Object.assign(error, extra);
  return error;
}

function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = work();
    db.exec('COMMIT');
    return value;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

function rawTask(db, taskId) {
  return db.prepare(`SELECT t.*,
      primary_user.display_name primary_villager_name,
      backup_user.display_name backup_villager_name,
      active_user.display_name active_villager_name,
      final_user.display_name final_villager_name
    FROM tasks t
    JOIN villagers primary_user ON primary_user.id=t.villager_id
    LEFT JOIN villagers backup_user ON backup_user.id=t.backup_villager_id
    LEFT JOIN villagers active_user ON active_user.id=COALESCE(t.active_villager_id,t.villager_id)
    LEFT JOIN villagers final_user ON final_user.id=t.final_villager_id
    WHERE t.id=?`).get(Number(taskId));
}

function isParticipant(task, villagerId) {
  const id = Number(villagerId);
  return id === Number(task.villager_id) || id === Number(task.backup_villager_id || 0);
}

function participantTask(db, taskId, villagerId) {
  const task = rawTask(db, taskId);
  if (!task || !isParticipant(task, villagerId)) throw fault(404, 'TASK_NOT_FOUND', '任务不存在或未分配给本人');
  return task;
}

function activeVillagerId(task) {
  return Number(task.active_villager_id || task.villager_id);
}

function assertActive(db, taskId, villagerId) {
  const task = participantTask(db, taskId, villagerId);
  if (task.canceled_at || task.status === 'submitted') throw fault(422, 'TASK_FINISHED', '任务已完成或已取消');
  if (activeVillagerId(task) !== Number(villagerId)) throw fault(403, 'NOT_ACTIVE_COLLECTOR', '当前只能查看进度，如需采样请先接管任务');
  return task;
}

function assignmentPayload(task, viewerId) {
  const activeId = activeVillagerId(task);
  return {
    primaryVillagerId: Number(task.villager_id),
    primaryVillagerName: task.primary_villager_name || '',
    backupVillagerId: task.backup_villager_id == null ? null : Number(task.backup_villager_id),
    backupVillagerName: task.backup_villager_name || '',
    activeVillagerId: activeId,
    activeVillagerName: task.active_villager_name || '',
    finalVillagerId: task.final_villager_id == null ? null : Number(task.final_villager_id),
    finalVillagerName: task.final_villager_name || '',
    assignmentVersion: Number(task.assignment_version || 1),
    handoverCount: Number(task.handover_count || 0),
    lastHandoverAt: task.last_handover_at || null,
    viewerRole: Number(viewerId) === Number(task.villager_id) ? 'primary' : Number(viewerId) === Number(task.backup_villager_id || 0) ? 'backup' : 'admin',
    canSample: Number(viewerId) === activeId && !task.canceled_at && task.status !== 'submitted',
    canTakeover: isParticipant(task, viewerId) && Number(viewerId) !== activeId && !task.canceled_at && task.status !== 'submitted'
  };
}

function markAssigned(db, taskId, primaryVillagerId, backupVillagerId, actor = 'admin') {
  const task = rawTask(db, taskId);
  if (!task) throw fault(404, 'TASK_NOT_FOUND', '任务不存在');
  db.prepare(`INSERT INTO task_assignment_events
    (task_id,event_type,from_villager_id,to_villager_id,actor_role,actor_id,reason_code,assignment_version)
    VALUES(?,?,?,?,?,?,?,?)`).run(taskId, 'assigned', null, primaryVillagerId, 'admin', actor, backupVillagerId ? 'WITH_BACKUP' : 'PRIMARY_ONLY', task.assignment_version || 1);
}

function takeover(db, { taskId, villagerId, deviceId, confirmationCode, reasonCode, reasonText, expectedVersion, clientRequestId }) {
  if (String(confirmationCode || '') !== TAKEOVER_CODE) throw fault(403, 'INVALID_CONFIRMATION_CODE', '确认码错误，请输入 1234');
  const reason = String(reasonCode || '').trim();
  if (!TAKEOVER_REASONS.has(reason)) throw fault(422, 'TAKEOVER_REASON_REQUIRED', '请选择接管原因');
  const detail = String(reasonText || '').trim();
  if (reason === 'OTHER' && !detail) throw fault(422, 'TAKEOVER_REASON_REQUIRED', '选择其他原因时必须填写说明');
  const requestId = String(clientRequestId || '').trim();
  if (!requestId || requestId.length > 100) throw fault(400, 'CLIENT_REQUEST_ID_REQUIRED', '接管请求编号无效');

  return transaction(db, () => {
    const duplicate = db.prepare('SELECT task_id,assignment_version,to_villager_id FROM task_assignment_events WHERE client_request_id=?').get(requestId);
    if (duplicate) {
      const current = rawTask(db, duplicate.task_id);
      return { idempotent: true, task: current, assignment: assignmentPayload(current, villagerId), cooldownSeconds: TAKEOVER_COOLDOWN_SECONDS };
    }
    const task = participantTask(db, taskId, villagerId);
    if (task.canceled_at || task.status === 'submitted') throw fault(422, 'TASK_FINISHED', '任务已完成或已取消');
    const currentId = activeVillagerId(task);
    if (currentId === Number(villagerId)) throw fault(409, 'ALREADY_ACTIVE_COLLECTOR', '本人已经是当前采样人');
    if (Number(expectedVersion) !== Number(task.assignment_version || 1)) throw fault(409, 'ASSIGNMENT_CHANGED', '采样权已变化，请刷新任务后重试');
    const cooldown = db.prepare(`SELECT CAST(MAX(0,ROUND((julianday(last_handover_at,'+${TAKEOVER_COOLDOWN_SECONDS} seconds')-julianday('now'))*86400)) AS INTEGER) remaining FROM tasks WHERE id=?`).get(taskId);
    if (task.last_handover_at && Number(cooldown.remaining || 0) > 0) {
      throw fault(409, 'TAKEOVER_COOLDOWN', `请等待 ${cooldown.remaining} 秒后再接管`, { retryAfterSeconds: Number(cooldown.remaining) });
    }
    const updated = db.prepare(`UPDATE tasks SET active_villager_id=?,assignment_version=assignment_version+1,
      handover_count=handover_count+1,last_handover_at=CURRENT_TIMESTAMP,locked_device_id=NULL,locked_at=NULL,
      journey_id=NULL,status=CASE WHEN status='saved_pending_upload' THEN 'in_progress' ELSE status END,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND assignment_version=? AND COALESCE(active_villager_id,villager_id)<>? AND status<>'submitted' AND canceled_at IS NULL`)
      .run(villagerId, taskId, expectedVersion, villagerId);
    if (Number(updated.changes || 0) !== 1) throw fault(409, 'ASSIGNMENT_CHANGED', '采样权已变化，请刷新任务后重试');
    const next = rawTask(db, taskId);
    db.prepare(`UPDATE journeys SET status='interrupted',interrupted=1,ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP)
      WHERE task_id=? AND status='active' AND assignment_version<?`).run(taskId, next.assignment_version);
    db.prepare(`INSERT INTO task_assignment_events
      (task_id,event_type,from_villager_id,to_villager_id,actor_role,actor_id,client_request_id,reason_code,reason_text,assignment_version)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(taskId, 'takeover', currentId, villagerId, 'mobile', String(villagerId), requestId, reason, detail, next.assignment_version);
    return { idempotent: false, task: next, assignment: assignmentPayload(next, villagerId), cooldownSeconds: TAKEOVER_COOLDOWN_SECONDS, deviceId: Number(deviceId) };
  });
}

function updateAssignees(db, { taskId, primaryVillagerId, backupVillagerId, reason, actor = 'admin' }) {
  const primaryId = Number(primaryVillagerId);
  const backupId = backupVillagerId == null || backupVillagerId === '' ? null : Number(backupVillagerId);
  const reasonText = String(reason || '').trim();
  if (!reasonText) throw fault(422, 'ASSIGNMENT_REASON_REQUIRED', '请填写调整采样人的原因');
  if (!Number.isInteger(primaryId) || primaryId <= 0) throw fault(422, 'PRIMARY_REQUIRED', '请选择主采样人');
  if (backupId != null && (!Number.isInteger(backupId) || backupId <= 0 || backupId === primaryId)) throw fault(422, 'INVALID_BACKUP', '备用采样人不能与主采样人相同');
  const ids = backupId == null ? [primaryId] : [primaryId, backupId];
  const enabled = db.prepare(`SELECT COUNT(*) count FROM villagers WHERE enabled=1 AND id IN (${ids.map(() => '?').join(',')})`).get(...ids).count;
  if (Number(enabled) !== ids.length) throw fault(422, 'VILLAGER_DISABLED', '采样人不存在或已停用');

  return transaction(db, () => {
    const task = rawTask(db, taskId);
    if (!task) throw fault(404, 'TASK_NOT_FOUND', '任务不存在');
    if (task.canceled_at || task.status === 'submitted') throw fault(422, 'TASK_FINISHED', '已完成或已取消任务不能调整人员');
    const hasProgress = Number(db.prepare('SELECT COUNT(*) count FROM task_progress_events WHERE task_id=?').get(taskId).count) > 0 ||
      Number(db.prepare('SELECT COUNT(*) count FROM records WHERE task_id=?').get(taskId).count) > 0 ||
      Number(task.handover_count || 0) > 0 || task.status !== 'assigned';
    if (hasProgress) {
      if (primaryId !== Number(task.villager_id)) throw fault(422, 'PRIMARY_LOCKED', '任务已有进度，不能更换主采样人');
      if (activeVillagerId(task) === Number(task.backup_villager_id || 0)) throw fault(422, 'BACKUP_IS_ACTIVE', '备用采样人正在采样，请先由主采样人重新接管');
    }
    const nextVersion = Number(task.assignment_version || 1) + 1;
    db.prepare(`UPDATE tasks SET villager_id=?,backup_villager_id=?,active_villager_id=?,assignment_version=?,
      locked_device_id=NULL,locked_at=NULL,journey_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(primaryId, backupId, hasProgress ? activeVillagerId(task) : primaryId, nextVersion, taskId);
    db.prepare(`INSERT INTO task_assignment_events
      (task_id,event_type,from_villager_id,to_villager_id,actor_role,actor_id,reason_code,reason_text,assignment_version)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(taskId, 'assignees_changed', task.backup_villager_id, backupId, 'admin', actor, 'ADMIN_CHANGE', reasonText, nextVersion);
    const next = rawTask(db, taskId);
    return { task: next, assignment: assignmentPayload(next, 0) };
  });
}

function eventScope(task, villagerId, version) {
  const currentVersion = Number(task.assignment_version || 1);
  if (Number(version) === currentVersion && activeVillagerId(task) === Number(villagerId)) return 'active';
  if (Number(version) < currentVersion) return 'pre_handover';
  return 'stale_after_handover';
}

function addProgress(db, { taskId, villagerId, deviceId, events }) {
  const task = participantTask(db, taskId, villagerId);
  const input = Array.isArray(events) ? events.slice(0, 100) : [];
  if (!input.length) throw fault(400, 'PROGRESS_REQUIRED', '请提供进度事件');
  return transaction(db, () => {
    let accepted = 0;
    const scopes = [];
    for (const item of input) {
      const clientId = String(item.clientEventId || '').trim();
      const type = String(item.eventType || '').trim();
      if (!clientId || clientId.length > 100 || !PROGRESS_TYPES.has(type)) throw fault(422, 'INVALID_PROGRESS_EVENT', '进度事件无效');
      const version = Number(item.assignmentVersion || 1);
      const scope = eventScope(task, villagerId, version);
      const metadata = JSON.stringify(item.metadata && typeof item.metadata === 'object' ? item.metadata : {});
      if (metadata.length > 20_000) throw fault(413, 'PROGRESS_METADATA_TOO_LARGE', '进度详情过大');
      const duplicate = db.prepare('SELECT id FROM task_progress_events WHERE client_event_id=?').get(clientId);
      if (duplicate) {
        scopes.push({ clientEventId: clientId, scope });
        continue;
      }
      const result = db.prepare(`INSERT INTO task_progress_events
        (client_event_id,task_id,event_type,villager_id,device_id,journey_id,assignment_version,occurred_at,evidence_scope,metadata)
        VALUES(?,?,?,?,?,?,?,?,?,?)`).run(clientId, taskId, type, villagerId, deviceId, item.journeyId || null, version,
        String(item.occurredAt || new Date().toISOString()), scope, metadata);
      accepted += Number(result.changes || 0);
      scopes.push({ clientEventId: clientId, scope });
      if (result.changes && scope === 'active' && type === 'record_saved_local' && task.status !== 'submitted') {
        db.prepare("UPDATE tasks SET status='saved_pending_upload',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(taskId);
      } else if (result.changes && scope === 'active' && ['journey_started','arrived','qr_scanned','photo_captured'].includes(type) && task.status === 'assigned') {
        db.prepare("UPDATE tasks SET status='in_progress',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(taskId);
      }
    }
    return { accepted, received: input.length, scopes };
  });
}

function getProgress(db, taskId, viewerId = 0, isAdmin = false) {
  const task = rawTask(db, taskId);
  if (!task) throw fault(404, 'TASK_NOT_FOUND', '任务不存在');
  if (!isAdmin && !isParticipant(task, viewerId)) throw fault(404, 'TASK_NOT_FOUND', '任务不存在或未分配给本人');
  const assignmentEvents = db.prepare(`SELECT e.*,fv.display_name from_name,tv.display_name to_name
    FROM task_assignment_events e LEFT JOIN villagers fv ON fv.id=e.from_villager_id LEFT JOIN villagers tv ON tv.id=e.to_villager_id
    WHERE e.task_id=? ORDER BY e.created_at,e.id`).all(taskId);
  const progressEvents = db.prepare(`SELECT e.*,v.display_name villager_name,d.device_name
    FROM task_progress_events e JOIN villagers v ON v.id=e.villager_id JOIN devices d ON d.id=e.device_id
    WHERE e.task_id=? ORDER BY e.occurred_at,e.id`).all(taskId).map(e => ({ ...e, metadata: parseJson(e.metadata, {}) }));
  const journeys = db.prepare(`SELECT j.id,j.villager_id,j.device_id,j.assignment_version,j.status,j.started_at,j.ended_at,
      j.interrupted,j.start_distance_m,v.display_name villager_name,d.device_name,
      (SELECT COUNT(*) FROM track_points tp WHERE tp.journey_id=j.id) track_point_count
    FROM journeys j JOIN villagers v ON v.id=j.villager_id JOIN devices d ON d.id=j.device_id
    WHERE j.task_id=? OR j.id=(SELECT journey_id FROM tasks WHERE id=?)
    ORDER BY j.started_at,j.id`).all(taskId, taskId);
  const records = db.prepare(`SELECT r.id,r.client_record_id,r.is_primary,r.conflict_status,r.assignment_version,r.evidence_scope,
      r.captured_at,r.received_at,r.photo_path,r.review_status,r.risk_flags,d.villager_id,v.display_name villager_name,d.device_name
    FROM records r JOIN devices d ON d.id=r.device_id JOIN villagers v ON v.id=d.villager_id
    WHERE r.task_id=? ORDER BY r.captured_at,r.id`).all(taskId).map(r => ({ ...r, risk_flags: parseJson(r.risk_flags, []) }));
  const live = db.prepare(`SELECT l.*,d.villager_id,v.display_name villager_name
    FROM live_locations l JOIN devices d ON d.id=l.device_id JOIN villagers v ON v.id=d.villager_id WHERE l.task_id=?`).get(taskId) || null;
  return { task, assignment: assignmentPayload(task, isAdmin ? 0 : viewerId), assignmentEvents, progressEvents, journeys, records, live };
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function getDefaultBackup(db, projectId) {
  const row = db.prepare(`SELECT s.default_backup_villager_id,v.display_name
    FROM sampling_settings s LEFT JOIN villagers v ON v.id=s.default_backup_villager_id WHERE s.project_id=?`).get(Number(projectId));
  return { projectId: Number(projectId), defaultBackupVillagerId: row && row.default_backup_villager_id != null ? Number(row.default_backup_villager_id) : null, defaultBackupVillagerName: row ? row.display_name || '' : '' };
}

function setDefaultBackup(db, projectId, villagerId) {
  const id = villagerId == null || villagerId === '' ? null : Number(villagerId);
  if (id != null && !db.prepare('SELECT id FROM villagers WHERE id=? AND enabled=1').get(id)) throw fault(422, 'VILLAGER_DISABLED', '默认备用采样人不存在或已停用');
  if (!db.prepare('SELECT id FROM projects WHERE id=?').get(Number(projectId))) throw fault(404, 'PROJECT_NOT_FOUND', '项目不存在');
  db.prepare(`INSERT INTO sampling_settings(project_id,default_backup_villager_id,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(project_id) DO UPDATE SET default_backup_villager_id=excluded.default_backup_villager_id,updated_at=CURRENT_TIMESTAMP`).run(Number(projectId), id);
  return getDefaultBackup(db, projectId);
}

module.exports = {
  TAKEOVER_CODE,
  TAKEOVER_COOLDOWN_SECONDS,
  TAKEOVER_REASONS,
  fault,
  rawTask,
  isParticipant,
  participantTask,
  activeVillagerId,
  assertActive,
  assignmentPayload,
  markAssigned,
  takeover,
  updateAssignees,
  addProgress,
  getProgress,
  getDefaultBackup,
  setDefaultBackup
};
