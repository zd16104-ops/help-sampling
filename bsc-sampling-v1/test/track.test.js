'use strict';

// 轨迹展示平滑单元测试：只影响显示层，原始点不得被改动。

const test = require('node:test');
const assert = require('node:assert');
const { smoothTrack } = require('../src/track');

function pt(sequence, seconds, lat, lon) {
  return { sequence, recorded_at: new Date(Date.UTC(2026, 7, 27, 4, 0, seconds)).toISOString(), latitude: lat, longitude: lon, accuracy_m: 4, speed_mps: 1, mock_location: 0 };
}

test('时间断点分段：间隔超过45秒断开为多段', () => {
  const points = [
    pt(0, 0, 30.0, 94.0), pt(1, 10, 30.0001, 94.0001), pt(2, 20, 30.0002, 94.0002),
    pt(3, 140, 30.001, 94.001), pt(4, 150, 30.0011, 94.0011)
  ];
  const out = smoothTrack(points);
  assert.equal(out.segments.length, 2, `应分成2段，实际 ${out.segments.length}`);
  assert.equal(out.dropped, 0);
});

test('孤立漂移点剔除：前后推算速度都超8m/s的点被滤除', () => {
  const points = [
    pt(0, 0, 30.0, 94.0),
    pt(1, 10, 30.001, 94.001),     // 去程约15m/s（漂移）
    pt(2, 20, 30.00005, 94.00005), // 回程约15m/s（回正），中间点两侧都超速 → 孤立漂移
    pt(3, 30, 30.0001, 94.0001)
  ];
  const out = smoothTrack(points);
  assert.equal(out.dropped, 1, `应滤除1个漂移点，实际 ${out.dropped}`);
  const all = out.segments.flat();
  assert.equal(all.length, 3, '显示层剩3个点');
});

test('3点滑动平均平滑中间点', () => {
  const points = [pt(0, 0, 30.0, 94.0), pt(1, 10, 30.00005, 94.00005), pt(2, 20, 30.0001, 94.0001)];
  const out = smoothTrack(points);
  const seg = out.segments[0];
  assert.equal(out.dropped, 0, '正常步速点不应被滤除');
  assert.equal(seg.length, 3);
  assert.ok(Math.abs(seg[1][0] - (30.0 + 30.00005 + 30.0001) / 3) < 1e-9, '中间点应为三点均值');
});

test('输入数组不被修改', () => {
  const points = [pt(0, 0, 30.0, 94.0), pt(1, 10, 30.001, 94.001), pt(2, 20, 30.0004, 94.0004)];
  const copy = JSON.parse(JSON.stringify(points));
  smoothTrack(points);
  assert.deepEqual(points, copy);
});

test('空/单点输入安全', () => {
  assert.equal(smoothTrack([]).segments.length, 0);
  const one = smoothTrack([pt(0, 0, 30.0, 94.0)]);
  assert.equal(one.segments.length, 1);
  assert.equal(one.segments[0].length, 1);
});
