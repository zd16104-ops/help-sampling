'use strict';

const { hashPin, randomToken } = require('./security');

function initialize(db) {
  db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;
  PRAGMA busy_timeout=5000;

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_test INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    sort_order INTEGER,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    altitude_m REAL,
    sample_types TEXT NOT NULL DEFAULT '[]',
    remarks TEXT NOT NULL DEFAULT '',
    normal_radius_m INTEGER NOT NULL DEFAULT 30,
    exception_radius_m INTEGER NOT NULL DEFAULT 80,
    severe_radius_m INTEGER NOT NULL DEFAULT 300,
    reference_image TEXT,
    instructions TEXT NOT NULL DEFAULT '',
    risk_note TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, code)
  );
  CREATE TABLE IF NOT EXISTS villagers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    pin_salt TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    villager_id INTEGER NOT NULL REFERENCES villagers(id),
    device_uuid TEXT NOT NULL,
    device_name TEXT NOT NULL DEFAULT '',
    android_version TEXT NOT NULL DEFAULT '',
    app_version TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT,
    UNIQUE(villager_id, device_uuid)
  );
  CREATE TABLE IF NOT EXISTS activation_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    villager_id INTEGER NOT NULL REFERENCES villagers(id),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS journeys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    villager_id INTEGER NOT NULL REFERENCES villagers(id),
    device_id INTEGER NOT NULL REFERENCES devices(id),
    site_id INTEGER NOT NULL REFERENCES sites(id),
    status TEXT NOT NULL DEFAULT 'active',
    started_at TEXT NOT NULL,
    ended_at TEXT,
    start_latitude REAL,
    start_longitude REAL,
    start_accuracy_m REAL,
    start_distance_m REAL,
    weak_evidence INTEGER NOT NULL DEFAULT 0,
    interrupted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    site_id INTEGER NOT NULL REFERENCES sites(id),
    villager_id INTEGER NOT NULL REFERENCES villagers(id),
    planned_date TEXT NOT NULL,
    base_sample_code TEXT NOT NULL,
    sample_code TEXT NOT NULL UNIQUE,
    sample_type TEXT NOT NULL,
    sequence INTEGER NOT NULL DEFAULT 1,
    resample_version INTEGER NOT NULL DEFAULT 0,
    resample_of INTEGER REFERENCES tasks(id),
    qr_token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'assigned',
    locked_device_id INTEGER REFERENCES devices(id),
    locked_at TEXT,
    journey_id INTEGER REFERENCES journeys(id),
    canceled_at TEXT,
    canceled_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS track_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    journey_id INTEGER NOT NULL REFERENCES journeys(id),
    sequence INTEGER NOT NULL,
    recorded_at TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy_m REAL,
    speed_mps REAL,
    mock_location INTEGER NOT NULL DEFAULT 0,
    UNIQUE(journey_id, sequence)
  );
  CREATE TABLE IF NOT EXISTS live_locations (
    task_id INTEGER PRIMARY KEY REFERENCES tasks(id),
    device_id INTEGER NOT NULL REFERENCES devices(id),
    recorded_at TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy_m REAL
  );
  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_record_id TEXT NOT NULL UNIQUE,
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    device_id INTEGER NOT NULL REFERENCES devices(id),
    journey_id INTEGER REFERENCES journeys(id),
    is_primary INTEGER NOT NULL DEFAULT 0,
    conflict_status TEXT NOT NULL DEFAULT 'none',
    no_water INTEGER NOT NULL DEFAULT 0,
    captured_at TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy_m REAL,
    distance_m REAL,
    weather_text TEXT NOT NULL DEFAULT '待补充',
    weather_status TEXT NOT NULL DEFAULT 'pending',
    exception_category TEXT,
    exception_detail TEXT,
    manual_code INTEGER NOT NULL DEFAULT 0,
    mock_location INTEGER NOT NULL DEFAULT 0,
    photo_path TEXT NOT NULL,
    photo_sha256 TEXT NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'pending',
    review_note TEXT NOT NULL DEFAULT '',
    risk_flags TEXT NOT NULL DEFAULT '[]',
    invalidated_at TEXT,
    invalidated_reason TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS one_primary_record_per_task ON records(task_id) WHERE is_primary=1;
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_role TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT NOT NULL DEFAULT '{}',
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS app_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    villager_id INTEGER REFERENCES villagers(id),
    device_id INTEGER REFERENCES devices(id),
    level TEXT NOT NULL DEFAULT 'error',
    app_version TEXT,
    client_created_at TEXT,
    message TEXT NOT NULL,
    diagnostics TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS app_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_code INTEGER NOT NULL UNIQUE,
    version_name TEXT NOT NULL,
    apk_path TEXT,
    sha256 TEXT,
    mandatory INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS label_prints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    sample_code TEXT NOT NULL,
    printed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  `);
  migrate(db);
  seed(db);
}

// Incremental migrations for databases created by earlier schema versions.
// New columns use ALTER TABLE so existing deployments keep their data.
function migrate(db) {
  const recordColumns = db.prepare('PRAGMA table_info(records)').all().map(c => c.name);
  if (!recordColumns.includes('server_weather_text')) {
    db.exec("ALTER TABLE records ADD COLUMN server_weather_text TEXT NOT NULL DEFAULT ''");
  }
  if (!recordColumns.includes('server_weather_status')) {
    db.exec("ALTER TABLE records ADD COLUMN server_weather_status TEXT NOT NULL DEFAULT 'pending'");
  }
  // 旧库种子点位曾写入 /sample-reference.svg 占位参考图（SVG，安卓端无法解码，
  // 造成"参考图传不到手机"的假象）。清空后由管理员在管理站上传真实照片。
  db.prepare("UPDATE sites SET reference_image='' WHERE reference_image='/sample-reference.svg'").run();
  // 旧库补建标签打印记录表；并登记当前 APP 版本供手机端检查更新。
  db.exec('CREATE TABLE IF NOT EXISTS label_prints (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL, sample_code TEXT NOT NULL, printed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  db.prepare('INSERT OR IGNORE INTO app_versions (version_code,version_name,notes) VALUES (?,?,?)').run(101, '1.1.0', '崩溃日志、照片压缩+EXIF、任务筛选、参考图放大、同步进度、更新提示');
}

function seed(db) {
  if (db.prepare('SELECT COUNT(*) AS count FROM projects').get().count) return;
  const formal = db.prepare('INSERT INTO projects (code,name,description,is_test) VALUES (?,?,?,0)')
    .run('BSC', '巴松措正式采样', '巴松措及周边河流、土壤、植物和降水同位素采样').lastInsertRowid;
  db.prepare('INSERT INTO projects (code,name,description,is_test) VALUES (?,?,?,1)')
    .run('TEST', '手机附近测试项目', '用于手机附近定位、扫码、拍照和上传验收');
  const addSite = db.prepare(`INSERT INTO sites
    (project_id,sort_order,code,name,latitude,longitude,altitude_m,sample_types,remarks,reference_image,instructions,risk_note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const points = [
    [1,'1',30.10761757,94.18555165,3909,['S','P'],'土，植'],[2,'2',30.1033386,94.17919466,3874,['S','P'],'土，植无水'],
    [3,'3',30.09971722,94.1735352,3847,['R'],'水'],[4,'4',30.07843188,94.15105954,3792,['R'],'水'],
    [5,'5',30.07534404,94.14583272,3797,['R'],'水'],[6,'5.1',30.07373626,94.14347224,3793,['T'],'水'],
    [7,'5.2',30.07116508,94.14175442,3787,['T'],'水'],[8,'5.5',30.06192633,94.12576279,3794,['T'],'水'],
    [9,'5.6',30.05359266,94.10829967,3744,['T'],'水'],[10,'6',30.04500898,94.09230734,3748,['S','P'],'土，植'],
    [11,'7',30.030085,94.0635533,3714,['R'],'水'],[12,'8',30.0110883,94.03046906,3663,['R'],'水'],
    [13,'9',30.00247099,94.01621964,3635,['S','P'],'土，植'],[14,'9.5',29.99942807,94.00757866,3603,['T'],'水'],
    [15,'9.6',29.99942807,94.00757866,3603,['T'],'水'],[16,'10',30.11252859,94.01643926,3488,['S','P'],'土，植'],
    [17,'11',30.0892012,94.02323766,3501,['R'],'水'],[18,'12',30.07181939,94.03200749,3496,['R'],'水'],
    [19,'13',29.99840891,93.98115009,3515,['R'],'水'],[20,'15',30.00211717,93.9032472,3482,['R'],'水'],
    [21,'16',29.98483153,93.86619065,3446,['R'],'水'],[22,'17',30.04490472,94.02068144,3478,['R'],'水'],
    [23,'18',30.04261412,94.02608625,3475,['R'],'水'],[24,'19',30.04138027,94.02855149,3475,['R'],'水'],
    [25,'20',30.04472337,94.02448383,3475,['R'],'水']
  ];
  for (const [order, code, lat, lon, altitude, types, remarks] of points) {
    addSite.run(formal, order, code, `采样点${code}`, lat, lon, altitude, JSON.stringify(types), remarks,
      '', '按照参考图片核对地点，安全取样后拍摄瓶子与实际环境。', '注意河岸湿滑、落石和水位变化');
  }
  const pin = hashPin('1234');
  db.prepare('INSERT INTO villagers (username,display_name,pin_salt,pin_hash) VALUES (?,?,?,?)')
    .run('cmy01', '采样员01', pin.salt, pin.hash);
  db.prepare('INSERT INTO app_versions (version_code,version_name,notes) VALUES (?,?,?)')
    .run(100, '1.0.0', '巴松措采样原生Android首版');
}

function audit(db, role, actorId, action, entityType, entityId, details = {}, ip = '') {
  db.prepare(`INSERT INTO audit_logs (actor_role,actor_id,action,entity_type,entity_id,details,ip_address)
    VALUES (?,?,?,?,?,?,?)`).run(role, String(actorId), action, entityType, entityId == null ? null : String(entityId), JSON.stringify(details), ip);
}

module.exports = { initialize, audit };
