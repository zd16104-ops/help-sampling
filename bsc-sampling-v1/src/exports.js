'use strict';

// Data export builders: CSV, GeoJSON, GPX and a dependency-free ZIP (STORE
// method) for photo packs (spec section 17.1, acceptance item A14).

const RISK_NAMES = {
  distance_30_80m: '距目标30-80米',
  distance_80_300m: '距目标80-300米',
  gps_accuracy_over_40m: 'GPS精度超过40米',
  manual_bottle_code: '二维码损坏手输编号',
  mock_location: '模拟位置',
  duplicate_photo: '照片与既有记录重复',
  offline_start_lock_unverified: '断网开始未验证锁',
  weak_start_track: '开始前往时已在300米内',
  track_interrupted: '轨迹中断后恢复',
  missing_track: '提交时无轨迹点',
  late_sampling: '拍摄日期与计划日期不一致',
  task_canceled: '任务已取消后提交',
  weather_pending: '天气待补充',
  captured_time_in_future: '拍摄时间晚于服务器时间',
  exif_time_mismatch: '照片EXIF时间与提交时间不一致'
};

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

// Records as flattened CSV rows (BOM-prefixed so Excel opens UTF-8 correctly).
function recordsCsv(records) {
  const headers = ['样品编号', '历史序号', '点位名称', '样品类型', '项目', '采样员', '计划日期', '拍摄时间', '接收时间',
    '纬度(WGS84)', '经度(WGS84)', '距目标米', '精度米', '天气(手机)', '天气(服务器)', '瓶号输入', '无水', '异常类别', '异常说明',
    '模拟位置', '审核状态', '审核意见', '风险标志代码', '风险标志中文', '照片SHA-256', '照片路径'];
  const rows = records.map(r => [
    r.sample_code, r.site_code, r.site_name, r.sample_type, r.project_name, r.villager_name, r.planned_date,
    r.captured_at, r.received_at, r.latitude, r.longitude, Number(r.distance_m || 0).toFixed(1), r.accuracy_m,
    r.weather_text, r.server_weather_text || '', r.manual_code ? '手动输入' : '二维码扫描', r.no_water ? '是' : '否',
    r.exception_category, r.exception_detail, r.mock_location ? '是' : '否', r.review_status, r.review_note,
    (r.risk_flags || []).join('|'), (r.risk_flags || []).map(f => RISK_NAMES[f] || f).join('|'), r.photo_sha256, r.photo_path
  ]);
  return toCsv(headers, rows);
}

function sitesGeoJson(sites) {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: sites.map(s => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] },
      properties: { code: s.code, name: s.name, sort_order: s.sort_order, altitude_m: s.altitude_m, sample_types: s.sample_types }
    }))
  }, null, 2);
}

function recordsGeoJson(records) {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: records.map(r => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
      properties: {
        sample_code: r.sample_code, site_code: r.site_code, site_name: r.site_name,
        captured_at: r.captured_at, distance_m: r.distance_m, accuracy_m: r.accuracy_m,
        review_status: r.review_status, risk_flags: r.risk_flags, photo_sha256: r.photo_sha256
      }
    }))
  }, null, 2);
}

function gpx(points, name) {
  const trkpts = points.map(p => `      <trkpt lat="${p.latitude}" lon="${p.longitude}"><ele>0</ele><time>${p.recorded_at}</time></trkpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="BSC Sampling V1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${name}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

// --- Minimal ZIP writer (STORE method, UTF-8 names) ------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: day };
}

// entries: [{ name, data(Buffer), mtime(Date) }] → full zip Buffer (no compression).
function zipStore(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const { time, date } = dosDateTime(entry.mtime || new Date());
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0x0800, 6);        // flags: UTF-8 names
    local.writeUInt16LE(0, 8);             // method: store
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);  // compressed size
    local.writeUInt32LE(data.length, 22);  // uncompressed size
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);            // extra length
    chunks.push(local, nameBuffer, data);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);    // version made by
    centralHeader.writeUInt16LE(20, 6);    // version needed
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt32LE(0, 38);    // external attributes
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuffer, end]);
}

module.exports = { recordsCsv, sitesGeoJson, recordsGeoJson, gpx, zipStore, RISK_NAMES };
