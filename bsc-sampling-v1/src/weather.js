'use strict';

// Server-side historical weather backfill via the Open-Meteo archive API.
// The client's evidence photo and its original weather_text are never modified:
// results are stored in the separate server_weather_text / server_weather_status
// columns and only shown as auxiliary review information (spec section 15).

function weatherName(code) {
  if (code === 0) return '晴';
  if (code > 0 && code <= 3) return '多云';
  if (code === 45 || code === 48) return '雾';
  if (code >= 51 && code <= 67) return '雨';
  if (code >= 71 && code <= 77) return '雪';
  if (code >= 80 && code <= 82) return '阵雨';
  if (code >= 95) return '雷暴';
  return '未知';
}

// Pick the archive hour closest to the capturedAt instant. The archive API
// returns location-local wall-clock hours without an offset; capturing phones
// run on Chinese civil time (UTC+8), so hours are compared as local wall
// clock. Weather is auxiliary information only, never a verdict on its own.
async function backfillWeather(record) {
  const latitude = record.latitude;
  const longitude = record.longitude;
  const capturedAt = record.capturedAt || record.captured_at;
  const captured = new Date(capturedAt);
  if (Number.isNaN(captured.getTime())) throw new Error(`captured_at invalid: ${capturedAt}`);
  const day = capturedAt.slice(0, 10);
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}` +
    `&start_date=${day}&end_date=${day}&hourly=temperature_2m,precipitation,weather_code&timezone=Asia%2FShanghai`;
  const response = await fetch(url, { signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error(`open-meteo HTTP ${response.status}`);
  const data = await response.json();
  const hourly = data.hourly || {};
  const times = hourly.time || [];
  const temps = hourly.temperature_2m || [];
  const rains = hourly.precipitation || [];
  const codes = hourly.weather_code || [];
  if (!times.length || !temps.length) return { text: '待补充', status: 'unavailable' };
  const target = captured.getHours() * 3600_000 + captured.getMinutes() * 60_000 + captured.getSeconds() * 1000;
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const [h, m] = String(times[i]).slice(11, 16).split(':').map(Number);
    const ms = (h || 0) * 3600_000 + (m || 0) * 60_000;
    const diff = Math.abs(ms - target);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  const t = Number(temps[best]);
  if (!Number.isFinite(t)) return { text: '待补充', status: 'unavailable' };
  const rain = Number(rains[best] || 0);
  const code = Number(codes[best] ?? -1);
  return { text: `${weatherName(code)} ${t}℃，降水 ${rain}mm（服务器历史数据）`, status: 'complete' };
}

module.exports = { backfillWeather };
