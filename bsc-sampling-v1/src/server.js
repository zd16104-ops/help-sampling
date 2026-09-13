'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const QRCode = require('qrcode');
const sharp = require('sharp');
const { initialize, audit } = require('./schema');
const { smoothTrack } = require('./track');
const { exifDateTime, parseExifDate } = require('./exif');
const { verifyPin, safeEqual, signToken, verifyToken, verifyTotp, randomToken } = require('./security');
const { backfillWeather } = require('./weather');
const rateLimit = require('./ratelimit');
const { renderLabelPdf } = require('./labels');
const { recordsCsv, sitesGeoJson, recordsGeoJson, gpx, zipStore } = require('./exports');
const devicePolicy = require('./device-policy');
const collaboration = require('./task-collaboration');
const { hasSampleType, publicSampleTypes, TRANSLATION_REVIEW } = require('./sample-types');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data', 'v1'));
const UPLOADS = path.join(DATA, 'uploads');
const REFERENCE = path.join(DATA, 'reference');
const PUBLIC = path.join(ROOT, 'public');
const CONFIG = path.join(DATA, 'config.json');
fs.mkdirSync(UPLOADS, { recursive: true });
fs.mkdirSync(REFERENCE, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
let saved = {};
try { saved = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch {}
const config = {
  host: process.env.HOST || saved.host || '127.0.0.1', port: Number(process.env.PORT || saved.port || 3100),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || saved.publicBaseUrl || 'https://bsc.gpsgps.online',
  adminPassword: process.env.ADMIN_PASSWORD || saved.adminPassword || 'ChangeMe-2608!',
  adminTotpSecret: process.env.ADMIN_TOTP_SECRET ?? saved.adminTotpSecret ?? '',
  sessionSecret: process.env.SESSION_SECRET || saved.sessionSecret || randomToken(48), lockHours: 12
};
if (!fs.existsSync(CONFIG)) fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2));
const db = new DatabaseSync(path.join(DATA, 'bsc-v1.sqlite')); initialize(db);

function output(res, status, value, headers = {}) { const body = Buffer.from(JSON.stringify(value)); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', ...headers }); res.end(body); }
function error(status, message) { const e = new Error(message); e.status = status; return e; }
async function body(req, max = 12_000_000) { const chunks = []; let size = 0; for await (const chunk of req) { size += chunk.length; if (size > max) throw error(413, '请求过大'); chunks.push(chunk); } try { return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch { throw error(400, 'JSON格式错误'); } }
function bearer(req) { return String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''); }
function admin(req) { const s = verifyToken(config.sessionSecret, bearer(req)); if (!s || s.role !== 'admin') throw error(401, '请登录管理员'); return s; }
function mobile(req) { const s = verifyToken(config.sessionSecret, bearer(req)); if (!s || s.role !== 'villager' || !s.deviceId) throw error(401, '设备登录已过期'); const villager = db.prepare('SELECT enabled FROM villagers WHERE id=?').get(s.subject); if (!villager || !villager.enabled) throw error(403, '采样员已停用'); const d = db.prepare('SELECT * FROM devices WHERE id=? AND villager_id=? AND enabled=1').get(s.deviceId, s.subject); if (!d) { throw Object.assign(error(403, '本设备已失效，请联系管理员重新激活'), { code: 'DEVICE_REVOKED' }); } devicePolicy.touch(db, d.id); return { ...s, villagerId: Number(s.subject), device: d }; }
function required(value, label) { const text = String(value ?? '').trim(); if (!text) throw error(400, `请填写${label}`); return text; }
function optionalTime(value) { const text = String(value ?? '').trim(); if (!text) return ''; if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw error(422, '计划时间格式必须为 HH:mm'); return text; }
function number(value, label) { const n = Number(value); if (!Number.isFinite(n)) throw error(400, `${label}无效`); return n; }
function distance(a, b, c, d) { const r = x => x * Math.PI / 180, x = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * 6371008.8 * Math.asin(Math.sqrt(x)); }
function transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const value = fn(); db.exec('COMMIT'); return value; } catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; } }
function parse(value, fallback = []) { try { return JSON.parse(value); } catch { return fallback; } }
function expire() { db.prepare(`UPDATE tasks SET locked_device_id=NULL,locked_at=NULL,journey_id=NULL,status='assigned' WHERE status='in_progress' AND datetime(locked_at)<datetime('now','-12 hours')`).run(); }
function sampleCode(date, type, site) { const base = `${date.replaceAll('-', '').slice(2)}-${type}-${site.code}`; const count = db.prepare('SELECT COUNT(*) count FROM tasks WHERE planned_date=? AND sample_type=? AND site_id=?').get(date, type, site.id).count + 1; return { base, count, code: `${base}-${String(count).padStart(2, '0')}` }; }
function deleteUnsubmittedTask(taskId) {
  db.prepare('DELETE FROM task_evidence WHERE task_id=?').run(taskId);
  db.prepare('DELETE FROM task_progress_events WHERE task_id=?').run(taskId);
  db.prepare('DELETE FROM task_assignment_events WHERE task_id=?').run(taskId);
  db.prepare('DELETE FROM label_prints WHERE task_id=?').run(taskId);
  db.prepare('DELETE FROM live_locations WHERE task_id=?').run(taskId);
  db.prepare('DELETE FROM track_points WHERE journey_id IN (SELECT id FROM journeys WHERE task_id=?) OR journey_id IN (SELECT journey_id FROM tasks WHERE id=?)').run(taskId, taskId);
  db.prepare('DELETE FROM journeys WHERE task_id=? OR id IN (SELECT journey_id FROM tasks WHERE id=?)').run(taskId, taskId);
  db.prepare('DELETE FROM tasks WHERE id=?').run(taskId);
}
function ipOf(req) { return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || ''; }
function serveFile(req, res, url) { let p = url.pathname === '/' ? '/index.html' : url.pathname; if (!p.startsWith('/')) p = `/${p}`; const file = path.resolve(PUBLIC, `.${p}`); if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) throw error(404, '页面不存在'); const headers = { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': fs.statSync(file).size, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' }; if (path.extname(file).toLowerCase() === '.html') headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'"; res.writeHead(200, headers); fs.createReadStream(file).pipe(res); }
function signImage(pathname, ttlSeconds = 7 * 86400) { const exp = Math.floor(Date.now() / 1000) + ttlSeconds; const sig = crypto.createHmac('sha256', config.sessionSecret).update(`${pathname}:${exp}`).digest('base64url'); return `${pathname}?exp=${exp}&sig=${sig}`; }
function signedImage(pathname) { return pathname && String(pathname).startsWith('/') ? signImage(String(pathname)) : pathname; }
function serveImageDir(req, res, url, dir) { const exp = Number(url.searchParams.get('exp') || 0), sig = String(url.searchParams.get('sig') || ''); const expected = crypto.createHmac('sha256', config.sessionSecret).update(`${url.pathname}:${exp}`).digest('base64url'); if (!exp || exp < Date.now() / 1000 || !safeEqual(sig, expected)) throw error(403, '图片链接无效或已过期'); const file = path.resolve(DATA, url.pathname.slice(1)); if (!file.startsWith(dir + path.sep) && file !== dir) throw error(404, '文件不存在'); if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw error(404, '文件不存在'); res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': fs.statSync(file).size, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); fs.createReadStream(file).pipe(res); }
// Fire-and-forget weather backfill: never blocks the upload response and
// never modifies the client's weather_text (stored separately).
function backfillRecordWeather(recordId) { const record = db.prepare('SELECT id, latitude, longitude, captured_at, weather_text FROM records WHERE id=?').get(recordId); if (!record) return; backfillWeather(record).then(r => { db.prepare("UPDATE records SET server_weather_text=?, server_weather_status='complete' WHERE id=?").run(r.text, record.id); }).catch(() => { db.prepare("UPDATE records SET server_weather_status='unavailable' WHERE id=?").run(record.id); }); }
function adminRecords(projectId) { return db.prepare(`SELECT r.*, t.sample_code, t.sample_type, t.planned_date, t.canceled_at,t.handover_count, s.code site_code, s.name site_name, s.name_bo site_name_bo, s.reference_image, s.instructions, s.instructions_bo, s.risk_note, s.risk_note_bo, p.name project_name, p.code project_code, rv.display_name villager_name,pv.display_name primary_villager_name,bv.display_name backup_villager_name,fv.display_name final_villager_name, d.device_name, d.android_version FROM records r JOIN tasks t ON t.id=r.task_id JOIN sites s ON s.id=t.site_id JOIN projects p ON p.id=t.project_id LEFT JOIN devices d ON d.id=r.device_id LEFT JOIN villagers rv ON rv.id=d.villager_id JOIN villagers pv ON pv.id=t.villager_id LEFT JOIN villagers bv ON bv.id=t.backup_villager_id LEFT JOIN villagers fv ON fv.id=t.final_villager_id WHERE t.project_id=? ORDER BY r.captured_at DESC, r.id`).all(projectId).map(r => ({ ...r, risk_flags: parse(r.risk_flags) })); }

async function sendLabelPdf(res, taskIds, actorIp = '') {
  const ids = [...new Set((Array.isArray(taskIds) ? taskIds : []).map(Number).filter(Number.isInteger))];
  if (!ids.length) throw error(400, '请选择任务');
  if (ids.length > 500) throw error(422, '一次最多打印500个任务标签');
  const tasks = ids.map(id => db.prepare(`SELECT t.id,t.base_sample_code,t.sample_code,t.qr_token,t.sample_type,t.planned_date,
    s.code site_code,s.name site_name,s.latitude,s.longitude,p.code project_code,p.id project_id
    FROM tasks t JOIN sites s ON s.id=t.site_id JOIN projects p ON p.id=t.project_id
    WHERE t.id=? AND t.canceled_at IS NULL AND s.deleted_at IS NULL`).get(id)).filter(Boolean);
  if (tasks.length !== ids.length) {
    const valid = new Set(tasks.map(t => Number(t.id)));
    const invalid = ids.filter(id => !valid.has(id));
    throw Object.assign(error(422, `以下任务已取消、已删除或不存在：${invalid.join('、')}`), { code: 'LABEL_TASK_INVALID' });
  }
  const coSite = new Map();
  for (const task of tasks) {
    const key = `${task.latitude}:${task.longitude}`;
    if (!coSite.has(key)) coSite.set(key, db.prepare('SELECT COUNT(*) c FROM sites WHERE project_id=? AND latitude=? AND longitude=? AND deleted_at IS NULL').get(task.project_id, task.latitude, task.longitude).c);
  }
  const withQr = [];
  for (const task of tasks) withQr.push({ ...task, co_sited: coSite.get(`${task.latitude}:${task.longitude}`) || 1,
    qr_value: `BSC-SAMPLE|${task.sample_code}|${task.qr_token}`,
    qr_data_url: await QRCode.toDataURL(`BSC-SAMPLE|${task.sample_code}|${task.qr_token}`, { width: 300, margin: 1 }) });
  const pdf = await renderLabelPdf(withQr);
  const print = db.prepare('INSERT INTO label_prints(task_id,sample_code) VALUES(?,?)');
  transaction(() => tasks.forEach(task => print.run(task.id, task.sample_code)));
  audit(db, 'admin', 'admin', 'print_labels', 'task', ids.join(','), { count: tasks.length, format: 'pdf', source: ids.length > 1 ? 'batch' : 'single' }, actorIp);
  const filename = `bsc-labels-${tasks[0].planned_date}.pdf`;
  res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': pdf.length,
    'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
  return res.end(pdf);
}

// 诊断日志查询（管理员端）：按级别/设备/时间筛选，上限 5000 条。
function queryAppLogs(url) {
  const level = String(url.searchParams.get('level') || '');
  const deviceId = Number(url.searchParams.get('deviceId') || 0);
  const villagerId = Number(url.searchParams.get('villagerId') || 0);
  const from = String(url.searchParams.get('from') || '');
  const to = String(url.searchParams.get('to') || '');
  const limit = Math.min(Number(url.searchParams.get('limit') || 1000) || 1000, 5000);
  const cond = ['1=1'];
  const args = [];
  if (level) { cond.push('level=?'); args.push(level); }
  if (deviceId) { cond.push('device_id=?'); args.push(deviceId); }
  if (villagerId) { cond.push('villager_id=?'); args.push(villagerId); }
  if (from) { cond.push('created_at>=?'); args.push(`${from}T00:00:00`); }
  if (to) { cond.push('created_at<=?'); args.push(`${to}T23:59:59`); }
  args.push(limit);
  return db.prepare(`SELECT * FROM app_logs WHERE ${cond.join(' AND ')} ORDER BY id DESC LIMIT ?`).all(...args);
}

async function adminApi(req, res, url) {
  if (url.pathname === '/api/v1/admin/login' && req.method === 'POST') {
    const p = await body(req, 20_000);
    const key = `admin:${ipOf(req)}`;
    const limit = rateLimit.check(key, { max: 10, windowMs: 10 * 60_000 });
    if (limit.limited) throw error(429, `尝试过多，请${Math.ceil(limit.retryAfterMs / 60_000)}分钟后重试`);
    if (!safeEqual(p.password, config.adminPassword) || !verifyTotp(config.adminTotpSecret, p.totp)) {
      rateLimit.recordFailure(key, { max: 10, windowMs: 10 * 60_000 });
      throw error(401, '密码或动态验证码错误');
    }
    rateLimit.recordSuccess(key);
    audit(db, 'admin', 'admin', 'login', 'admin', null, {}, ipOf(req));
    return output(res, 200, { token: signToken(config.sessionSecret, 'admin', 'admin', {}, 7 * 86400) });
  }
  admin(req);
  if (url.pathname === '/api/v1/admin/bootstrap' && req.method === 'GET') return output(res, 200, { projects: db.prepare('SELECT * FROM projects ORDER BY id').all(), villagers: db.prepare(`SELECT v.id,v.username,v.display_name,v.enabled,
      (SELECT COUNT(*) FROM devices d WHERE d.villager_id=v.id AND d.enabled=1) AS active_device_count,
      (SELECT d.device_name FROM devices d WHERE d.villager_id=v.id AND d.enabled=1 ORDER BY d.id DESC LIMIT 1) AS active_device_name
    FROM villagers v ORDER BY v.id`).all(), samplingSettings: db.prepare('SELECT * FROM sampling_settings ORDER BY project_id').all(), summary: db.prepare("SELECT (SELECT COUNT(*) FROM tasks) tasks,(SELECT COUNT(*) FROM records) records,(SELECT COUNT(*) FROM records WHERE review_status='suspicious') suspicious").get(), publicBaseUrl: config.publicBaseUrl, sampleTypes: publicSampleTypes(), translationReview: TRANSLATION_REVIEW });
  if (url.pathname === '/api/v1/admin/health' && req.method === 'GET') { const s = fs.statfsSync(DATA); const free = Number(s.bfree) * Number(s.bsize); return output(res, 200, { freeBytes: free, warnLowDisk: free < 10 * 1024 ** 3, criticalLowDisk: free < 5 * 1024 ** 3, dataDir: DATA }); }
  if (url.pathname === '/api/v1/admin/settings/sampling' && req.method === 'GET') return output(res, 200, collaboration.getDefaultBackup(db, number(url.searchParams.get('projectId') || 1, '项目')));
  if (url.pathname === '/api/v1/admin/settings/sampling' && req.method === 'PUT') { const p = await body(req, 20_000); const result = collaboration.setDefaultBackup(db, number(p.projectId, '项目'), p.defaultBackupVillagerId); audit(db, 'admin', 'admin', 'set_default_backup', 'project', p.projectId, result, ipOf(req)); return output(res, 200, result); }
  if (url.pathname === '/api/v1/admin/projects' && req.method === 'POST') { const p = await body(req); try { const id = db.prepare('INSERT INTO projects(code,name,description,is_test,enabled) VALUES(?,?,?,?,1)').run(required(p.code, '项目编码'), required(p.name, '项目名称'), String(p.description || ''), p.isTest ? 1 : 0).lastInsertRowid; audit(db, 'admin', 'admin', 'create_project', 'project', id, { code: p.code }, ipOf(req)); return output(res, 201, { id }); } catch (e) { if (String(e.message).includes('UNIQUE')) throw error(422, '项目编码已存在'); throw e; } }
  let m = /^\/api\/v1\/admin\/projects\/(\d+)$/.exec(url.pathname);
  if (m && req.method === 'PUT') { const id = Number(m[1]), p = await body(req); if (!db.prepare('SELECT id FROM projects WHERE id=?').get(id)) throw error(404, '项目不存在'); try { db.prepare('UPDATE projects SET code=?,name=?,description=?,is_test=?,enabled=? WHERE id=?').run(required(p.code, '项目编码'), required(p.name, '项目名称'), String(p.description ?? ''), p.isTest ? 1 : 0, p.enabled == null ? 1 : (p.enabled ? 1 : 0), id); } catch (e) { if (String(e.message).includes('UNIQUE')) throw error(422, '项目编码已存在'); throw e; } audit(db, 'admin', 'admin', 'update_project', 'project', id, p, ipOf(req)); return output(res, 200, { ok: true }); }
  if (m && req.method === 'DELETE') { const id = Number(m[1]); if (!db.prepare('SELECT id FROM projects WHERE id=?').get(id)) throw error(404, '项目不存在'); if (db.prepare('SELECT id FROM tasks WHERE project_id=? LIMIT 1').get(id)) throw error(422, '项目已有任务数据，不能删除；可在编辑中停用'); transaction(() => { db.prepare('DELETE FROM sites WHERE project_id=?').run(id); db.prepare('DELETE FROM projects WHERE id=?').run(id); }); audit(db, 'admin', 'admin', 'delete_project', 'project', id, {}, ipOf(req)); return output(res, 200, { ok: true }); }
  if (url.pathname === '/api/v1/admin/sites' && req.method === 'GET') return output(res, 200, { sites: db.prepare('SELECT * FROM sites WHERE project_id=? AND deleted_at IS NULL ORDER BY sort_order').all(Number(url.searchParams.get('projectId') || 1)).map(s => ({ ...s, sample_types: parse(s.sample_types), reference_image: signedImage(s.reference_image) })) });
  if (url.pathname === '/api/v1/admin/sites' && req.method === 'POST') { const p = await body(req); try { const id = db.prepare(`INSERT INTO sites(project_id,sort_order,code,name,name_bo,latitude,longitude,altitude_m,sample_types,remarks,normal_radius_m,exception_radius_m,severe_radius_m,reference_image,instructions,instructions_bo,risk_note,risk_note_bo,enabled) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(number(p.projectId, '项目'), Number(p.sortOrder || 0), required(p.code, '历史序号'), required(p.name, '点位名称'), String(p.nameBo || ''), number(p.latitude, '纬度'), number(p.longitude, '经度'), p.altitudeM == null ? null : Number(p.altitudeM), JSON.stringify((p.sampleTypes || []).filter(hasSampleType)), String(p.remarks || ''), 30, 80, 300, String(p.referenceImage || ''), String(p.instructions || ''), String(p.instructionsBo || ''), String(p.riskNote || ''), String(p.riskNoteBo || ''), p.enabled == null ? 1 : (p.enabled ? 1 : 0)).lastInsertRowid; audit(db, 'admin', 'admin', 'create_site', 'site', id, { code: p.code, projectId: p.projectId }, ipOf(req)); return output(res, 201, { id }); } catch (e) { if (String(e.message).includes('UNIQUE')) throw error(422, '该项目下历史序号已存在，请换一个序号或编辑原点位'); throw e; } }
  m = /^\/api\/v1\/admin\/sites\/(\d+)$/.exec(url.pathname);
  if (m && req.method === 'PUT') { const id = Number(m[1]), p = await body(req), site = db.prepare('SELECT * FROM sites WHERE id=? AND deleted_at IS NULL').get(id); if (!site) throw error(404, '点位不存在'); try { db.prepare(`UPDATE sites SET sort_order=?,code=?,name=?,name_bo=?,latitude=?,longitude=?,altitude_m=?,sample_types=?,remarks=?,normal_radius_m=?,exception_radius_m=?,severe_radius_m=?,reference_image=?,instructions=?,instructions_bo=?,risk_note=?,risk_note_bo=?,enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(Number(p.sortOrder ?? site.sort_order ?? 0), required(p.code, '历史序号'), required(p.name, '点位名称'), String(p.nameBo ?? site.name_bo ?? ''), number(p.latitude, '纬度'), number(p.longitude, '经度'), p.altitudeM == null ? null : Number(p.altitudeM), JSON.stringify((p.sampleTypes || parse(site.sample_types)).filter(hasSampleType)), String(p.remarks ?? ''), Number(p.normalRadiusM ?? site.normal_radius_m), Number(p.exceptionRadiusM ?? site.exception_radius_m), Number(p.severeRadiusM ?? site.severe_radius_m), String(p.referenceImage ?? site.reference_image ?? ''), String(p.instructions ?? ''), String(p.instructionsBo ?? site.instructions_bo ?? ''), String(p.riskNote ?? ''), String(p.riskNoteBo ?? site.risk_note_bo ?? ''), p.enabled == null ? site.enabled : (p.enabled ? 1 : 0), id); } catch (e) { if (String(e.message).includes('UNIQUE')) throw error(422, '该项目下历史序号已存在'); throw e; } audit(db, 'admin', 'admin', 'update_site', 'site', id, { before: site.code, after: p.code }, ipOf(req)); return output(res, 200, { ok: true }); }
  if (m && req.method === 'DELETE') { const id = Number(m[1]), site = db.prepare('SELECT * FROM sites WHERE id=? AND deleted_at IS NULL').get(id); if (!site) throw error(404, '点位不存在'); const result = transaction(() => { const r = db.prepare("UPDATE tasks SET canceled_at=CURRENT_TIMESTAMP,canceled_reason='点位已删除',updated_at=CURRENT_TIMESTAMP WHERE site_id=? AND canceled_at IS NULL AND id NOT IN (SELECT task_id FROM records)").run(id); db.prepare('UPDATE sites SET code=?,deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(`${site.code}-DEL${id}`, id); return r.changes; }); audit(db, 'admin', 'admin', 'delete_site', 'site', id, { code: site.code, canceledTasks: result }, ipOf(req)); return output(res, 200, { ok: true, canceledTasks: result }); }
  if (url.pathname === '/api/v1/admin/reference-images' && req.method === 'POST') { const p = await body(req, 12_000_000); const match = /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(p.imageData || '')); if (!match) throw error(422, '必须上传JPEG/PNG/WebP图片'); const image = Buffer.from(match[1], 'base64'); if (image.length < 100 || image.length > 10_000_000) throw error(413, '参考图无效或过大'); const name = `ref-${Date.now()}-${randomToken(4)}.jpg`, target = path.join(REFERENCE, name); await sharp(image).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(target); audit(db, 'admin', 'admin', 'upload_reference_image', 'reference', name, {}, ipOf(req)); return output(res, 201, { path: `/reference/${name}` }); }
  if (url.pathname === '/api/v1/admin/villagers' && req.method === 'POST') { const p = await body(req); try { const id = db.prepare('INSERT INTO villagers(username,display_name,pin_salt,pin_hash,enabled) VALUES(?,?,?,?,1)').run(required(p.username, '账号').toLowerCase().replace(/[^a-z0-9._-]/g, ''), required(p.displayName, '姓名'), '', '').lastInsertRowid; audit(db, 'admin', 'admin', 'create_villager', 'villager', id, { username: p.username }, ipOf(req)); return output(res, 201, { id }); } catch (e) { if (String(e.message).includes('UNIQUE')) throw error(422, '账号已存在'); throw e; } }
  m = /^\/api\/v1\/admin\/villagers\/(\d+)\/devices$/.exec(url.pathname);
  if (m && req.method === 'GET') return output(res, 200, devicePolicy.listDevices(db, Number(m[1])));
  m = /^\/api\/v1\/admin\/villagers\/(\d+)\/devices\/(\d+)\/select$/.exec(url.pathname);
  if (m && req.method === 'POST') { const p = await body(req, 20_000); return output(res, 200, devicePolicy.selectUniqueDevice(db, Number(m[1]), Number(m[2]), { reason: String(p.reason || 'legacy_conflict'), ip: ipOf(req) })); }
  m = /^\/api\/v1\/admin\/devices\/(\d+)$/.exec(url.pathname);
  if (m && req.method === 'PATCH') { const p = await body(req, 20_000); return output(res, 200, devicePolicy.renameDevice(db, Number(m[1]), p.deviceName, { ip: ipOf(req) })); }
  m = /^\/api\/v1\/admin\/devices\/(\d+)\/revoke$/.exec(url.pathname);
  if (m && req.method === 'POST') { const p = await body(req, 20_000); return output(res, 200, devicePolicy.revokeDevice(db, Number(m[1]), { reason: String(p.reason || 'revoked'), ip: ipOf(req) })); }
  m = /^\/api\/v1\/admin\/villagers\/(\d+)$/.exec(url.pathname);
  if (m && req.method === 'PUT') { const id = Number(m[1]), p = await body(req); const enabled = p.enabled == null ? 1 : (p.enabled ? 1 : 0); return output(res, 200, devicePolicy.setVillagerEnabled(db, id, enabled, required(p.displayName, '姓名'), { ip: ipOf(req) })); }
  if (m && req.method === 'DELETE') { const id = Number(m[1]); return output(res, 200, devicePolicy.setVillagerEnabled(db, id, false, '', { ip: ipOf(req) })); }
  m = /^\/api\/v1\/admin\/villagers\/(\d+)\/activation$/.exec(url.pathname);
  if (m && req.method === 'POST') { const p = await body(req, 20_000); const created = devicePolicy.createActivation(db, { villagerId: Number(m[1]), mode: p.mode || 'initial', currentDeviceId: p.currentDeviceId, requestedKey: p.activationKey, ip: ipOf(req) }); const value = `BSC-ACT|${config.publicBaseUrl}|${created.username}|${created.raw}`; return output(res, 201, { value, activationKey: created.raw, username: created.username, purpose: created.purpose, currentDeviceId: created.currentDeviceId, qrDataUrl: await QRCode.toDataURL(value, { width: 480, margin: 1 }), expiresAt: created.expires }); }
  if (url.pathname === '/api/v1/admin/tasks' && req.method === 'POST') { const p = await body(req); const site = db.prepare('SELECT * FROM sites WHERE id=? AND enabled=1 AND deleted_at IS NULL').get(number(p.siteId, '点位')); if (!site) throw error(422, '点位未启用或已删除'); const primaryId = number(p.primaryVillagerId ?? p.villagerId, '主采样人'); const backupId = p.backupVillagerId == null || p.backupVillagerId === '' ? null : number(p.backupVillagerId, '备用采样人'); if (backupId === primaryId) throw error(422, '主采样人和备用采样人不能相同'); const assigneeIds = backupId == null ? [primaryId] : [primaryId, backupId]; if (Number(db.prepare(`SELECT COUNT(*) count FROM villagers WHERE enabled=1 AND id IN (${assigneeIds.map(() => '?').join(',')})`).get(...assigneeIds).count) !== assigneeIds.length) throw error(422, '采样人不存在或已停用'); const requested = Array.isArray(p.sampleTypes) ? p.sampleTypes : [p.sampleType]; const siteTypes = parse(site.sample_types); const wanted = requested.filter(hasSampleType); const types = (wanted.length ? wanted : siteTypes).filter(hasSampleType); if (!types.length) throw error(422, '该点位未设置样品类型，请先在点位管理里设置'); const plannedTime = optionalTime(p.plannedTime); const created = transaction(() => types.map(type => { const code = sampleCode(required(p.plannedDate, '日期'), type, site); const id = Number(db.prepare(`INSERT INTO tasks(project_id,site_id,villager_id,backup_villager_id,active_villager_id,planned_date,planned_time,base_sample_code,sample_code,sample_type,sequence,qr_token) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(site.project_id, site.id, primaryId, backupId, primaryId, p.plannedDate, plannedTime, code.base, code.code, type, code.count, randomToken(24)).lastInsertRowid); collaboration.markAssigned(db, id, primaryId, backupId); return { id, sampleCode: code.code }; })); audit(db, 'admin', 'admin', 'create_tasks', 'site', site.id, { count: created.length, plannedDate: p.plannedDate, plannedTime, primaryVillagerId: primaryId, backupVillagerId: backupId, types }, ipOf(req)); return output(res, 201, { ids: created.map(c => c.id), codes: created.map(c => c.sampleCode) }); }
  if (url.pathname === '/api/v1/admin/tasks' && req.method === 'GET') { const project = Number(url.searchParams.get('projectId') || 1); const date = url.searchParams.get('date') || ''; const sql = `SELECT t.*,s.code site_code,s.name site_name,s.name_bo site_name_bo,s.latitude target_latitude,s.longitude target_longitude,s.reference_image,s.instructions,s.instructions_bo,s.risk_note,s.risk_note_bo,p.name project_name,p.code project_code,pv.display_name villager_name,pv.display_name primary_villager_name,bv.display_name backup_villager_name,av.display_name active_villager_name,fv.display_name final_villager_name,r.id record_id,r.captured_at,r.received_at,r.latitude,r.longitude,r.accuracy_m,r.distance_m,r.weather_text,r.server_weather_text,r.server_weather_status,r.manual_code,r.exception_category,r.exception_detail,r.mock_location,r.no_water,r.photo_path,r.photo_sha256,r.review_status,r.review_note,r.risk_flags,j.start_distance_m,j.interrupted,j.started_at,(SELECT COUNT(*) FROM label_prints lp WHERE lp.task_id=t.id) printed_count,(SELECT MAX(lp.printed_at) FROM label_prints lp WHERE lp.task_id=t.id) printed_last FROM tasks t JOIN sites s ON s.id=t.site_id JOIN projects p ON p.id=t.project_id JOIN villagers pv ON pv.id=t.villager_id LEFT JOIN villagers bv ON bv.id=t.backup_villager_id LEFT JOIN villagers av ON av.id=COALESCE(t.active_villager_id,t.villager_id) LEFT JOIN villagers fv ON fv.id=t.final_villager_id LEFT JOIN records r ON r.task_id=t.id AND r.is_primary=1 LEFT JOIN journeys j ON j.id=t.journey_id WHERE t.project_id=?${date === 'pending' ? " AND r.id IS NULL" : date ? " AND t.planned_date=?" : ''} ORDER BY t.planned_date DESC,t.id`; const rows = date && date !== 'pending' ? db.prepare(sql).all(project, date) : db.prepare(sql).all(project); return output(res, 200, { tasks: rows.map(t => ({ ...t, assignment: collaboration.assignmentPayload(t, 0), risk_flags: parse(t.risk_flags), canceled_at: t.canceled_at || null, canceled_reason: t.canceled_reason || null, photo_path: signedImage(t.photo_path), reference_image: signedImage(t.reference_image) })) }); }
  m = /^\/api\/v1\/admin\/tasks\/(\d+)\/assignees$/.exec(url.pathname);
  if (m && req.method === 'PUT') { const p = await body(req, 30_000); const result = collaboration.updateAssignees(db, { taskId: Number(m[1]), primaryVillagerId: p.primaryVillagerId, backupVillagerId: p.backupVillagerId, reason: p.reason, actor: 'admin' }); audit(db, 'admin', 'admin', 'change_task_assignees', 'task', m[1], { primaryVillagerId: p.primaryVillagerId, backupVillagerId: p.backupVillagerId, reason: p.reason }, ipOf(req)); return output(res, 200, result); }
  m = /^\/api\/v1\/admin\/tasks\/(\d+)\/collaboration$/.exec(url.pathname);
  if (m && req.method === 'GET') { const detail = collaboration.getProgress(db, Number(m[1]), 0, true); detail.records = detail.records.map(record => ({ ...record, photo_path: signedImage(record.photo_path) })); return output(res, 200, detail); }
  if (url.pathname === '/api/v1/admin/tasks/batch-delete' && req.method === 'POST') { const p = await body(req); const date = required(p.plannedDate, '日期'); const project = Number(p.projectId || 1); const result = transaction(() => { const rows = db.prepare('SELECT id FROM tasks WHERE project_id=? AND planned_date=? AND id NOT IN (SELECT task_id FROM records)').all(project, date); for (const r of rows) deleteUnsubmittedTask(r.id); const skipped = db.prepare('SELECT COUNT(*) c FROM tasks WHERE project_id=? AND planned_date=? AND id IN (SELECT task_id FROM records)').get(project, date).c; return { deleted: rows.length, skipped }; }); audit(db, 'admin', 'admin', 'batch_delete_tasks', 'date', date, { projectId: project, ...result }, ipOf(req)); return output(res, 200, result); }
  m = /^\/api\/v1\/admin\/tasks\/(\d+)\/cancel$/.exec(url.pathname);
  if (m && req.method === 'POST') { const id = Number(m[1]), p = await body(req), task = db.prepare('SELECT * FROM tasks WHERE id=?').get(id); if (!task) throw error(404, '任务不存在'); if (db.prepare('SELECT id FROM records WHERE task_id=? AND is_primary=1').get(id)) throw error(422, '已提交记录，不能取消；请使用退回重采'); if (task.canceled_at) throw error(422, '任务已取消'); db.prepare('UPDATE tasks SET canceled_at=CURRENT_TIMESTAMP,canceled_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(String(p.reason || '管理员取消'), id); audit(db, 'admin', 'admin', 'cancel_task', 'task', id, { reason: p.reason }, ipOf(req)); return output(res, 200, { ok: true }); }
  m = /^\/api\/v1\/admin\/tasks\/(\d+)\/reschedule$/.exec(url.pathname);
  if (m && req.method === 'POST') { const id = Number(m[1]), p = await body(req), task = db.prepare('SELECT t.*,s.code site_code FROM tasks t JOIN sites s ON s.id=t.site_id WHERE t.id=?').get(id); if (!task) throw error(404, '任务不存在'); if (task.canceled_at) throw error(422, '任务已取消'); if (db.prepare('SELECT id FROM records WHERE task_id=? AND is_primary=1').get(id)) throw error(422, '已提交记录，不能改期'); const date = required(p.plannedDate, '日期'); const code = sampleCode(date, task.sample_type, { code: task.site_code, id: task.site_id }); const plannedTime = p.plannedTime == null ? String(task.planned_time || '') : optionalTime(p.plannedTime); transaction(() => { db.prepare('UPDATE tasks SET planned_date=?,planned_time=?,base_sample_code=?,sample_code=?,sequence=?,qr_token=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(date, plannedTime, code.base, code.code, code.count, randomToken(24), id); }); audit(db, 'admin', 'admin', 'reschedule_task', 'task', id, { before: task.planned_date, after: date, plannedTime }, ipOf(req)); return output(res, 200, { sampleCode: code.code, plannedTime }); }
  m = /^\/api\/v1\/admin\/tasks\/(\d+)\/unlock$/.exec(url.pathname);
  if (m && req.method === 'POST') { const id = Number(m[1]); if (!db.prepare('SELECT id FROM tasks WHERE id=?').get(id)) throw error(404, '任务不存在'); db.prepare("UPDATE tasks SET locked_device_id=NULL,locked_at=NULL,journey_id=NULL,status='assigned',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id); audit(db, 'admin', 'admin', 'unlock_task', 'task', id, {}, ipOf(req)); return output(res, 200, { ok: true }); }
  m = /^\/api\/v1\/admin\/tasks\/(\d+)\/delete$/.exec(url.pathname);
  if (m && req.method === 'DELETE') { const id = Number(m[1]); const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(id); if (!task) throw error(404, '任务不存在'); if (db.prepare('SELECT id FROM records WHERE task_id=? LIMIT 1').get(id)) throw error(422, '已提交记录，不能删除；可取消此任务'); transaction(() => deleteUnsubmittedTask(id)); audit(db, 'admin', 'admin', 'delete_task', 'task', id, { sample_code: task.sample_code }, ipOf(req)); return output(res, 200, { ok: true }); }
  if (url.pathname === '/api/v1/admin/labels' && req.method === 'GET') { const ids = String(url.searchParams.get('taskIds') || '').split(',').map(Number); return sendLabelPdf(res, ids, ipOf(req)); }
  if (url.pathname === '/api/v1/admin/labels/pdf' && req.method === 'POST') { const p = await body(req, 100_000); return sendLabelPdf(res, p.taskIds, ipOf(req)); }
  m = /^\/api\/v1\/admin\/records\/(\d+)\/review$/.exec(url.pathname);
  if (m && req.method === 'POST') { const p = await body(req); if (!['approved','rejected','suspicious','pending'].includes(p.status)) throw error(422, '审核状态无效'); db.prepare('UPDATE records SET review_status=?,review_note=? WHERE id=?').run(p.status, String(p.note || ''), Number(m[1])); audit(db, 'admin', 'admin', 'review', 'record', m[1], p, ipOf(req)); return output(res, 200, { ok: true }); }
  m = /^\/api\/v1\/admin\/records\/(\d+)\/backfill-weather$/.exec(url.pathname);
  if (m && req.method === 'POST') { const id = Number(m[1]), record = db.prepare('SELECT id,latitude,longitude,captured_at FROM records WHERE id=?').get(id); if (!record) throw error(404, '记录不存在'); let r; try { r = await backfillWeather(record); } catch (e) { console.error('backfillWeather failed:', e.message); r = { text: '待补充', status: 'unavailable' }; } db.prepare('UPDATE records SET server_weather_text=?,server_weather_status=? WHERE id=?').run(r.text, r.status, id); audit(db, 'admin', 'admin', 'backfill_weather', 'record', id, { status: r.status }, ipOf(req)); return output(res, 200, { text: r.text, status: r.status }); }
  if (url.pathname === '/api/v1/admin/records/backfill-weather' && req.method === 'POST') { const p = await body(req); const ids = (Array.isArray(p.recordIds) ? p.recordIds : []).map(Number).filter(Number.isFinite); if (!ids.length) throw error(400, '请选择记录'); for (const id of ids) backfillRecordWeather(id); audit(db, 'admin', 'admin', 'backfill_weather_batch', 'record', ids.join(','), { count: ids.length }, ipOf(req)); return output(res, 200, { queued: ids.length }); }
  m = /^\/api\/v1\/admin\/journeys\/(\d+)\/track$/.exec(url.pathname);
  if (m && req.method === 'GET') { const journey = db.prepare('SELECT * FROM journeys WHERE id=?').get(Number(m[1])); if (!journey) throw error(404, '行程不存在'); const points = db.prepare('SELECT sequence,recorded_at,latitude,longitude,accuracy_m,speed_mps,mock_location FROM track_points WHERE journey_id=? ORDER BY sequence').all(journey.id); return output(res, 200, { points, display: smoothTrack(points) }); }
  if (url.pathname === '/api/v1/admin/logs' && req.method === 'GET') return output(res, 200, { logs: queryAppLogs(url) });
  m = /^\/api\/v1\/admin\/exports\/(csv|geojson|gpx|photos\.zip|audit\.csv|logs\.csv)$/.exec(url.pathname);
  if (m && req.method === 'GET') {
    const format = m[1], projectId = Number(url.searchParams.get('projectId') || 1);
    if (format === 'csv') { const bodyOut = Buffer.from(recordsCsv(adminRecords(projectId))); res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Length': bodyOut.length, 'Content-Disposition': 'attachment; filename="bsc-records.csv"' }); return res.end(bodyOut); }
    if (format === 'geojson') { const bodyOut = Buffer.from(recordsGeoJson(adminRecords(projectId))); res.writeHead(200, { 'Content-Type': 'application/geo+json; charset=utf-8', 'Content-Length': bodyOut.length, 'Content-Disposition': 'attachment; filename="bsc-records.geojson"' }); return res.end(bodyOut); }
    if (format === 'gpx') { const journeyId = Number(url.searchParams.get('journeyId') || 0); if (!journeyId) throw error(400, '请指定journeyId'); const journey = db.prepare('SELECT * FROM journeys WHERE id=?').get(journeyId); if (!journey) throw error(404, '行程不存在'); const points = db.prepare('SELECT recorded_at,latitude,longitude FROM track_points WHERE journey_id=? ORDER BY sequence').all(journeyId); const bodyOut = Buffer.from(gpx(points, `journey-${journeyId}`)); res.writeHead(200, { 'Content-Type': 'application/gpx+xml; charset=utf-8', 'Content-Length': bodyOut.length, 'Content-Disposition': `attachment; filename="journey-${journeyId}.gpx"` }); return res.end(bodyOut); }
    if (format === 'audit.csv') { const rows = db.prepare('SELECT * FROM audit_logs ORDER BY id').all().map(a => [a.id, a.actor_role, a.actor_id, a.action, a.entity_type, a.entity_id, a.details, a.ip_address, a.created_at]); const bodyOut = Buffer.from(`\uFEFFid,角色,操作者,动作,实体类型,实体ID,详情,IP,时间\r\n${rows.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')}\r\n`); res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Length': bodyOut.length, 'Content-Disposition': 'attachment; filename="bsc-audit.csv"' }); return res.end(bodyOut); }
    if (format === 'logs.csv') { const logs = queryAppLogs(url); const rows = logs.map(l => [l.id, l.created_at, l.client_created_at, l.level, l.villager_id, l.device_id, l.app_version, l.message, l.diagnostics]); const bodyOut = Buffer.from(`\uFEFFID,服务器接收时间,客户端时间,级别,采样员ID,设备ID,APP版本,消息,结构化详情\r\n${rows.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')}\r\n`); res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Length': bodyOut.length, 'Content-Disposition': 'attachment; filename="bsc-app-logs.csv"' }); return res.end(bodyOut); }
    const records = adminRecords(projectId); const entries = []; for (const r of records) { const file = path.join(DATA, r.photo_path.replace(/^\//, '')); if (!fs.existsSync(file)) continue; const day = String(r.captured_at || '').slice(0, 10) || 'unknown'; entries.push({ name: `${day}/${r.sample_code}-${r.id}.jpg`, data: fs.readFileSync(file), mtime: fs.statSync(file).mtime }); } const zip = zipStore(entries); res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': zip.length, 'Content-Disposition': 'attachment; filename="bsc-photos.zip"' }); return res.end(zip); }
  throw error(404, '管理员接口不存在');
}

function syncData(session) {
  expire();
  const tasks = db.prepare(`SELECT t.*,p.name project_name,p.code project_code,s.code site_code,s.name site_name,
    s.name_bo site_name_bo,s.latitude target_latitude,s.longitude target_longitude,s.normal_radius_m,s.exception_radius_m,
    s.severe_radius_m,s.reference_image,s.instructions,s.instructions_bo,s.risk_note,s.risk_note_bo,s.remarks,
    pv.display_name villager_name,pv.display_name primary_villager_name,bv.display_name backup_villager_name,
    av.display_name active_villager_name,fv.display_name final_villager_name,r.id record_id,r.review_status,r.photo_path,
    r.captured_at,r.received_at,r.latitude record_latitude,r.longitude record_longitude,r.accuracy_m record_accuracy_m,
    r.distance_m record_distance_m,r.weather_text,r.server_weather_text,r.server_weather_status,r.exception_category,
    r.exception_detail,r.mock_location,r.no_water
    FROM tasks t JOIN projects p ON p.id=t.project_id JOIN sites s ON s.id=t.site_id
    JOIN villagers pv ON pv.id=t.villager_id LEFT JOIN villagers bv ON bv.id=t.backup_villager_id
    LEFT JOIN villagers av ON av.id=COALESCE(t.active_villager_id,t.villager_id)
    LEFT JOIN villagers fv ON fv.id=t.final_villager_id LEFT JOIN records r ON r.task_id=t.id AND r.is_primary=1
    WHERE (t.villager_id=? OR t.backup_villager_id=?) AND p.enabled=1 AND s.deleted_at IS NULL AND t.canceled_at IS NULL
    ORDER BY CASE WHEN t.status IN('assigned','in_progress','saved_pending_upload') THEN 0 ELSE 1 END,t.planned_date DESC,t.id`)
    .all(session.villagerId, session.villagerId).map(task => ({ ...task,
      ...collaboration.assignmentPayload(task, session.villagerId),
      device_id: session.device.id,
      device_name: session.device.device_name || '',
      canceled_at: task.canceled_at || null,
      canceled_reason: task.canceled_reason || null,
      reference_image: task.reference_image ? `${config.publicBaseUrl}${signImage(task.reference_image, 30 * 86400)}` : '',
      photo_path: task.photo_path ? `${config.publicBaseUrl}${signImage(task.photo_path, 30 * 86400)}` : ''
    }));
  const villager = db.prepare('SELECT username,display_name FROM villagers WHERE id=?').get(session.villagerId);
  return { serverTime: new Date().toISOString(), villager: { id: session.villagerId, username: villager ? villager.username : '', displayName: villager ? villager.display_name : '' },
    device: { id: session.device.id, name: session.device.device_name || '' }, sampleTypes: publicSampleTypes(), tasks,
    rules: { normalRadiusM: 30, exceptionRadiusM: 80, severeRadiusM: 300, poorAccuracyM: 40,
      trackIntervalSeconds: 10, liveIntervalSeconds: 30, progressRefreshSeconds: 15,
      takeoverCooldownSeconds: collaboration.TAKEOVER_COOLDOWN_SECONDS } };
}

async function mobileApi(req, res, url) {
  if (url.pathname === '/api/v1/mobile/activate' && req.method === 'POST') { const p = await body(req, 50_000), key = `mobile:${ipOf(req)}:${String(p.username || '').toLowerCase()}`; const lim = rateLimit.check(key); if (lim.limited) throw error(429, '尝试过多，请稍后再试'); const user = db.prepare('SELECT * FROM villagers WHERE username=? AND enabled=1').get(required(p.username, '账号').toLowerCase()); if (!user) { rateLimit.recordFailure(key); throw error(401, '账号不存在或已停用'); } const hash = crypto.createHash('sha256').update(required(p.activationToken, '激活码')).digest('hex'), act = db.prepare("SELECT * FROM activation_codes WHERE villager_id=? AND token_hash=? AND used_at IS NULL AND datetime(expires_at)>datetime('now')").get(user.id, hash); if (!act) { rateLimit.recordFailure(key); const any = db.prepare('SELECT * FROM activation_codes WHERE villager_id=? AND token_hash=?').get(user.id, hash); if (any && any.used_at) throw Object.assign(error(403, '激活二维码已被使用，请让管理员重新生成'), { code: 'ACTIVATION_USED' }); if (any && new Date(any.expires_at) <= new Date()) throw Object.assign(error(403, '激活二维码已过期（24小时有效），请让管理员重新生成'), { code: 'ACTIVATION_EXPIRED' }); throw error(403, '激活二维码无效，请扫描正确的二维码'); } const redeemed = devicePolicy.redeemActivation(db, { user, activationId: act.id, deviceUuid: p.deviceUuid, deviceName: p.deviceName, androidVersion: p.androidVersion, appVersion: p.appVersion, actorIp: ipOf(req) }); rateLimit.recordSuccess(key); return output(res, 200, { token: signToken(config.sessionSecret, 'villager', user.id, { deviceId: redeemed.deviceId }, 3650 * 86400), villager: { id: user.id, username: user.username, displayName: user.display_name }, deviceId: redeemed.deviceId, replacedDeviceIds: redeemed.oldDeviceIds }); }
  if (url.pathname === '/api/v1/mobile/login' && req.method === 'POST') { const p = await body(req, 30_000), key = `mobile:${ipOf(req)}:${String(p.username || '').toLowerCase()}`; const lim = rateLimit.check(key); if (lim.limited) throw error(429, '尝试过多，请稍后再试'); const user = db.prepare('SELECT * FROM villagers WHERE username=? AND enabled=1').get(String(p.username || '').toLowerCase()); if (!user) { rateLimit.recordFailure(key); throw error(401, '账号不存在或已停用'); } const d = db.prepare('SELECT * FROM devices WHERE villager_id=? AND device_uuid=? AND enabled=1').get(user.id, String(p.deviceUuid || '')); if (!d) throw Object.assign(error(403, '手机尚未激活或本设备已失效'), { code: 'DEVICE_REVOKED' }); devicePolicy.touch(db, d.id); rateLimit.recordSuccess(key); return output(res, 200, { token: signToken(config.sessionSecret, 'villager', user.id, { deviceId: d.id }, 3650 * 86400), villager: { id: user.id, username: user.username, displayName: user.display_name }, deviceId: d.id }); }
  if (url.pathname === '/api/v1/mobile/app-version' && req.method === 'GET') { const v = db.prepare('SELECT version_code,version_name,notes,mandatory FROM app_versions ORDER BY version_code DESC LIMIT 1').get(); return output(res, 200, { versionCode: v ? v.version_code : 100, versionName: v ? v.version_name : '1.0.0', notes: v ? v.notes : '', mandatory: v ? (v.mandatory ? 1 : 0) : 0 }); }
  const session = mobile(req); if (url.pathname === '/api/v1/mobile/device-status' && req.method === 'POST') { const p = await body(req, 20_000); db.prepare(`UPDATE devices SET last_sync_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE last_sync_at END,pending_track_count=?,pending_record_count=?,app_version=? WHERE id=?`).run(p.syncCompleted ? 1 : 0, Math.max(0, Math.min(1000000, Number(p.pendingTrackCount || 0))), Math.max(0, Math.min(1000000, Number(p.pendingRecordCount || 0))), String(p.appVersion || session.device.app_version || ''), session.device.id); return output(res, 200, { ok: true }); } if (url.pathname === '/api/v1/mobile/sync' && req.method === 'GET') return output(res, 200, syncData(session));
  let scheduleMatch = /^\/api\/v1\/mobile\/tasks\/(\d+)\/schedule$/.exec(url.pathname);
   if (scheduleMatch && req.method === 'POST') { throw Object.assign(error(410, '计划时间由管理员统一设置，请更新 APP'), { code: 'MOBILE_SCHEDULE_REMOVED' }); }
  let m = /^\/api\/v1\/mobile\/tasks\/(\d+)\/start$/.exec(url.pathname);
  if (m && req.method === 'POST') { const id = Number(m[1]), p = await body(req); expire(); const access = collaboration.assertActive(db, id, session.villagerId); const task = db.prepare('SELECT t.*,s.latitude lat,s.longitude lon FROM tasks t JOIN sites s ON s.id=t.site_id WHERE t.id=?').get(id); if (task.locked_device_id && Number(task.locked_device_id) !== session.device.id && task.status === 'in_progress') throw Object.assign(error(409, '任务已被其他设备锁定'), { code: 'TASK_LOCKED' }); const lat = number(p.latitude, '纬度'), lon = number(p.longitude, '经度'), acc = number(p.accuracyM ?? 9999, '精度'), startDistance = distance(lat, lon, task.lat, task.lon); const journey = transaction(() => { let j = db.prepare("SELECT * FROM journeys WHERE task_id=? AND villager_id=? AND device_id=? AND assignment_version=? AND status='active' ORDER BY id DESC LIMIT 1").get(id, session.villagerId, session.device.id, access.assignment_version); if (!j) { const rid = db.prepare('INSERT INTO journeys(villager_id,device_id,site_id,task_id,assignment_version,started_at,start_latitude,start_longitude,start_accuracy_m,start_distance_m,weak_evidence) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?)').run(session.villagerId, session.device.id, task.site_id, id, access.assignment_version, lat, lon, acc, startDistance, startDistance < 300 ? 1 : 0).lastInsertRowid; j = db.prepare('SELECT * FROM journeys WHERE id=?').get(rid); } const changed = db.prepare("UPDATE tasks SET locked_device_id=?,locked_at=CURRENT_TIMESTAMP,journey_id=?,status='in_progress' WHERE id=? AND assignment_version=? AND COALESCE(active_villager_id,villager_id)=?").run(session.device.id, j.id, id, access.assignment_version, session.villagerId); if (!changed.changes) throw Object.assign(error(409, '采样权已变化，请刷新任务'), { code: 'ASSIGNMENT_CHANGED' }); return j; }); collaboration.addProgress(db, { taskId: id, villagerId: session.villagerId, deviceId: session.device.id, events: [{ clientEventId: `server-start-${journey.id}`, eventType: 'journey_started', assignmentVersion: access.assignment_version, occurredAt: journey.started_at, journeyId: journey.id, metadata: { startDistanceM: startDistance } }] }); return output(res, 200, { journey, assignmentVersion: access.assignment_version, startDistanceM: startDistance, weakEvidence: startDistance < 300 }); }
  m = /^\/api\/v1\/mobile\/journeys\/(\d+)\/track$/.exec(url.pathname);
  if (m && req.method === 'POST') { const id = Number(m[1]), j = db.prepare('SELECT * FROM journeys WHERE id=? AND villager_id=? AND device_id=?').get(id, session.villagerId, session.device.id); if (!j) throw error(404, '行程不存在'); const p = await body(req, 2_000_000), points = Array.isArray(p.points) ? p.points.slice(0, 1000) : [], add = db.prepare('INSERT OR IGNORE INTO track_points(journey_id,sequence,recorded_at,latitude,longitude,accuracy_m,speed_mps,mock_location) VALUES(?,?,?,?,?,?,?,?)'); let inserted = 0; transaction(() => points.forEach(x => { const r = add.run(id, Number(x.sequence), required(x.recordedAt, '轨迹时间'), number(x.latitude, '轨迹纬度'), number(x.longitude, '轨迹经度'), Number(x.accuracyM || 0), Number(x.speedMps || 0), x.mockLocation ? 1 : 0); inserted += Number(r.changes || 0); })); return output(res, 200, { inserted, received: points.length }); }
  m = /^\/api\/v1\/mobile\/tasks\/(\d+)\/live$/.exec(url.pathname);
  if (m && req.method === 'POST') { const id = Number(m[1]), p = await body(req, 30_000); collaboration.assertActive(db, id, session.villagerId); db.prepare(`INSERT INTO live_locations(task_id,device_id,recorded_at,latitude,longitude,accuracy_m) VALUES(?,?,?,?,?,?) ON CONFLICT(task_id) DO UPDATE SET device_id=excluded.device_id,recorded_at=excluded.recorded_at,latitude=excluded.latitude,longitude=excluded.longitude,accuracy_m=excluded.accuracy_m`).run(id, session.device.id, required(p.recordedAt, '时间'), number(p.latitude, '纬度'), number(p.longitude, '经度'), Number(p.accuracyM || 0)); return output(res, 200, { ok: true }); }
  m = /^\/api\/v1\/mobile\/tasks\/(\d+)\/progress$/.exec(url.pathname);
  if (m && req.method === 'GET') { const detail = collaboration.getProgress(db, Number(m[1]), session.villagerId, false); detail.records = detail.records.map(record => ({ ...record, photo_path: record.photo_path ? `${config.publicBaseUrl}${signImage(record.photo_path, 30 * 86400)}` : '' })); return output(res, 200, detail); }
  if (m && req.method === 'POST') { const p = await body(req, 500_000); return output(res, 200, collaboration.addProgress(db, { taskId: Number(m[1]), villagerId: session.villagerId, deviceId: session.device.id, events: p.events })); }
  m = /^\/api\/v1\/mobile\/tasks\/(\d+)\/takeover$/.exec(url.pathname);
  if (m && req.method === 'POST') { const p = await body(req, 30_000); const result = collaboration.takeover(db, { taskId: Number(m[1]), villagerId: session.villagerId, deviceId: session.device.id, confirmationCode: p.confirmationCode, reasonCode: p.reasonCode, reasonText: p.reasonText, expectedVersion: p.expectedAssignmentVersion, clientRequestId: p.clientRequestId }); audit(db, 'mobile', session.villagerId, 'takeover_task', 'task', m[1], { reasonCode: p.reasonCode, reasonText: p.reasonText, assignmentVersion: result.assignment.assignmentVersion, deviceId: session.device.id }, ipOf(req)); return output(res, 200, result); }
  m = /^\/api\/v1\/mobile\/tasks\/(\d+)\/record$/.exec(url.pathname);
  if (m && req.method === 'POST') return saveRecord(req, res, session, Number(m[1]));
  m = /^\/api\/v1\/mobile\/journeys\/(\d+)\/complete$/.exec(url.pathname);
  if (m && req.method === 'POST') { const result = db.prepare("UPDATE journeys SET status='completed',ended_at=CURRENT_TIMESTAMP WHERE id=? AND villager_id=? AND device_id=?").run(Number(m[1]), session.villagerId, session.device.id); if (!result.changes) throw error(404, '行程不存在'); return output(res, 200, { ok: true }); }
  m = /^\/api\/v1\/mobile\/journeys\/(\d+)\/interrupted$/.exec(url.pathname);
  if (m && req.method === 'POST') { const id = Number(m[1]); const j = db.prepare('SELECT id FROM journeys WHERE id=? AND villager_id=? AND device_id=?').get(id, session.villagerId, session.device.id); if (!j) throw error(404, '行程不存在'); db.prepare('UPDATE journeys SET interrupted=1 WHERE id=?').run(id); return output(res, 200, { ok: true }); }
  if (url.pathname === '/api/v1/mobile/logs' && req.method === 'POST') { const p = await body(req, 500_000), logs = Array.isArray(p.logs) ? p.logs.slice(0, 100) : [], add = db.prepare('INSERT INTO app_logs(villager_id,device_id,level,app_version,client_created_at,message,diagnostics) VALUES(?,?,?,?,?,?,?)'); transaction(() => logs.forEach(x => add.run(session.villagerId, session.device.id, String(x.level || 'error'), String(x.appVersion || ''), String(x.createdAt || ''), String(x.message || '').slice(0, 4000), JSON.stringify(x.diagnostics || {})))); return output(res, 201, { accepted: logs.length }); }
  throw error(404, '村民端接口不存在');
}

async function saveRecord(req, res, session, taskId) {
  const p = await body(req), client = required(p.clientRecordId, '本地记录编号'), duplicate = db.prepare('SELECT * FROM records WHERE client_record_id=?').get(client); if (duplicate) return output(res, 200, { id: duplicate.id, idempotent: true });
  collaboration.participantTask(db, taskId, session.villagerId);
  const task = db.prepare(`SELECT t.*,s.code site_code,s.name site_name,s.latitude target_lat,s.longitude target_lon,s.normal_radius_m,s.exception_radius_m,s.severe_radius_m,pj.name project_name,j.weak_evidence,j.interrupted FROM tasks t JOIN sites s ON s.id=t.site_id JOIN projects pj ON pj.id=t.project_id LEFT JOIN journeys j ON j.id=t.journey_id WHERE t.id=?`).get(taskId); if (!task) throw error(404, '任务不存在');
  // 新客户端显式传 0 表示“接管前离线行程尚未取得服务器编号”；这类证据仍需保留，
  // 不得误绑到当前采样人的 task.journey_id。旧客户端未传字段时才沿用历史回退逻辑。
  const requestedJourneyId = p.journeyId == null ? Number(task.journey_id || 0) : Number(p.journeyId || 0);
  const journey = requestedJourneyId ? db.prepare('SELECT * FROM journeys WHERE id=? AND villager_id=? AND device_id=?').get(requestedJourneyId, session.villagerId, session.device.id) : null;
  if (requestedJourneyId && (!journey || Number(journey.site_id) !== Number(task.site_id))) throw Object.assign(error(409, '采样记录的行程与当前设备或点位不匹配'), { code: 'JOURNEY_MISMATCH' });
  const effectiveJourneyId = journey ? journey.id : null;
  if (journey) { task.weak_evidence = journey.weak_evidence; task.interrupted = journey.interrupted; }
  const lat = number(p.latitude, '纬度'), lon = number(p.longitude, '经度'), acc = number(p.accuracyM ?? 9999, '精度'), dist = distance(lat, lon, task.target_lat, task.target_lon); if (dist > task.severe_radius_m) throw error(422, `距离${Math.round(dist)}米，超过300米`); const noWater = Boolean(p.noWater), manual = Boolean(p.manualCode); if (noWater && !String(p.exceptionCategory || '').trim()) throw error(422, '必须选择异常原因'); if (!noWater && !manual && !safeEqual(p.qrToken, task.qr_token)) throw error(422, '二维码不匹配'); if (manual && p.submittedCode !== task.sample_code) throw error(422, '手动编号不一致');
  const match = /^data:image\/(?:jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/.exec(String(p.photoDataUrl || '')); if (!match) throw error(422, '必须上传现场相机JPEG'); const image = Buffer.from(match[1], 'base64'); if (image.length < 100 || image.length > 8_000_000) throw error(413, '照片大小无效');
  const risks = []; if (dist > task.exception_radius_m) risks.push('distance_80_300m'); else if (dist > task.normal_radius_m) risks.push('distance_30_80m'); if (acc > 40) risks.push('gps_accuracy_over_40m'); if (manual) risks.push('manual_bottle_code'); if (p.mockLocation) risks.push('mock_location'); if (p.offlineStart) risks.push('offline_start_lock_unverified'); if (task.weak_evidence) risks.push('weak_start_track'); if (task.interrupted) risks.push('track_interrupted'); if (String(p.capturedAt).slice(0, 10) !== task.planned_date) risks.push('late_sampling'); if (task.canceled_at) risks.push('task_canceled'); if (!p.weatherText || p.weatherText === '待补充') risks.push('weather_pending'); if (!db.prepare('SELECT COUNT(*) count FROM track_points WHERE journey_id=?').get(effectiveJourneyId || -1).count) risks.push('missing_track');
  // 时间防篡改：拍摄时间明显晚于服务器时间（手机时钟被改）→ 可疑。
  const capturedMs = new Date(String(p.capturedAt)).getTime();
  if (Number.isFinite(capturedMs) && capturedMs - Date.now() > 5 * 60_000) risks.push('captured_time_in_future');
  // EXIF 交叉核对：照片 EXIF 拍摄时间与提交时间相差超过 5 分钟 → 可疑（无 EXIF 不判）。
  try {
    const meta = await sharp(image).metadata();
    if (meta && meta.exif) {
      const dt = parseExifDate(exifDateTime(meta.exif));
      if (dt && Number.isFinite(capturedMs) && Math.abs(dt.getTime() - capturedMs) > 5 * 60_000) risks.push('exif_time_mismatch');
    }
  } catch {}
  const hash = crypto.createHash('sha256').update(image).digest('hex'); if (db.prepare('SELECT id FROM records WHERE photo_sha256=?').get(hash)) risks.push('duplicate_photo');
  const dir = path.join(UPLOADS, String(task.project_id)); fs.mkdirSync(dir, { recursive: true }); const file = `${task.sample_code}-${client.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)}.jpg`, target = path.join(dir, file); await sharp(image).rotate().resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toFile(target);
  const submittedVersion = p.assignmentVersion == null ? (task.backup_villager_id == null && Number(task.assignment_version || 1) === 1 ? 1 : 0) : Number(p.assignmentVersion);
  const saved = (() => { try { return transaction(() => {
    const fresh = db.prepare('SELECT * FROM tasks WHERE id=?').get(taskId);
    const assignmentValid = collaboration.activeVillagerId(fresh) === session.villagerId && submittedVersion === Number(fresh.assignment_version || 1);
    const existing = db.prepare('SELECT id FROM records WHERE task_id=? AND is_primary=1').get(taskId);
    const primary = assignmentValid && !existing && !fresh.canceled_at && fresh.status !== 'submitted';
    const scope = assignmentValid ? 'active' : submittedVersion < Number(fresh.assignment_version || 1) ? 'pre_handover' : 'stale_after_handover';
    const conflict = primary ? 'none' : assignmentValid ? 'needs_review' : 'stale_assignment';
    const rid = db.prepare(`INSERT INTO records(client_record_id,task_id,device_id,journey_id,assignment_version,evidence_scope,is_primary,conflict_status,no_water,captured_at,latitude,longitude,accuracy_m,distance_m,weather_text,weather_status,exception_category,exception_detail,manual_code,mock_location,photo_path,photo_sha256,review_status,risk_flags) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(client, taskId, session.device.id, effectiveJourneyId, submittedVersion || 1, scope, primary ? 1 : 0, conflict, noWater ? 1 : 0, required(p.capturedAt, '拍照时间'), lat, lon, acc, dist, String(p.weatherText || '待补充'), p.weatherText && p.weatherText !== '待补充' ? 'complete' : 'pending', String(p.exceptionCategory || ''), String(p.exceptionDetail || ''), manual ? 1 : 0, p.mockLocation ? 1 : 0, `/uploads/${task.project_id}/${file}`, hash, risks.length ? 'suspicious' : 'pending', JSON.stringify([...new Set(risks)])).lastInsertRowid;
    if (primary) db.prepare("UPDATE tasks SET status='submitted',final_villager_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(session.villagerId, taskId);
    return { id: Number(rid), primary, assignmentValid, scope, currentVersion: Number(fresh.assignment_version || 1) };
  }); } catch (e) { console.error('saveRecord DB error:', e); throw error(422, `保存失败：${String(e.message || e).slice(0, 120)}`); } })();
  backfillRecordWeather(saved.id);
  if (saved.primary) {
    collaboration.addProgress(db, { taskId, villagerId: session.villagerId, deviceId: session.device.id,
      events: [{ clientEventId: `record-submit-${client}`, eventType: 'record_submitted', assignmentVersion: saved.currentVersion,
        occurredAt: String(p.capturedAt || new Date().toISOString()), journeyId: effectiveJourneyId, metadata: { recordId: saved.id } }] });
  }
  const response = { id: saved.id, primary: saved.primary, evidenceOnly: !saved.assignmentValid, evidenceScope: saved.scope,
    riskFlags: risks, severity: risks.some(x => ['distance_80_300m','manual_bottle_code','mock_location'].includes(x)) ? 'severe' : risks.length ? 'suspicious' : 'normal' };
  if (!saved.assignmentValid) return output(res, 409, { ...response, code: 'STALE_ASSIGNMENT', message: '采样权已变化；本机照片和记录已作为佐证保留，不能覆盖最终结果' });
  return output(res, 201, response);
}

const server = http.createServer(async (req, res) => { const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); try { if (url.pathname === '/health') return output(res, 200, { status: 'healthy', version: '1.6.0', time: new Date().toISOString() }); if (url.pathname.startsWith('/api/v1/admin/')) return await adminApi(req, res, url); if (url.pathname.startsWith('/api/v1/mobile/')) return await mobileApi(req, res, url); if (url.pathname.startsWith('/uploads/')) return serveImageDir(req, res, url, UPLOADS); if (url.pathname.startsWith('/reference/')) return serveImageDir(req, res, url, REFERENCE); if (req.method === 'GET') return serveFile(req, res, url); throw error(404, '接口不存在'); } catch (e) { console.error(req.method, url.pathname, e); if (!res.headersSent) output(res, e.status || 500, { message: e.status ? e.message : '服务器内部错误', code: e.code || undefined, retryAfterSeconds: e.retryAfterSeconds }); else res.destroy(); } });
const keepAlive = setInterval(() => rateLimit.prune(), 30 * 60_000);
keepAlive.unref?.();
server.listen(config.port, config.host, () => console.log(`BSC Sampling V1 listening on http://${config.host}:${config.port}`));
module.exports = server;
