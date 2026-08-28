'use strict';

// API integration tests. A single server instance runs in-process against a
// throwaway DATA_DIR; a second read/write connection to the same SQLite file
// simulates time and device-state manipulation (expired activation codes,
// 12-hour lock expiry, disabled devices) that the API cannot express.
//
// Run: node --test test/api.test.js  (or npm test)

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bsc-test-'));
const PORT = 21000 + Math.floor(Math.random() * 20000);
process.env.DATA_DIR = DATA_DIR;
process.env.PORT = String(PORT);
process.env.ADMIN_PASSWORD = 'TestAdmin-2608!';
process.env.PUBLIC_BASE_URL = 'https://bsc.gpsgps.online';
const BASE = `http://127.0.0.1:${PORT}`;

const server = require('../src/server.js');
const dbFile = path.join(DATA_DIR, 'bsc-v1.sqlite');
let rawDb; // test-only connection to the server database

async function call(method, p, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + p, { method, headers, body: body == null ? undefined : JSON.stringify(body) });
  let json = {};
  try { json = await res.json(); } catch {}
  return { status: res.status, json, raw: res };
}

async function jpegDataUrl(size = 320) {
  const buf = await sharp({ create: { width: size, height: Math.round(size * 0.75), channels: 3, background: '#2e8b57' } }).jpeg().toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

let adminToken;
let mobileA; // device A token (villager cmy01)
let mobileB; // device B token (same villager, different device)
let villagerId;
let site5Id;
const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);

async function adminCreateTask(extra = {}) {
  const res = await call('POST', '/api/v1/admin/tasks', {
    siteId: site5Id, villagerId, plannedDate: today, sampleTypes: ['R'], ...extra
  }, adminToken);
  assert.equal(res.status, 201, `create task: ${JSON.stringify(res.json)}`);
  return res.json.ids[0];
}

async function syncTask(token, taskId) {
  const res = await call('GET', '/api/v1/mobile/sync', null, token);
  assert.equal(res.status, 200);
  return res.json.tasks.find(t => t.id === taskId);
}

async function newDeviceToken(prefix) {
  const act = await call('POST', `/api/v1/admin/villagers/${villagerId}/activation`, {}, adminToken);
  assert.equal(act.status, 201);
  const [, , user, raw] = String(act.json.value).split('|');
  const res = await call('POST', '/api/v1/mobile/activate', {
username: user, activationToken: raw, deviceUuid: `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    deviceName: 'Test', androidVersion: '15', appVersion: '1.0.0'
  });
  assert.equal(res.status, 200, `activate ${prefix}: ${JSON.stringify(res.json)}`);
  return res.json.token;
}

before(async () => {
  // Wait for the server to start listening.
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`${BASE}/health`); if (r.ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const health = await fetch(`${BASE}/health`);
  assert.equal(health.status, 200, 'server must be reachable');
  rawDb = new DatabaseSync(dbFile);
  rawDb.exec('PRAGMA busy_timeout=5000');
});

after(() => { server.close(); try { rawDb.close(); } catch {} });

test('admin login with correct password', async () => {
  const res = await call('POST', '/api/v1/admin/login', { password: 'TestAdmin-2608!' });
  assert.equal(res.status, 200);
  adminToken = res.json.token;
  assert.ok(adminToken);
});

test('bootstrap and seeded data', async () => {
  const res = await call('GET', '/api/v1/admin/bootstrap', null, adminToken);
  assert.equal(res.status, 200);
  assert.ok(res.json.projects.length >= 2);
  villagerId = res.json.villagers.find(v => v.username === 'cmy01').id;
  assert.ok(villagerId);
  const sites = await call('GET', '/api/v1/admin/sites?projectId=1', null, adminToken);
  assert.equal(sites.status, 200);
  assert.equal(sites.json.sites.length, 25);
  site5Id = sites.json.sites.find(s => s.code === '5').id;
  assert.ok(site5Id);
});

test('static admin page served at /', async () => {
  const res = await fetch(`${BASE}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /水样采集|管理平台/);
});

test('path traversal blocked', async () => {
  assert.equal((await fetch(`${BASE}/uploads/../config.json`)).status, 404);
  assert.equal((await fetch(`${BASE}/reference/../config.json`)).status, 404);
  assert.equal((await fetch(`${BASE}/%2e%2e/config.json`)).status, 404);
  assert.equal((await fetch(`${BASE}/../../package.json`)).status, 404);
});

test('activation + login flow', async () => {
  const act = await call('POST', `/api/v1/admin/villagers/${villagerId}/activation`, {}, adminToken);
  assert.equal(act.status, 201);
  assert.match(act.json.value, /^BSC-ACT\|https:\/\/bsc\.gpsgps\.online\|cmy01\|/);
  const [, , user, raw] = act.json.value.split('|');
  const res = await call('POST', '/api/v1/mobile/activate', {
    username: user, activationToken: raw, deviceUuid: 'test-device-A',
    deviceName: 'Test A', androidVersion: '15', appVersion: '1.0.0'
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.villager.username, 'cmy01');
  mobileA = res.json.token;
  const login = await call('POST', '/api/v1/mobile/login', { username: 'cmy01', deviceUuid: 'test-device-A' });
  assert.equal(login.status, 200);
});

test('activation token single-use and expiry', async () => {
  const act = await call('POST', `/api/v1/admin/villagers/${villagerId}/activation`, {}, adminToken);
  const [, , user, raw] = act.json.value.split('|');
  const once = await call('POST', '/api/v1/mobile/activate', { username: user, activationToken: raw, deviceUuid: 'replay-device' });
  assert.equal(once.status, 200);
  const replay = await call('POST', '/api/v1/mobile/activate', { username: user, activationToken: raw, deviceUuid: 'replay-device-2' });
  assert.equal(replay.status, 403, 'replayed token rejected');
  // Expired code inserted directly (simulates >24h old activation QR).
  const expiredHash = crypto.createHash('sha256').update('expired-token').digest('hex');
  rawDb.prepare('INSERT INTO activation_codes(villager_id,token_hash,expires_at) VALUES(?,?,?)').run(villagerId, expiredHash, '2020-01-01T00:00:00.000Z');
  const expired = await call('POST', '/api/v1/mobile/activate', { username: 'cmy01', activationToken: 'expired-token', deviceUuid: 'expired-device' });
  assert.equal(expired.status, 403, 'expired token rejected');
});

test('unknown account rejected; unactivated device rejected', async () => {
  const bad = await call('POST', '/api/v1/mobile/login', { username: 'no-such-user', deviceUuid: 'test-device-A' });
  assert.equal(bad.status, 401);
  const unactivated = await call('POST', '/api/v1/mobile/login', { username: 'cmy01', deviceUuid: 'never-activated' });
  assert.equal(unactivated.status, 403);
});

test('task code generation sequential and concurrent uniqueness', async () => {
  const first = await adminCreateTask();
  const second = await adminCreateTask();
  const codes = [await syncTask(mobileA, first), await syncTask(mobileA, second)].map(t => t.sample_code);
  assert.match(codes[0], /-01$/);
  assert.match(codes[1], /-02$/);
  assert.notEqual(codes[0], codes[1]);
  // Concurrent creations still produce unique codes (transaction + count).
  const ids = await Promise.all(Array.from({ length: 5 }, () => adminCreateTask()));
  const concurrentCodes = (await Promise.all(ids.map(id => syncTask(mobileA, id)))).map(t => t.sample_code);
  assert.equal(new Set(concurrentCodes).size, 5, 'concurrent codes unique');
  const base = `${today.slice(2).replaceAll('-', '')}-R-5-`;
  for (const c of concurrentCodes) assert.match(c, new RegExp(`^${base.replace('.', '\\.')}\\d{2}$`));
});

test('first-device lock blocks second device (423), expiry releases after 12h', async () => {
  mobileB = await newDeviceToken('test-device-B');
  const taskId = await adminCreateTask();
  const task = await syncTask(mobileA, taskId);
  const startA = await call('POST', `/api/v1/mobile/tasks/${taskId}/start`, { latitude: 30.07534404, longitude: 94.14583272, accuracyM: 3 }, mobileA);
  assert.equal(startA.status, 200);
  assert.equal(startA.json.weakEvidence, true);
  const startB = await call('POST', `/api/v1/mobile/tasks/${taskId}/start`, { latitude: 30.07534404, longitude: 94.14583272, accuracyM: 3 }, mobileB);
  assert.equal(startB.status, 423, 'locked to device A');
  // Simulate a lock older than 12 hours, then the lock must expire.
  rawDb.prepare("UPDATE tasks SET locked_at=datetime('now','-13 hours') WHERE id=?").run(taskId);
  const startB2 = await call('POST', `/api/v1/mobile/tasks/${taskId}/start`, { latitude: 30.07534404, longitude: 94.14583272, accuracyM: 3 }, mobileB);
  assert.equal(startB2.status, 200, 'expired lock released');
  assert.ok(task.qr_token, 'sync payload carries qr token');
});

test('track upload with sequence dedup', async () => {
  const taskId = await adminCreateTask();
  const start = await call('POST', `/api/v1/mobile/tasks/${taskId}/start`, { latitude: 30.07534404, longitude: 94.14583272, accuracyM: 3 }, mobileA);
  const journeyId = start.json.journey.id;
  const points = [0, 1, 2].map(i => ({ sequence: i, recordedAt: new Date().toISOString(), latitude: 30.075 + i * 0.00001, longitude: 94.1458, accuracyM: 4, speedMps: 1, mockLocation: false }));
  const up = await call('POST', `/api/v1/mobile/journeys/${journeyId}/track`, { points }, mobileA);
  assert.equal(up.status, 200);
  assert.equal(up.json.inserted, 3);
  const again = await call('POST', `/api/v1/mobile/journeys/${journeyId}/track`, { points: [{ sequence: 1, recordedAt: new Date().toISOString(), latitude: 0, longitude: 0, accuracyM: 4 }] }, mobileA);
  assert.equal(again.status, 200);
  assert.equal(again.json.inserted, 1, 'duplicate sequence ignored');
});

async function boundaryRecord(offsetM, extra = {}, taskExtra = {}) {
  const taskId = await adminCreateTask(taskExtra);
  const task = await syncTask(mobileA, taskId);
  const photo = await jpegDataUrl();
  const res = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, {
    clientRecordId: `b-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404 + offsetM / 111200,
    longitude: 94.14583272,
    accuracyM: 5,
    weatherText: '晴 12℃',
    noWater: false, manualCode: false, qrToken: task.qr_token,
    exceptionCategory: '', exceptionDetail: '', mockLocation: false, offlineStart: false,
    photoDataUrl: photo, ...extra
  }, mobileA);
  return { taskId, res };
}

test('30/80/300 m boundary rules and mandatory exception reason', async () => {
  const within = await boundaryRecord(25);
  assert.equal(within.res.status, 201);
  assert.ok(!within.res.json.riskFlags.includes('distance_30_80m'));
  assert.ok(!within.res.json.riskFlags.includes('distance_80_300m'));
  const midNoReason = await boundaryRecord(50);
  assert.equal(midNoReason.res.status, 201, '30-80m without reason accepted (需求变更：距离过远不再强制选原因)');
  assert.ok(midNoReason.res.json.riskFlags.includes('distance_30_80m'));
  const mid = await boundaryRecord(50, { exceptionCategory: '河岸无法靠近' });
  assert.equal(mid.res.status, 201);
  assert.ok(mid.res.json.riskFlags.includes('distance_30_80m'));
  const far = await boundaryRecord(100, { exceptionCategory: '道路中断' });
  assert.equal(far.res.status, 201);
  assert.ok(far.res.json.riskFlags.includes('distance_80_300m'));
  const beyond = await boundaryRecord(350, { exceptionCategory: '其他' });
  assert.equal(beyond.res.status, 422, '>300m hard limit');
});

test('risk flags: accuracy, manual code, mock location, offline start, late sampling, canceled, missing track, duplicate photo, no water', async () => {
  const badAccuracy = await boundaryRecord(10, { accuracyM: 45 });
  assert.ok(badAccuracy.res.json.riskFlags.includes('gps_accuracy_over_40m'));
  const taskManual = await adminCreateTask();
  const manualTask = await syncTask(mobileA, taskManual);
  const manual = await call('POST', `/api/v1/mobile/tasks/${taskManual}/record`, {
    clientRecordId: `m-${Date.now()}`, capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: true, submittedCode: manualTask.sample_code, qrToken: '',
    exceptionCategory: '二维码损坏', exceptionDetail: '', mockLocation: false, offlineStart: false,
    photoDataUrl: await jpegDataUrl()
  }, mobileA);
  assert.equal(manual.status, 201);
  assert.ok(manual.json.riskFlags.includes('manual_bottle_code'));
  const manualWrong = await call('POST', `/api/v1/mobile/tasks/${taskManual}/record`, {
    clientRecordId: `m2-${Date.now()}`, capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: true, submittedCode: 'WRONG-CODE', qrToken: '',
    exceptionCategory: '二维码损坏', exceptionDetail: '', mockLocation: false, offlineStart: false,
    photoDataUrl: await jpegDataUrl()
  }, mobileA);
  assert.equal(manualWrong.status, 422, 'manual code must match exactly');
  const mock = await boundaryRecord(10, { mockLocation: true, offlineStart: true });
  assert.ok(mock.res.json.riskFlags.includes('mock_location'));
  assert.ok(mock.res.json.riskFlags.includes('offline_start_lock_unverified'));
  const late = await boundaryRecord(10, { capturedAt: `${today}T08:00:00+08:00` }, { plannedDate: tomorrow });
  assert.ok(late.res.json.riskFlags.includes('late_sampling'));
  const cancelTaskId = await adminCreateTask();
  const canceledTask = await syncTask(mobileA, cancelTaskId); // 取消前手机已缓存该任务
  const cancel = await call('POST', `/api/v1/admin/tasks/${cancelTaskId}/cancel`, { reason: '测试取消' }, adminToken);
  assert.equal(cancel.status, 200);
  const afterCancelSync = await call('GET', '/api/v1/mobile/sync', null, mobileA);
  assert.equal(afterCancelSync.status, 200);
  assert.ok(!afterCancelSync.json.tasks.some(t => t.id === cancelTaskId), '已取消任务不再下发到手机端');
  const afterCancel = await call('POST', `/api/v1/mobile/tasks/${cancelTaskId}/record`, {
    clientRecordId: `c-${Date.now()}`, capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: false, qrToken: canceledTask.qr_token, exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: true, photoDataUrl: await jpegDataUrl()
  }, mobileA);
  assert.equal(afterCancel.status, 201, 'offline record after cancel still accepted for review');
  assert.ok(afterCancel.json.riskFlags.includes('task_canceled'));
  const missing = await boundaryRecord(10);
  assert.ok(missing.res.json.riskFlags.includes('missing_track'));
  // Two records made from the exact same photo bytes → duplicate_photo risk.
  const dupPhoto = await jpegDataUrl(400);
  const dupFirst = await boundaryRecord(10, { photoDataUrl: dupPhoto });
  assert.equal(dupFirst.res.status, 201);
  assert.ok(!dupFirst.res.json.riskFlags.includes('duplicate_photo'));
  const dupSecond = await boundaryRecord(10, { photoDataUrl: dupPhoto });
  assert.equal(dupSecond.res.status, 201);
  assert.ok(dupSecond.res.json.riskFlags.includes('duplicate_photo'));
  const noWaterTask = await adminCreateTask();
  const noWater = await call('POST', `/api/v1/mobile/tasks/${noWaterTask}/record`, {
    clientRecordId: `nw-${Date.now()}`, capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: true, manualCode: false, qrToken: '', exceptionCategory: '无水', exceptionDetail: '',
    mockLocation: false, offlineStart: false, photoDataUrl: await jpegDataUrl()
  }, mobileA);
  assert.equal(noWater.status, 201, 'no-water record without bottle accepted');
  const noWaterNoReason = await call('POST', `/api/v1/mobile/tasks/${noWaterTask}/record`, {
    clientRecordId: `nw2-${Date.now()}`, capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: true, manualCode: false, qrToken: '', exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: false, photoDataUrl: await jpegDataUrl()
  }, mobileA);
  assert.equal(noWaterNoReason.status, 422, 'no-water requires reason');
});

test('qr mismatch, conflict records and idempotent retry', async () => {
  const taskId = await adminCreateTask();
  const task = await syncTask(mobileA, taskId);
  const photo = await jpegDataUrl();
  const body = {
    clientRecordId: `cm-${Date.now()}`, capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: false, qrToken: task.qr_token, exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: false, photoDataUrl: photo
  };
  const wrong = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, { ...body, clientRecordId: `cm2-${Date.now()}`, qrToken: 'wrong' }, mobileA);
  assert.equal(wrong.status, 422, 'qr mismatch rejected');
  const first = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, body, mobileA);
  assert.equal(first.status, 201);
  assert.equal(first.json.primary, true);
  const retry = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, body, mobileA);
  assert.equal(retry.status, 200);
  assert.equal(retry.json.id, first.json.id);
  assert.equal(retry.json.idempotent, true);
  const conflict = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, { ...body, clientRecordId: `cm3-${Date.now()}` }, mobileA);
  assert.equal(conflict.status, 201);
  assert.equal(conflict.json.primary, false, 'second record is a conflict copy, not a replacement');
});

test('photo validation: oversized and non-JPEG rejected', async () => {
  const taskId = await adminCreateTask();
  const task = await syncTask(mobileA, taskId);
  const big = Buffer.alloc(8_500_000, 1).toString('base64');
  const oversized = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, {
    clientRecordId: `big-${Date.now()}`, capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: false, qrToken: task.qr_token, exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: false, photoDataUrl: `data:image/jpeg;base64,${big}`
  }, mobileA);
  assert.equal(oversized.status, 413);
  const notJpeg = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, {
    clientRecordId: `png-${Date.now()}`, capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: false, qrToken: task.qr_token, exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: false, photoDataUrl: 'data:image/png;base64,iVBORw0KGgo='
  }, mobileA);
  assert.equal(notJpeg.status, 422);
});

test('review does not rewrite the original record', async () => {
  const tasks = await call('GET', '/api/v1/admin/tasks?projectId=1', null, adminToken);
  const done = tasks.json.tasks.find(t => t.record_id);
  assert.ok(done, 'at least one record exists');
  const beforeReview = await call('GET', '/api/v1/admin/tasks?projectId=1', null, adminToken);
  const beforeRow = beforeReview.json.tasks.find(t => t.id === done.id);
  const res = await call('POST', `/api/v1/admin/records/${done.record_id}/review`, { status: 'approved', note: '自动测试' }, adminToken);
  assert.equal(res.status, 200);
  const afterRes = await call('GET', '/api/v1/admin/tasks?projectId=1', null, adminToken);
  const afterRow = afterRes.json.tasks.find(t => t.id === done.id);
  assert.equal(afterRow.review_status, 'approved');
  assert.equal(afterRow.captured_at, beforeRow.captured_at, 'captured_at unchanged');
  assert.equal(afterRow.photo_path, beforeRow.photo_path, 'photo untouched');
  assert.deepEqual(afterRow.risk_flags, beforeRow.risk_flags, 'risk flags unchanged');
  const bad = await call('POST', `/api/v1/admin/records/${done.record_id}/review`, { status: 'nonsense' }, adminToken);
  assert.equal(bad.status, 422);
});

test('task cancel rules and unlock', async () => {
  const withRecord = await adminCreateTask();
  const t = await syncTask(mobileA, withRecord);
  await call('POST', `/api/v1/mobile/tasks/${withRecord}/record`, {
    clientRecordId: `unlock-${Date.now()}`, capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: false, qrToken: t.qr_token, exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: false, photoDataUrl: await jpegDataUrl()
  }, mobileA);
  const cancelRecorded = await call('POST', `/api/v1/admin/tasks/${withRecord}/cancel`, { reason: '测试' }, adminToken);
  assert.equal(cancelRecorded.status, 422, 'recorded task cannot be canceled');
  const plain = await adminCreateTask();
  const cancel = await call('POST', `/api/v1/admin/tasks/${plain}/cancel`, { reason: '测试' }, adminToken);
  assert.equal(cancel.status, 200);
  const cancelAgain = await call('POST', `/api/v1/admin/tasks/${plain}/cancel`, { reason: 'again' }, adminToken);
  assert.equal(cancelAgain.status, 422, 'double cancel rejected');
  // Lock a task with device A, then unlock from admin, then device B may start.
  const lockTask = await adminCreateTask();
  await call('POST', `/api/v1/mobile/tasks/${lockTask}/start`, { latitude: 30.07534404, longitude: 94.14583272, accuracyM: 3 }, mobileA);
  const blocked = await call('POST', `/api/v1/mobile/tasks/${lockTask}/start`, { latitude: 30.07534404, longitude: 94.14583272, accuracyM: 3 }, mobileB);
  assert.equal(blocked.status, 423);
  const unlock = await call('POST', `/api/v1/admin/tasks/${lockTask}/unlock`, {}, adminToken);
  assert.equal(unlock.status, 200);
  const afterUnlock = await call('POST', `/api/v1/mobile/tasks/${lockTask}/start`, { latitude: 30.07534404, longitude: 94.14583272, accuracyM: 3 }, mobileB);
  assert.equal(afterUnlock.status, 200, 'unlocked task can be claimed by another device');
});

test('labels page renders 40-per-page A4', async () => {
  const ids = await Promise.all([adminCreateTask(), adminCreateTask()]);
  const res = await fetch(`${BASE}/api/v1/admin/labels?taskIds=${ids.join(',')}`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /-R-5-\d{2}/, 'rendered label text codes');
  assert.equal((html.match(/<div class="label">/g) || []).length, 2);
  assert.equal((html.match(/<div class="page">/g) || []).length, 1, 'two labels share one page');
  assert.match(html, /data:image\/png;base64,/, 'qr codes embedded as data URLs');
});

test('villager management (create/duplicate/activate-no-pin/disable)', async () => {
  const created = await call('POST', '/api/v1/admin/villagers', { username: 'E2EV', displayName: '测试村民' }, adminToken);
  assert.equal(created.status, 201);
  const vid = created.json.id;
  const dup = await call('POST', '/api/v1/admin/villagers', { username: 'E2EV', displayName: 'dup' }, adminToken);
  assert.equal(dup.status, 422, 'duplicate username rejected');
  const act = await call('POST', `/api/v1/admin/villagers/${vid}/activation`, {}, adminToken);
  const [, , user, raw] = String(act.json.value).split('|');
  const activate = await call('POST', '/api/v1/mobile/activate', { username: user, activationToken: raw, deviceUuid: 'e2ev-device', appVersion: '1.0.0' });
  assert.equal(activate.status, 200, 'activation works without PIN');
  const disable = await call('PUT', `/api/v1/admin/villagers/${vid}`, { displayName: '测试村民', enabled: false }, adminToken);
  assert.equal(disable.status, 200);
  const syncBlocked = await call('GET', '/api/v1/mobile/sync', null, activate.json.token);
  assert.equal(syncBlocked.status, 403, 'disabled villager blocks device requests');
});

test('project CRUD and task reschedule', async () => {
  // 项目：新建/重复编码拒绝/编辑/删除；有任务数据的项目只能停用。
  const created = await call('POST', '/api/v1/admin/projects', { code: 'E2EP', name: '测试项目X', description: '', isTest: true }, adminToken);
  assert.equal(created.status, 201);
  const pid = created.json.id;
  const dup = await call('POST', '/api/v1/admin/projects', { code: 'E2EP', name: 'dup' }, adminToken);
  assert.equal(dup.status, 422, 'duplicate project code rejected');
  const updated = await call('PUT', `/api/v1/admin/projects/${pid}`, { code: 'E2EP', name: '测试项目Y', description: 'x', isTest: true, enabled: false }, adminToken);
  assert.equal(updated.status, 200);
  const del = await call('DELETE', `/api/v1/admin/projects/${pid}`, null, adminToken);
  assert.equal(del.status, 200, 'empty project deletable');
  const delMain = await call('DELETE', '/api/v1/admin/projects/1', null, adminToken);
  assert.equal(delMain.status, 422, 'project with tasks cannot be deleted');
  // 改期：重新生成编号与二维码密钥，旧标签作废；有记录的任务不能改期。
  const taskId = await adminCreateTask();
  const res = await call('POST', `/api/v1/admin/tasks/${taskId}/reschedule`, { plannedDate: tomorrow }, adminToken);
  assert.equal(res.status, 200);
  const expectedCode = new RegExp(`^${tomorrow.slice(2).replaceAll('-', '')}-R-5-\\d{2}$`);
  assert.match(res.json.sampleCode, expectedCode);
  const after = await call('GET', '/api/v1/admin/tasks?projectId=1', null, adminToken);
  const moved = after.json.tasks.find(x => x.id === taskId);
  assert.equal(moved.planned_date, tomorrow);
  assert.equal(moved.sample_code, res.json.sampleCode);
  const done = after.json.tasks.find(x => x.record_id);
  if (done) {
    const blocked = await call('POST', `/api/v1/admin/tasks/${done.id}/reschedule`, { plannedDate: tomorrow }, adminToken);
    assert.equal(blocked.status, 422, 'recorded task cannot be rescheduled');
  }
});

test('exports: csv, geojson, gpx, audit, photo zip', async () => {
  const csv = await fetch(`${BASE}/api/v1/admin/exports/csv?projectId=1`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(csv.status, 200);
  const csvBytes = new Uint8Array(await csv.arrayBuffer());
  assert.deepEqual([...csvBytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM for Excel');
  const csvText = new TextDecoder().decode(csvBytes);
  assert.match(csvText, /样品编号/);
  const geo = await fetch(`${BASE}/api/v1/admin/exports/geojson?projectId=1`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(geo.status, 200);
  const geojson = JSON.parse(await geo.text());
  assert.equal(geojson.type, 'FeatureCollection');
  assert.ok(geojson.features.length >= 1);
  const journeys = rawDb.prepare('SELECT id FROM journeys ORDER BY id LIMIT 1').all();
  if (journeys.length) {
    const gpxRes = await fetch(`${BASE}/api/v1/admin/exports/gpx?journeyId=${journeys[0].id}`, { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.equal(gpxRes.status, 200);
    assert.match(await gpxRes.text(), /<gpx /);
  }
  const audit = await fetch(`${BASE}/api/v1/admin/exports/audit.csv`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(audit.status, 200);
  assert.match(await audit.text(), /review|create_tasks/);
  const zip = await fetch(`${BASE}/api/v1/admin/exports/photos.zip?projectId=1`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(zip.status, 200);
  const buf = Buffer.from(await zip.arrayBuffer());
  assert.equal(buf.readUInt32LE(0), 0x04034b50, 'zip local header magic');
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd > 0, 'zip end-of-central-directory present');
  const entryCount = buf.readUInt16LE(eocd + 10);
  const records = rawDb.prepare('SELECT COUNT(*) c FROM records').get().c;
  assert.equal(entryCount, records, 'one zip entry per record photo');
});

test('weather backfill stores server weather separately', async () => {
  const tasks = await call('GET', '/api/v1/admin/tasks?projectId=1', null, adminToken);
  const done = tasks.json.tasks.find(t => t.record_id);
  assert.ok(done);
  const res = await call('POST', `/api/v1/admin/records/${done.record_id}/backfill-weather`, {}, adminToken);
  assert.equal(res.status, 200);
  assert.ok(['complete', 'unavailable'].includes(res.json.status));
  const afterRes = await call('GET', '/api/v1/admin/tasks?projectId=1', null, adminToken);
  const row = afterRes.json.tasks.find(t => t.id === done.id);
  assert.equal(row.server_weather_status, res.json.status);
  assert.equal(row.weather_text, done.weather_text, 'client weather text never overwritten');
});

test('app logs upload with truncation and admin query', async () => {
  const long = 'x'.repeat(5000);
  const res = await call('POST', '/api/v1/mobile/logs', { logs: [{ localId: 9, level: 'error', message: long, diagnostics: {}, createdAt: new Date().toISOString(), appVersion: '1.0.0' }] }, mobileA);
  assert.equal(res.status, 201);
  const logs = await call('GET', '/api/v1/admin/logs', null, adminToken);
  assert.equal(logs.status, 200);
  const stored = logs.json.logs.find(l => l.message.startsWith('xxx'));
  assert.ok(stored);
  assert.ok(stored.message.length <= 4000, 'message truncated to 4000 chars');
});

test('journey interrupted marking feeds track_interrupted risk', async () => {
  const taskId = await adminCreateTask();
  const start = await call('POST', `/api/v1/mobile/tasks/${taskId}/start`, { latitude: 30.07534404, longitude: 94.14583272, accuracyM: 3 }, mobileA);
  assert.equal(start.status, 200);
  const journeyId = start.json.journey.id;
  const mark = await call('POST', `/api/v1/mobile/journeys/${journeyId}/interrupted`, {}, mobileA);
  assert.equal(mark.status, 200);
  const task = await syncTask(mobileA, taskId);
  const rec = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, {
    clientRecordId: `it-${Date.now()}`, capturedAt: `${today}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: false, qrToken: task.qr_token, exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: false, photoDataUrl: await jpegDataUrl()
  }, mobileA);
  assert.equal(rec.status, 201);
  assert.ok(rec.json.riskFlags.includes('track_interrupted'), 'interrupted journey adds risk flag');
});

test('admin logs filter and CSV export', async () => {
  const errOnly = await call('GET', '/api/v1/admin/logs?level=error', null, adminToken);
  assert.equal(errOnly.status, 200);
  assert.ok(errOnly.json.logs.length >= 0);
  assert.ok(errOnly.json.logs.every(l => l.level === 'error'), 'level filter respected');
  const deviceFilter = await call('GET', '/api/v1/admin/logs?deviceId=1', null, adminToken);
  assert.ok(deviceFilter.json.logs.every(l => l.device_id === 1), 'device filter respected');
  const csv = await fetch(`${BASE}/api/v1/admin/exports/logs.csv?level=info`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(csv.status, 200);
  const text = await csv.text();
  assert.match(text, /级别/);
  assert.match(text, /结构化详情/);
});

test('disabled device gets 403', async () => {
  const deviceId = rawDb.prepare("SELECT id FROM devices WHERE device_uuid LIKE 'test-device-B%' ORDER BY id DESC LIMIT 1").get().id;
  rawDb.prepare('UPDATE devices SET enabled=0 WHERE id=?').run(deviceId);
  const res = await call('GET', '/api/v1/mobile/sync', null, mobileB);
  assert.equal(res.status, 403);
  rawDb.prepare('UPDATE devices SET enabled=1 WHERE id=?').run(deviceId);
});

test('mobile login rate limiting locks after 5 failures', async () => {
  for (let i = 0; i < 5; i++) {
    const res = await call('POST', '/api/v1/mobile/login', { username: 'limittest', pin: '0000', deviceUuid: 'x' });
    assert.equal(res.status, 401);
  }
  const limited = await call('POST', '/api/v1/mobile/login', { username: 'limittest', pin: '0000', deviceUuid: 'x' });
  assert.equal(limited.status, 429);
  const stillLocked = await call('POST', '/api/v1/mobile/login', { username: 'limittest', deviceUuid: 'x' });
  assert.equal(stillLocked.status, 429, 'correct pin also locked during window');
});

test('admin login rate limiting (last: locks admin key)', async () => {
  for (let i = 0; i < 10; i++) {
    const res = await call('POST', '/api/v1/admin/login', { password: 'wrong-password' });
    assert.equal(res.status, 401);
  }
  const limited = await call('POST', '/api/v1/admin/login', { password: 'wrong-password' });
  assert.equal(limited.status, 429);
});

// ---------- v1.1.0 新增能力 ----------

test('signed image URLs: 无签名 403，签名 URL 200', async () => {
  // 上传一张真实参考图并挂到点位，通过 sites 接口拿到签名 URL。
  const up = await call('POST', '/api/v1/admin/reference-images', { imageData: await jpegDataUrl(200) }, adminToken);
  assert.equal(up.status, 201, `upload: ${JSON.stringify(up.json)}`);
  const rawPath = up.json.path;
  const beforeSites = await call('GET', '/api/v1/admin/sites?projectId=1', null, adminToken);
  const site5 = beforeSites.json.sites.find(s => s.id === site5Id);
  const setRef = await call('PUT', `/api/v1/admin/sites/${site5Id}`, {
    code: site5.code, name: site5.name, latitude: site5.latitude, longitude: site5.longitude, referenceImage: rawPath
  }, adminToken);
  assert.equal(setRef.status, 200, JSON.stringify(setRef.json));
  const sites = await call('GET', '/api/v1/admin/sites?projectId=1', null, adminToken);
  const signed = sites.json.sites.find(s => s.id === site5Id).reference_image;
  assert.ok(signed.includes('sig='), `signed url: ${signed}`);
  const denied = await fetch(`${BASE}${rawPath}`);
  assert.equal(denied.status, 403, '裸路径必须拒绝');
  const ok = await fetch(`${BASE}${signed}`);
  assert.equal(ok.status, 200, '签名 URL 可访问');
  assert.match(ok.headers.get('content-type'), /image/);
  // 清空参考图，避免影响其他用例。
  await call('PUT', `/api/v1/admin/sites/${site5Id}`, {
    code: site5.code, name: site5.name, latitude: site5.latitude, longitude: site5.longitude, referenceImage: ''
  }, adminToken);
});

test('activation code messages distinguish used vs invalid', async () => {
  const act = await call('POST', `/api/v1/admin/villagers/${villagerId}/activation`, {}, adminToken);
  const [, , user, raw] = act.json.value.split('|');
  const first = await call('POST', '/api/v1/mobile/activate', {
    username: user, activationToken: raw, deviceUuid: `used-${Date.now()}`, appVersion: '1.0.0'
  });
  assert.equal(first.status, 200);
  const second = await call('POST', '/api/v1/mobile/activate', {
    username: user, activationToken: raw, deviceUuid: `used2-${Date.now()}`, appVersion: '1.0.0'
  });
  assert.equal(second.status, 403);
  assert.match(second.json.message, /已被使用/);
  const wrong = await call('POST', '/api/v1/mobile/activate', {
    username: user, activationToken: 'BSC-ACT|not-a-real-token', deviceUuid: `w-${Date.now()}`, appVersion: '1.0.0'
  });
  assert.equal(wrong.status, 403);
  assert.match(wrong.json.message, /无效/);
});

test('app-version endpoint returns latest version', async () => {
  const res = await call('GET', '/api/v1/mobile/app-version', null, null);
  assert.equal(res.status, 200);
  assert.ok(res.json.versionCode >= 103, `versionCode=${res.json.versionCode}`);
  assert.equal(res.json.versionName, '1.2.2');
});

test('captured time in the future adds risk flag', async () => {
  const taskId = await adminCreateTask({ plannedDate: tomorrow });
  await syncTask(mobileA, taskId);
  const res = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, {
    clientRecordId: `future-${Date.now()}`, capturedAt: `${tomorrow}T08:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: false, qrToken: (await syncTask(mobileA, taskId)).qr_token,
    exceptionCategory: '', exceptionDetail: '', mockLocation: false, offlineStart: false,
    photoDataUrl: await jpegDataUrl()
  }, mobileA);
  assert.equal(res.status, 201);
  assert.ok(res.json.riskFlags.includes('captured_time_in_future'), JSON.stringify(res.json.riskFlags));
});

// 构造带 EXIF DateTimeOriginal 的真实 JPEG：sharp 生成底图，再把
// 'Exif\0\0' + 小端 TIFF + IFD 条目 0x9003 的 APP1 段插到 FFD8 之后。
async function jpegWithExif(dateTime) {
  const base = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#2e8b57' } }).jpeg().toBuffer();
  const str = Buffer.from(`${dateTime}\0`, 'ascii'); // 20 字节
  const tiff = Buffer.alloc(26 + str.length);
  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);           // IFD 条目数
  tiff.writeUInt16LE(0x9003, 10);     // DateTimeOriginal
  tiff.writeUInt16LE(2, 12);          // ASCII
  tiff.writeUInt32LE(20, 14);         // count
  tiff.writeUInt32LE(26, 18);         // 值偏移
  tiff.writeUInt32LE(0, 22);          // 下一个 IFD = 0
  str.copy(tiff, 26);
  const app1 = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const seg = Buffer.alloc(4 + app1.length);
  seg.writeUInt16BE(0xFFE1, 0);
  seg.writeUInt16BE(app1.length + 2, 2);
  app1.copy(seg, 4);
  return Buffer.concat([base.subarray(0, 2), seg, base.subarray(2)]);
}

test('exif time mismatch adds risk flag (matches submitted time: no flag)', async () => {
  const taskId = await adminCreateTask();
  await syncTask(mobileA, taskId);
  const task = await syncTask(mobileA, taskId);
  const bad = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, {
    clientRecordId: `exif-bad-${Date.now()}`, capturedAt: `${today}T09:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: false, qrToken: task.qr_token, exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: false,
    photoDataUrl: `data:image/jpeg;base64,${(await jpegWithExif('2026:01:01 00:00:00')).toString('base64')}`
  }, mobileA);
  assert.equal(bad.status, 201);
  assert.ok(bad.json.riskFlags.includes('exif_time_mismatch'), JSON.stringify(bad.json.riskFlags));
  const good = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, {
    clientRecordId: `exif-ok-${Date.now()}`, capturedAt: `${today}T09:00:00+08:00`,
    latitude: 30.07534404, longitude: 94.14583272, accuracyM: 5, weatherText: '晴',
    noWater: false, manualCode: false, qrToken: task.qr_token, exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: false,
    photoDataUrl: `data:image/jpeg;base64,${(await jpegWithExif(`${today.replaceAll('-', ':')} 09:00:00`)).toString('base64')}`
  }, mobileA);
  assert.equal(good.status, 201);
  assert.ok(!good.json.riskFlags.includes('exif_time_mismatch'), '时间一致不应打标');
});

test('label print is recorded and reported on tasks', async () => {
  const taskId = await adminCreateTask();
  const labels = await call('GET', `/api/v1/admin/labels?taskIds=${taskId}`, null, adminToken);
  assert.equal(labels.status, 200);
  const tasks = await call('GET', '/api/v1/admin/tasks?projectId=1', null, adminToken);
  const row = tasks.json.tasks.find(t => t.id === taskId);
  assert.ok(row.printed_count >= 1, `printed_count=${row.printed_count}`);
});

test('batch weather backfill endpoint', async () => {
  const res = await call('POST', '/api/v1/admin/records/backfill-weather', { recordIds: [1, 2, 3] }, adminToken);
  assert.equal(res.status, 200);
  assert.equal(res.json.queued, 3);
  const empty = await call('POST', '/api/v1/admin/records/backfill-weather', { recordIds: [] }, adminToken);
  assert.equal(empty.status, 400);
});

test('security headers present', async () => {
  const res = await fetch(`${BASE}/`);
  assert.match(res.headers.get('content-security-policy') || '', /default-src/);
  assert.match(res.headers.get('content-security-policy') || '', /blob:/, 'blob: 必须允许（参考图预览）');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('duplicate site code returns 422 (not 500)', async () => {
  const sites = await call('GET', '/api/v1/admin/sites?projectId=1', null, adminToken);
  const s = sites.json.sites[0];
  const dup = await call('POST', '/api/v1/admin/sites', {
    projectId: 1, code: s.code, name: '重复点', latitude: 30.1, longitude: 94.1, sampleTypes: ['R'], enabled: true
  }, adminToken);
  assert.equal(dup.status, 422, `应为422而不是500: ${JSON.stringify(dup.json)}`);
  assert.match(dup.json.message, /已存在/);
});

test('task creation without sampleTypes uses the site own types', async () => {
  const sites = await call('GET', '/api/v1/admin/sites?projectId=1', null, adminToken);
  const multi = sites.json.sites.find(x => (x.sample_types || []).length >= 2);
  const res = await call('POST', '/api/v1/admin/tasks', {
    siteId: multi.id, villagerId, plannedDate: tomorrow
  }, adminToken);
  assert.equal(res.status, 201, JSON.stringify(res.json));
  assert.ok(res.json.codes.length >= 2, `按点位类型生成任务: ${JSON.stringify(res.json.codes)}`);
});
