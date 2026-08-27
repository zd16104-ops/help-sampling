'use strict';

// 轨迹展示平滑（仅用于管理站地图显示；原始轨迹点与 GPX 等导出文件一律不动，
// 保证证据链完整）：
// 1) 剔除孤立漂移点：与前后相邻点的推算速度都超过 8 m/s（步行/山路不可能），
//    且只有前后都超速才算孤立点，避免误删真实快速移动；
// 2) 按时间断点分段：相邻点间隔 >45 秒视为行程暂停/信号中断，段与段之间不连线，
//    避免出现横穿地图的直线；
// 3) 3 点滑动平均：消除 10 秒采样时 GPS 抖动造成的锯齿。

const R = 6371008.8;
const rad = x => x * Math.PI / 180;
function meters(a, b) {
  return 2 * R * Math.asin(Math.sqrt(
    Math.sin(rad(b[1] - a[1]) / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2
  ));
}

function smoothTrack(points) {
  const rows = [];
  for (const p of points) {
    const lat = Number(p.latitude), lon = Number(p.longitude);
    const at = new Date(p.recorded_at).getTime();
    if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(at)) rows.push({ lat, lon, at });
  }
  let dropped = points.length - rows.length;

  // 1. 孤立漂移点剔除
  const keep = [];
  for (let i = 0; i < rows.length; i++) {
    const prev = rows[i - 1], cur = rows[i], next = rows[i + 1];
    let spdPrev = 0, spdNext = 0;
    if (prev) { const dt = (cur.at - prev.at) / 1000; if (dt > 0) spdPrev = meters([prev.lon, prev.lat], [cur.lon, cur.lat]) / dt; }
    if (next) { const dt = (next.at - cur.at) / 1000; if (dt > 0) spdNext = meters([cur.lon, cur.lat], [next.lon, next.lat]) / dt; }
    if (prev && next && spdPrev > 8 && spdNext > 8) { dropped++; continue; }
    keep.push(cur);
  }

  // 2. 时间断点分段（>45s 不连线）
  const segments = [];
  let seg = [];
  for (let i = 0; i < keep.length; i++) {
    const cur = keep[i];
    if (seg.length && cur.at - keep[i - 1].at > 45000) { segments.push(seg); seg = []; }
    seg.push([cur.lat, cur.lon]);
  }
  if (seg.length) segments.push(seg);

  // 3. 3 点滑动平均
  const smoothed = segments.map(s => {
    if (s.length < 3) return s;
    const out = [s[0]];
    for (let i = 1; i < s.length - 1; i++) out.push([(s[i - 1][0] + s[i][0] + s[i + 1][0]) / 3, (s[i - 1][1] + s[i][1] + s[i + 1][1]) / 3]);
    out.push(s[s.length - 1]);
    return out;
  });

  return { segments: smoothed, dropped, total: points.length };
}

module.exports = { smoothTrack };
