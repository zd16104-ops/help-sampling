'use strict';

// End-to-end smoke test for the V1 API. Run against a live local server:
//   node test/smoke.js
// Exits non-zero on the first failed assertion.
const sharp = require('sharp');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100';
let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.error(`FAIL  ${name} ${detail}`); }
}

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body == null ? undefined : JSON.stringify(body) });
  let json = {};
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function jpegDataUrl() {
  const buffer = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#2e8b57' } })
    .jpeg({ quality: 90 }).toBuffer();
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

async function main() {
  const device = 'smoke-device-0001';

  // 1. health
  const health = await call('GET', '/health');
  check('GET /health → 200', health.status === 200 && health.json.status === 'healthy');

  // 2. admin login
  const login = await call('POST', '/api/v1/admin/login', { password: 'ChangeMe-2608!' });
  check('admin login', login.status === 200 && login.json.token, JSON.stringify(login.json));
  const admin = login.json.token;

  // 3. bootstrap
  const boot = await call('GET', '/api/v1/admin/bootstrap', null, admin);
  check('admin bootstrap has projects+villagers', boot.status === 200 && boot.json.projects.length >= 2 && boot.json.villagers.length >= 1);
  const villager = boot.json.villagers.find(v => v.username === 'cmy01');
  check('seeded villager cmy01 present', Boolean(villager));

  // 4. activation code
  const act = await call('POST', `/api/v1/admin/villagers/${villager.id}/activation`, {}, admin);
  check('activation code created', act.status === 201 && String(act.json.value).startsWith('BSC-ACT|'));
  const [, , actUser, actToken] = String(act.json.value).split('|');

  // 5. activate（扫码即激活，无 PIN）
  const activate = await call('POST', '/api/v1/mobile/activate', {
    username: actUser, activationToken: actToken, deviceUuid: device,
    deviceName: 'Smoke Test', androidVersion: '15', appVersion: '1.0.0'
  });
  check('mobile activate (no PIN)', activate.status === 200 && activate.json.token && activate.json.villager.username === 'cmy01', JSON.stringify(activate.json));
  const mobile = activate.json.token;

  // 6. activation token is single-use
  const reuse = await call('POST', '/api/v1/mobile/activate', {
    username: actUser, activationToken: actToken, deviceUuid: 'smoke-device-0002'
  });
  check('activation token single-use', reuse.status === 403, `status=${reuse.status}`);

  // 7. unknown account rejected
  const badUser = await call('POST', '/api/v1/mobile/login', { username: 'no-such-user', deviceUuid: device });
  check('unknown account → 401', badUser.status === 401, `status=${badUser.status}`);

  // 8. login on activated device
  const relogin = await call('POST', '/api/v1/mobile/login', { username: 'cmy01', deviceUuid: device });
  check('mobile login (no PIN)', relogin.status === 200 && relogin.json.token);

  // 9. sync
  const sync = await call('GET', '/api/v1/mobile/sync', null, mobile);
  check('mobile sync with rules', sync.status === 200 && Array.isArray(sync.json.tasks) && sync.json.rules.severeRadiusM === 300);

  // 10. admin creates task for site 5 (R, today)
  const today = new Date().toISOString().slice(0, 10);
  const sites = await call('GET', '/api/v1/admin/sites?projectId=1', null, admin);
  const site5 = sites.json.sites.find(s => s.code === '5');
  check('site 5 found', Boolean(site5));
  const create = await call('POST', '/api/v1/admin/tasks', {
    siteId: site5.id, villagerId: villager.id, plannedDate: today, sampleTypes: ['R']
  }, admin);
  check('task created', create.status === 201 && create.json.ids.length === 1, JSON.stringify(create.json));
  const taskId = create.json.ids[0];

  // 11. sync again shows the new task with qr_token
  const sync2 = await call('GET', '/api/v1/mobile/sync', null, mobile);
  const task = sync2.json.tasks.find(t => t.id === taskId);
  check('new task in sync payload', Boolean(task) && task.sample_code.startsWith(`${today.slice(2).replaceAll('-', '')}-R-5-`), JSON.stringify(task && task.sample_code));
  check('task exposes qr_token for bottle scan', Boolean(task.qr_token));

  // 12. start journey at exact site coords
  const start = await call('POST', `/api/v1/mobile/tasks/${taskId}/start`, {
    latitude: Number(site5.latitude), longitude: Number(site5.longitude), accuracyM: 3.2
  }, mobile);
  check('journey started', start.status === 200 && start.json.journey.id > 0, JSON.stringify(start.json));
  const journeyId = start.json.journey.id;
  check('weak evidence flagged for <300m start', start.json.weakEvidence === true);

  // 13. track points
  const track = await call('POST', `/api/v1/mobile/journeys/${journeyId}/track`, {
    points: [
      { sequence: 0, recordedAt: new Date().toISOString(), latitude: 30.09, longitude: 94.16, accuracyM: 4, speedMps: 1.2, mockLocation: false },
      { sequence: 1, recordedAt: new Date().toISOString(), latitude: 30.085, longitude: 94.155, accuracyM: 4, speedMps: 1.1, mockLocation: false },
      { sequence: 2, recordedAt: new Date().toISOString(), latitude: Number(site5.latitude), longitude: Number(site5.longitude), accuracyM: 3, speedMps: 0.4, mockLocation: false }
    ]
  }, mobile);
  check('track uploaded', track.status === 200 && track.json.inserted === 3, JSON.stringify(track.json));
  const trackDup = await call('POST', `/api/v1/mobile/journeys/${journeyId}/track`, {
    points: [{ sequence: 2, recordedAt: new Date().toISOString(), latitude: 1, longitude: 1, accuracyM: 4, speedMps: 0, mockLocation: false }]
  }, mobile);
  check('track sequence dedup (INSERT OR IGNORE)', trackDup.status === 200 && trackDup.json.inserted === 1);

  // 14. live location
  const live = await call('POST', `/api/v1/mobile/tasks/${taskId}/live`, {
    recordedAt: new Date().toISOString(), latitude: Number(site5.latitude), longitude: Number(site5.longitude), accuracyM: 3
  }, mobile);
  check('live location', live.status === 200);

  // 15. record with correct qr token
  const photo = await jpegDataUrl();
  const recordBody = {
    clientRecordId: `smoke-record-${Date.now()}`,
    capturedAt: `${today}T08:00:00+08:00`,
    latitude: Number(site5.latitude), longitude: Number(site5.longitude), accuracyM: 3,
    weatherText: '晴 12℃，降水 0mm', noWater: false, manualCode: false,
    qrToken: task.qr_token, exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: false, photoDataUrl: photo
  };
  const record = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, recordBody, mobile);
  check('record uploaded', record.status === 201 && record.json.primary === true, JSON.stringify(record.json));
  const recordId = record.json.id;
  console.log(`      risk flags: ${JSON.stringify(record.json.riskFlags)}`);

  // 16. idempotent retry
  const retry = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, recordBody, mobile);
  check('record retry idempotent', retry.status === 200 && retry.json.id === recordId && retry.json.idempotent === true, JSON.stringify(retry.json));

  // 17. wrong qr token rejected
  const wrongQr = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, { ...recordBody, clientRecordId: 'smoke-record-002', qrToken: 'wrong-token' }, mobile);
  check('wrong qr token → 422', wrongQr.status === 422, `status=${wrongQr.status}`);

  // 18. >300m rejected
  const farBody = { ...recordBody, clientRecordId: 'smoke-record-003', latitude: Number(site5.latitude) + 0.01, longitude: Number(site5.longitude) };
  const far = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, farBody, mobile);
  check('record >300m → 422', far.status === 422, `status=${far.status}`);

  // 19. journey complete
  const complete = await call('POST', `/api/v1/mobile/journeys/${journeyId}/complete`, {}, mobile);
  check('journey complete', complete.status === 200);

  // 20. logs upload
  const logs = await call('POST', '/api/v1/mobile/logs', { logs: [
    { localId: 1, level: 'info', message: 'SMOKE hello', diagnostics: {}, createdAt: new Date().toISOString(), appVersion: '1.0.0' }
  ] }, mobile);
  check('logs upload', logs.status === 201 && logs.json.accepted === 1);

  // 21. admin sees task with record
  const adminTasks = await call('GET', '/api/v1/admin/tasks?projectId=1', null, admin);
  const at = adminTasks.json.tasks.find(t => t.id === taskId);
  check('admin task shows record', at && at.record_id === recordId && at.review_status === 'suspicious', JSON.stringify(at && { review_status: at.review_status, risk_flags: at.risk_flags }));

  // 22. review approved
  const review = await call('POST', `/api/v1/admin/records/${recordId}/review`, { status: 'approved', note: 'smoke review' }, admin);
  check('review approved', review.status === 200);
  const adminTasks2 = await call('GET', '/api/v1/admin/tasks?projectId=1', null, admin);
  check('review persisted', adminTasks2.json.tasks.find(t => t.id === taskId).review_status === 'approved');

  // 23. admin logs readable
  const appLogs = await call('GET', '/api/v1/admin/logs', null, admin);
  check('admin can read app logs', appLogs.status === 200 && appLogs.json.logs.some(l => l.message === 'SMOKE hello'));

  // 24. unauth admin call rejected
  const unauth = await call('GET', '/api/v1/admin/bootstrap');
  check('admin endpoint rejects no token', unauth.status === 401, `status=${unauth.status}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
