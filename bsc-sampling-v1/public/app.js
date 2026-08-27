'use strict';

// 巴松措采样系统 V1 管理站前端（/api/v1 客户端）。
// 依赖：本地托管的 Leaflet 1.9.4 与 qrcodejs（public/vendor/），不依赖 CDN。

const $ = s => document.querySelector(s);
const TOKEN_KEY = 'bscAdminToken';
const TYPE_NAMES = { R: '河流水', T: '支流', S: '土壤', P: '植物', Y: '雨水', L: '湖水' };
const RISK_NAMES = {
  distance_30_80m: '距目标 30–80 米',
  distance_80_300m: '距目标 80–300 米',
  gps_accuracy_over_40m: 'GPS 精度超过 40 米',
  manual_bottle_code: '二维码损坏手输编号',
  mock_location: '模拟位置',
  duplicate_photo: '照片与既有记录重复',
  offline_start_lock_unverified: '断网开始未验证锁',
  weak_start_track: '开始前往时已在 300 米内',
  track_interrupted: '轨迹中断后恢复',
  missing_track: '提交时无轨迹点',
  late_sampling: '拍摄日期与计划日期不一致',
  task_canceled: '任务已取消后提交',
  weather_pending: '天气待补充',
  captured_time_in_future: '拍摄时间晚于服务器时间',
  exif_time_mismatch: '照片EXIF时间与提交时间不一致'
};
const SEVERE_RISKS = new Set(['distance_80_300m', 'manual_bottle_code', 'mock_location', 'duplicate_photo', 'task_canceled']);

const state = {
  projects: [], villagers: [], projectId: null, selectedDate: 'pending',
  tasks: [], sites: [], map: null, markers: [], siteMode: false, tableMode: false,
  editingSiteId: null, editingProjectId: null, pickMarker: null, pickPending: false, lastCreatedTaskIds: [], trackPolylines: []
};

function token() { return localStorage.getItem(TOKEN_KEY); }
function showLogin() {
  localStorage.removeItem(TOKEN_KEY);
  $('#login').classList.remove('hidden');
  $('#app').classList.add('hidden');
}
function showApp() { $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); }

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined && typeof options.body === 'string') headers['Content-Type'] = 'application/json';
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const res = await fetch(path, { ...options, headers });
  const type = res.headers.get('content-type') || '';
  let payload = {};
  if (type.includes('application/json')) { try { payload = await res.json(); } catch { payload = {}; } }
  else payload = { _text: await res.text() };
  if (res.status === 401) { showLogin(); throw new Error(payload.message || '登录已过期，请重新登录'); }
  if (!res.ok) throw new Error(payload.message || `请求失败：${res.status}`);
  return payload;
}
const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${value}T00:00:00`));
}
function formatTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d);
}
function reviewName(value) {
  return ({ approved: '已通过', pending: '待审核', suspicious: '可疑', rejected: '退回重采' })[value] || '待审核';
}
function markerColor(task) {
  if (task.canceled_at && !task.record_id) return 'gray';
  if (!task.record_id) return 'gray';
  if (task.review_status === 'approved') return 'green';
  if (task.review_status === 'rejected' || task.review_status === 'suspicious' || (task.risk_flags || []).length) return 'red';
  return 'amber';
}
function fmtBytes(bytes) {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}

// ---------- 登录 ----------
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('#loginError').textContent = '';
  try {
    const res = await post('/api/v1/admin/login', { password: $('#password').value, totp: $('#totp').value || undefined });
    localStorage.setItem(TOKEN_KEY, res.token);
    $('#password').value = ''; $('#totp').value = '';
    showApp();
    await init();
  } catch (error) { $('#loginError').textContent = error.message; }
});
$('#logoutButton').addEventListener('click', showLogin);
// 小屏下侧栏抽屉：☰ 展开 / 点遮罩关闭；点击侧栏内任意按钮后自动收起。
$('#menuButton').addEventListener('click', () => {
  document.querySelector('.sidebar').classList.add('open');
  document.querySelector('.sidebar-backdrop').classList.remove('hidden');
});
document.querySelector('.sidebar-backdrop').addEventListener('click', closeDrawer);
$('.sidebar').addEventListener('click', e => { if (e.target.closest('button')) closeDrawer(); });
function closeDrawer() {
  document.querySelector('.sidebar').classList.remove('open');
  document.querySelector('.sidebar-backdrop').classList.add('hidden');
}

// ---------- 初始化 ----------
async function init() {
  try {
    const boot = await api('/api/v1/admin/bootstrap');
    state.projects = boot.projects;
    state.villagers = boot.villagers;
    renderProjects();
    state.projectId = state.projectId || state.projects[0]?.id;
    if (!state.projectId) throw new Error('没有可用项目');
    initMap();
    await loadAll();
    checkHealth();
  } catch (error) {
    if (token()) alert(error.message);
  }
}

function renderProjects() {
  const list = $('#projectList');
  list.innerHTML = '';
  state.projects.forEach(project => {
    const row = document.createElement('div');
    row.className = 'project-row';
    const button = document.createElement('button');
    button.className = 'project' + (project.id === state.projectId ? ' active' : '');
    button.innerHTML = `<span>${project.is_test ? '🧪' : '💧'}</span><span>${esc(project.name)}${project.enabled ? '' : '（停用）'}</span>`;
    button.addEventListener('click', async () => {
      state.projectId = project.id;
      state.selectedDate = 'pending';
      state.siteMode = false;
      $('#siteManageButton').classList.remove('active');
      renderProjects();
      await loadAll();
    });
    const editBtn = document.createElement('button');
    editBtn.className = 'project-tool';
    editBtn.textContent = '✎';
    editBtn.title = '编辑项目';
    editBtn.addEventListener('click', () => openProjectDialog(project));
    const delBtn = document.createElement('button');
    delBtn.className = 'project-tool';
    delBtn.textContent = '✕';
    delBtn.title = '删除项目（有任务数据时只能停用）';
    delBtn.addEventListener('click', async () => {
      if (!confirm(`确认删除项目“${project.name}”？已有任务数据时会被拒绝，只能停用。`)) return;
      try {
        await api(`/api/v1/admin/projects/${project.id}`, { method: 'DELETE' });
        await refreshProjects();
      } catch (error) { alert(error.message); }
    });
    row.append(button, editBtn, delBtn);
    list.append(row);
  });
}

async function refreshProjects() {
  const boot = await api('/api/v1/admin/bootstrap');
  state.projects = boot.projects;
  state.villagers = boot.villagers;
  if (!state.projects.some(p => p.id === state.projectId)) state.projectId = state.projects[0]?.id || null;
  renderProjects();
  if (state.projectId) await loadAll();
}

function openProjectDialog(project = null) {
  state.editingProjectId = project ? project.id : null;
  $('#projectDialogTitle').textContent = project ? `编辑项目 ${project.code}` : '新建项目';
  $('#projectCode').value = project ? project.code : '';
  $('#projectName').value = project ? project.name : '';
  $('#projectDescription').value = project ? (project.description || '') : '';
  $('#projectIsTest').checked = Boolean(project?.is_test);
  $('#projectEnabled').checked = project ? Boolean(project.enabled) : true;
  $('#projectEnabledLine').style.display = project ? '' : 'none';
  $('#projectDialog').showModal();
}

$('#newProjectButton').addEventListener('click', () => openProjectDialog(null));
$('#saveProject').addEventListener('click', async () => {
  const data = {
    code: $('#projectCode').value.trim(),
    name: $('#projectName').value.trim(),
    description: $('#projectDescription').value,
    isTest: $('#projectIsTest').checked,
    enabled: $('#projectEnabled').checked
  };
  if (!data.code || !data.name) return alert('请填写项目编码和名称');
  try {
    if (state.editingProjectId) {
      await api(`/api/v1/admin/projects/${state.editingProjectId}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      await post('/api/v1/admin/projects', data);
    }
    $('#projectDialog').close();
    await refreshProjects();
  } catch (error) { alert(error.message); }
});

async function loadAll() {
  const [sites, tasks] = await Promise.all([
    api(`/api/v1/admin/sites?projectId=${state.projectId}`),
    api(`/api/v1/admin/tasks?projectId=${state.projectId}`)
  ]);
  state.sites = sites.sites;
  state.tasks = tasks.tasks;
  renderDates();
  render();
}

// 左侧日期 = 待采样任务的计划日期 ∪ 已提交记录的拍摄日期（自动归档）。
function dateSet() {
  const dates = new Set();
  for (const t of state.tasks) {
    if (t.record_id && t.captured_at) dates.add(String(t.captured_at).slice(0, 10));
    else if (!t.record_id && t.planned_date) dates.add(String(t.planned_date).slice(0, 10));
  }
  return [...dates].sort((a, b) => b.localeCompare(a));
}

function renderDates() {
  const nav = $('#dateList');
  nav.innerHTML = '';
  const pendingCount = state.tasks.filter(t => !t.record_id).length;
  nav.append(dateButton('pending', '待采样任务', pendingCount));
  dateSet().forEach(date => {
    const count = state.tasks.filter(t => (t.record_id && t.captured_at && String(t.captured_at).slice(0, 10) === date) || (!t.record_id && t.planned_date === date)).length;
    nav.append(dateButton(date, formatDate(date), count));
  });
}

function dateButton(value, label, count) {
  const button = document.createElement('button');
  button.className = state.selectedDate === value ? 'active' : '';
  button.innerHTML = `<span>${label}</span><b>${count}</b>`;
  button.addEventListener('click', () => {
    state.selectedDate = value;
    state.siteMode = false;
    $('#siteManageButton').classList.remove('active');
    document.querySelectorAll('#dateList button').forEach(b => b.classList.remove('active'));
    button.classList.add('active');
    render();
  });
  return button;
}

function currentTasks() {
  if (state.selectedDate === 'pending') return state.tasks.filter(t => !t.record_id);
  const d = state.selectedDate;
  return state.tasks.filter(t => (t.record_id && t.captured_at && String(t.captured_at).slice(0, 10) === d) || (!t.record_id && t.planned_date === d));
}

function render() {
  const tasks = currentTasks();
  const project = state.projects.find(p => p.id === state.projectId);
  $('#crumb').textContent = `项目 / ${project ? project.name : ''}`;
  if (state.siteMode) {
    $('#pageTitle').textContent = `点位管理（${state.sites.length} 个）`;
  } else if (state.selectedDate === 'pending') {
    $('#pageTitle').textContent = '待采样任务';
  } else {
    $('#pageTitle').textContent = `${formatDate(state.selectedDate)} 采样记录`;
  }
  $('#statAll').textContent = tasks.length;
  $('#statApproved').textContent = tasks.filter(t => t.review_status === 'approved').length;
  $('#statPending').textContent = tasks.filter(t => t.record_id && t.review_status !== 'approved').length;
  $('#statUnfinished').textContent = tasks.filter(t => !t.record_id).length;
  const tableWrap = $('#taskTableWrap');
  const mapPanel = document.querySelector('.map-panel');
  if (state.tableMode) {
    tableWrap.classList.remove('hidden');
    mapPanel.classList.add('hidden');
    $('#tableViewButton').textContent = '⌖ 地图';
    renderTable(tasks);
  } else {
    tableWrap.classList.add('hidden');
    mapPanel.classList.remove('hidden');
    $('#tableViewButton').textContent = '▦ 表格';
    renderMap(tasks);
  }
}

// ---------- 表格视图（筛选 + 批量审核 + 批量天气） ----------
function renderTable(tasks) {
  const vill = $('#tableVillager');
  const names = [...new Set(state.tasks.map(t => t.villager_name).filter(Boolean))].sort();
  vill.innerHTML = '<option value="">全部采样员</option>' + names.map(n => `<option${vill.value === n ? ' selected' : ''}>${esc(n)}</option>`).join('');
  const q = $('#tableSearch').value.trim().toLowerCase();
  const status = $('#tableStatus').value;
  const vf = vill.value;
  const rows = tasks.filter(t => {
    if (vf && t.villager_name !== vf) return false;
    if (q && !(String(t.sample_code).toLowerCase().includes(q) || String(t.site_name).toLowerCase().includes(q))) return false;
    if (status === 'pending') return !t.record_id && !t.canceled_at;
    if (status === 'review') return t.record_id && t.review_status !== 'approved' && t.review_status !== 'rejected';
    if (status === 'approved') return t.review_status === 'approved';
    if (status === 'rejected') return t.review_status === 'rejected';
    if (status === 'canceled') return Boolean(t.canceled_at);
    return true;
  });
  $('#taskTableBody').innerHTML = rows.map(t => {
    const reviewable = t.record_id && t.review_status !== 'approved' && t.review_status !== 'rejected';
    return `<tr data-id="${t.id}">
      <td>${reviewable ? `<input type="checkbox" class="row-check" data-record="${t.record_id}">` : ''}</td>
      <td>${esc(t.sample_code)}</td>
      <td>${esc(t.site_name)}${t.canceled_at ? '<br><span class="cancel-note">已取消</span>' : ''}</td>
      <td>${esc(TYPE_NAMES[t.sample_type] || t.sample_type)}</td>
      <td>${esc(t.planned_date)}</td>
      <td>${esc(t.villager_name || '')}</td>
      <td>${t.distance_m != null ? Math.round(Number(t.distance_m)) + ' 米' : '-'}</td>
      <td>${t.record_id ? reviewName(t.review_status) : (t.canceled_at ? '已取消' : '待采样')}</td>
      <td><button class="ghost row-open">查看</button></td>
    </tr>`;
  }).join('');
  document.querySelectorAll('#taskTableBody .row-open').forEach(b => b.addEventListener('click', () => {
    const t = state.tasks.find(x => x.id === Number(b.closest('tr').dataset.id));
    if (t) showDetail(t);
  }));
  $('#tableCheckAll').checked = false;
}

// ---------- 地图 ----------
function initMap() {
  if (!window.L) { $('#mapFallback').classList.remove('hidden'); return; }
  // keyboard:false 避免地图容器获得 tabindex 焦点，防止点击时浏览器
  // 把容器滚动进视口导致点击目标在 mousedown/mouseup 之间移位。
  state.map = L.map('map', { zoomControl: true, keyboard: false }).setView([30.04, 94.05], 11);
  const imagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    // 该区域影像最深到 17 级（18/19 级返回"地图数据未允许"占位图而非报错，
    // 无法用 tileerror 探测）。锁定原生层级到 17：继续放大直接拉伸 17 级影像，
    // 不再请求更深的无数据层级（与 Android 端 maxzoom=17 保持一致）。
    maxZoom: 19, maxNativeZoom: 17, attribution: '影像 © Esri及其数据提供方 · 坐标WGS84'
  });
  // 自适应锁定：某个缩放层级的瓦片连续加载失败（无数据/网络失败）时，
  // 不再请求更深层级，继续放大用已有层级放大显示，避免地图变空白。
  const tileFailures = {};
  imagery.on('tileerror', () => {
    const zoom = Math.round(state.map.getZoom());
    tileFailures[zoom] = (tileFailures[zoom] || 0) + 1;
    if (tileFailures[zoom] >= 5 && zoom > 1 && imagery.options.maxNativeZoom > zoom - 1) {
      imagery.options.maxNativeZoom = zoom - 1;
      imagery.redraw();
      const note = $('#tileZoomNote');
      if (note) {
        note.classList.remove('hidden');
        note.textContent = `底图在级别 ${zoom} 没有可用影像，已锁定到级别 ${zoom - 1}（继续放大为放大显示，不再加载更深层级）`;
      }
    }
  });
  imagery.addTo(state.map);
  state.map.on('click', e => {
    if (state.pickMarker) return;
    if (state.pickMode) { finishPick(e.latlng.lat, e.latlng.lng); return; }
    if (state.siteMode) openSiteDialog(null, { latitude: e.latlng.lat, longitude: e.latlng.lng });
  });
  // 鼠标右键在地图上选点 → 直接打开"设置采样点"并填好坐标。
  state.map.on('contextmenu', e => {
    if (e.originalEvent) e.originalEvent.preventDefault();
    if (state.pickMarker) return;
    openSiteDialog(null, { latitude: e.latlng.lat, longitude: e.latlng.lng });
  });
  setTimeout(() => state.map.invalidateSize(), 50);
}

// 采样点标记：水滴外形轮廓 SVG，状态色填充（灰=待采样 橙=待审核 绿=已通过 红=异常/退回）。
const MARKER_COLORS = { gray: '#7f8d8c', amber: '#ef9c2f', green: '#16a27a', red: '#d95d58' };
function dropSvg(color) {
  return `<svg width="26" height="34" viewBox="0 0 26 34" xmlns="http://www.w3.org/2000/svg"><path d="M13 1C13 1 2 13.6 2 22.2a11 11 0 0 0 22 0C24 13.6 13 1 13 1Z" fill="${color}" stroke="#ffffff" stroke-width="2.5"/></svg>`;
}
function taskIcon(task) {
  const colorClass = markerColor(task);
  return L.divIcon({ className: '', iconSize: [26, 34], iconAnchor: [13, 31], html: `<div class="sample-marker ${colorClass}">${dropSvg(MARKER_COLORS[colorClass])}</div>` });
}
function siteIcon(site) {
  const colorClass = site.enabled ? 'green' : 'gray';
  return L.divIcon({ className: '', iconSize: [26, 34], iconAnchor: [13, 31], html: `<div class="sample-marker ${colorClass}">${dropSvg(MARKER_COLORS[colorClass])}</div>` });
}

function clearMapLayers() {
  state.markers.forEach(m => m.remove());
  state.markers = [];
  state.trackPolylines.forEach(p => p.remove());
  state.trackPolylines = [];
}

async function renderMap(tasks) {
  if (!state.map) return;
  clearMapLayers();
  const bounds = [];
  if (state.siteMode) {
    state.sites.forEach(site => {
      const marker = L.marker([site.latitude, site.longitude], { icon: siteIcon(site), keyboard: false }).addTo(state.map)
        .bindTooltip(`${esc(site.code)} · ${esc(site.name)}${site.enabled ? '' : '（停用）'}`, { permanent: true, direction: 'top', className: 'map-label', offset: [0, -36] });
      marker.on('click', () => openSiteDialog(site));
      state.markers.push(marker);
      bounds.push([site.latitude, site.longitude]);
    });
    if (bounds.length) state.map.fitBounds(bounds, { padding: [65, 65], maxZoom: 16, animate: false });
    return;
  }
  // 先同步渲染标记与定位，保证交互稳定；轨迹在之后异步叠加。
  // 同一点位的多个任务坐标完全相同，直接叠加会重叠成一个点，因此按点位分组
  // 并围绕中心展开（蜘蛛式散开），首个标记显示"名称 ×数量"。
  const groups = new Map();
  for (const task of tasks) {
    const key = `${task.site_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  for (const group of groups.values()) {
    group.forEach((task, index) => {
      const lat = task.target_latitude;
      const lng = task.target_longitude;
      let markerLat = lat;
      let markerLng = lng;
      if (group.length > 1) {
        const angle = (index / group.length) * 2 * Math.PI - Math.PI / 2;
        const radiusM = 28;
        markerLat = lat + (radiusM * Math.sin(angle)) / 111320;
        markerLng = lng + (radiusM * Math.cos(angle)) / (111320 * Math.cos(lat * Math.PI / 180));
      }
      const marker = L.marker([markerLat, markerLng], { icon: taskIcon(task), keyboard: false }).addTo(state.map);
      const hoverText = task.record_id
        ? `${esc(task.site_name)}<br>${esc(task.sample_code)}<br>距目标点 ${Number(task.distance_m || 0).toFixed(1)}m`
        : `${esc(task.site_name)}<br>${esc(task.sample_code)}`;
      if (index === 0) {
        const label = `${esc(task.site_name)}${group.length > 1 ? ` ×${group.length}` : ''}`;
        marker.bindTooltip(label, { permanent: true, direction: 'top', className: 'map-label', offset: [0, -40] });
        marker.options.title = hoverText;
      } else {
        marker.bindTooltip(hoverText);
      }
      marker.on('click', () => showDetail(task));
      state.markers.push(marker);
      bounds.push([lat, lng]);
    });
    const first = group[0];
    const circle = L.circle([first.target_latitude, first.target_longitude], { radius: first.normal_radius_m || 30, color: '#16a27a', weight: 1.4, fillOpacity: 0.05, keyboard: false }).addTo(state.map);
    state.markers.push(circle);
  }
  if (bounds.length) state.map.fitBounds(bounds, { padding: [65, 65], maxZoom: 16, animate: false });
  const trackTasks = tasks.filter(t => t.journey_id).slice(0, 60);
  const trackResults = await Promise.all(trackTasks.map(t => api(`/api/v1/admin/journeys/${t.journey_id}/track`).catch(() => null)));
  trackTasks.forEach((task, index) => {
    const track = trackResults[index];
    if (track && Array.isArray(track.points) && track.points.length) {
      const line = L.polyline(track.points.map(p => [p.latitude, p.longitude]), { color: '#326fcb', weight: 3, opacity: 0.65 }).addTo(state.map);
      state.trackPolylines.push(line);
    }
  });
}

$('#fitMap').addEventListener('click', () => renderMap(state.siteMode ? state.sites : currentTasks()));
// 表格视图：切换、筛选、批量审核通过、批量补齐天气
$('#tableViewButton').addEventListener('click', () => { state.tableMode = !state.tableMode; render(); });
$('#tableVillager').addEventListener('change', () => renderTable(currentTasks()));
$('#tableStatus').addEventListener('change', () => renderTable(currentTasks()));
$('#tableSearch').addEventListener('input', () => renderTable(currentTasks()));
$('#tableCheckAll').addEventListener('change', e => document.querySelectorAll('#taskTableBody .row-check').forEach(c => { c.checked = e.target.checked; }));
$('#batchApprove').addEventListener('click', async () => {
  const ids = [...document.querySelectorAll('#taskTableBody .row-check:checked')].map(c => Number(c.dataset.record));
  if (!ids.length) return alert('请先勾选要审核的记录');
  if (!confirm(`批量审核通过 ${ids.length} 条记录？`)) return;
  let ok = 0, failed = 0;
  for (const id of ids) {
    try { await post(`/api/v1/admin/records/${id}/review`, { status: 'approved' }); ok++; } catch { failed++; }
  }
  alert(`完成：通过 ${ok} 条${failed ? `，失败 ${failed} 条` : ''}`);
  await loadAll(); render();
});
$('#batchWeather').addEventListener('click', async () => {
  const ids = currentTasks().filter(t => t.record_id && t.server_weather_status !== 'complete').map(t => t.record_id);
  if (!ids.length) return alert('本页没有需要补齐天气的记录');
  try { const res = await post('/api/v1/admin/records/backfill-weather', { recordIds: ids }); alert(`已排队补齐 ${res.queued} 条记录，稍后刷新查看。`); } catch (e) { alert(e.message); }
});
$('#refresh').addEventListener('click', async () => { await loadAll(); checkHealth(); });

// ---------- 审核详情 ----------
$('#closeDetail').addEventListener('click', () => {
  $('#detail').classList.add('hidden');
  state.trackPolylines.forEach(p => p.remove());
  state.trackPolylines = [];
});

function riskBadges(task) {
  const flags = task.risk_flags || [];
  if (!flags.length) return '<div class="risk risk-ok">✓ 无自动风险标志</div>';
  const items = flags.map(f => `<span class="risk-badge ${SEVERE_RISKS.has(f) ? 'severe' : 'warn'}">${esc(RISK_NAMES[f] || f)}</span>`).join('');
  return `<div class="risk"><div class="risk-title">⚠ 需要复核的证据（自动标记，不代表结论）</div><div class="risk-list">${items}</div></div>`;
}

async function showDetail(task) {
  $('#detail').classList.remove('hidden');
  $('#detailCode').textContent = task.sample_code;
  $('#detailTitle').textContent = task.site_name;
  state.trackPolylines.forEach(p => p.remove());
  state.trackPolylines = [];
  let trackInfo = '<div class="empty-detail"><strong>暂无轨迹</strong><p>该任务没有关联轨迹点。</p></div>';
  if (task.journey_id) {
    try {
      const track = await api(`/api/v1/admin/journeys/${task.journey_id}/track`);
      if (track.points && track.points.length) {
        // 优先画平滑分段（漂移点已滤除、时间断点断开、滑动平均去锯齿）；原始点不变。
        const segs = (track.display && Array.isArray(track.display.segments) ? track.display.segments : [])
          .filter(s => s.length >= 2)
          .map(s => s.map(p => [p[0], p[1]]));
        if (!segs.length) segs.push(track.points.map(p => [p.latitude, p.longitude]));
        let bounds = null;
        for (const seg of segs) {
          const line = L.polyline(seg, { color: '#326fcb', weight: 4, opacity: 0.8 }).addTo(state.map);
          state.trackPolylines.push(line);
          bounds = bounds ? bounds.extend(line.getBounds()) : line.getBounds();
        }
        if (bounds) state.map.fitBounds(bounds, { padding: [70, 70], maxZoom: 16, animate: false });
        const dropped = (track.display && track.display.dropped) || 0;
        const segNote = segs.length > 1 ? `，${segs.length} 段（暂停/信号中断处断开）` : '';
        trackInfo = `<div class="record-grid"><div><small>轨迹点数</small><strong>${track.points.length}</strong></div><div><small>模拟位置点</small><strong>${track.points.filter(p => p.mock_location).length}</strong></div></div>${(dropped || segNote) ? `<p class="dialog-tip">轨迹已平滑显示${dropped ? `（滤除 ${dropped} 个漂移点）` : ''}${segNote}；原始数据与 GPX 导出未改动。</p>` : ''}`;
      }
    } catch { trackInfo = '<div class="empty-detail">轨迹读取失败。</div>'; }
  }
  const body = $('#detailBody');
  if (!task.record_id) {
    const statusLine = task.canceled_at
      ? `<div class="status-line canceled">状态：已取消（${formatTime(task.canceled_at)}）</div>`
      : task.locked_device_id
        ? `<div class="status-line active">状态：进行中（设备已锁定）</div>`
        : `<div class="status-line pending">状态：待采样</div>`;
    body.innerHTML = `
      ${task.reference_image ? `<img class="record-photo" src="${esc(task.reference_image)}" alt="现场参考图">` : ''}
      ${statusLine}
      <div class="empty-detail"><strong>等待村民采样</strong>
      <p>计划日期 ${esc(task.planned_date)} · ${esc(TYPE_NAMES[task.sample_type] || task.sample_type)} · ${esc(task.villager_name || '')}</p>
      <p>${esc(task.instructions || '暂无采样说明')}</p>
      <p>正常范围 ${task.normal_radius_m || 30}m · 异常上限 ${task.exception_radius_m || 80}m · 硬上限 300m</p>
      ${task.canceled_at ? `<p class="cancel-note">取消原因：${esc(task.canceled_reason || '未填写')}（记录保留，供审计）</p>` : ''}</div>
      ${task.locked_device_id ? `<p class="dialog-tip">已被设备锁定（${formatTime(task.locked_at)}）</p><button class="ghost-danger" id="unlockTask">人工解锁设备</button>` : ''}
      ${!task.canceled_at ? `<div class="detail-actions"><button class="ghost-danger" id="cancelTask">取消此任务</button><button class="secondary" id="rescheduleTask">改期（重新编号）</button></div>` : ''}
      ${task.journey_id ? `<a class="secondary gpx-link" href="#" id="exportGpx">导出本任务轨迹 GPX</a>` : ''}
      ${task.journey_id ? trackInfo : ''}`;
    if (task.journey_id && $('#exportGpx')) $('#exportGpx').addEventListener('click', e => { e.preventDefault(); downloadFile(`/api/v1/admin/exports/gpx?journeyId=${task.journey_id}`, `journey-${task.journey_id}.gpx`); });
    if ($('#cancelTask')) $('#cancelTask').addEventListener('click', async () => {
      const reason = prompt('请输入取消原因（会保留记录，供审计）：', '管理员取消');
      if (reason === null) return;
      try { await post(`/api/v1/admin/tasks/${task.id}/cancel`, { reason }); await loadAll(); render(); showDetail(state.tasks.find(t => t.id === task.id) || task); }
      catch (error) { alert(error.message); }
    });
    if ($('#rescheduleTask')) $('#rescheduleTask').addEventListener('click', async () => {
      const date = prompt(`任务当前计划日期：${task.planned_date}\n请输入新的计划采样日期（YYYY-MM-DD）。\n编号将按新日期重新生成，已打印的旧标签作废，需要重新打印：`, task.planned_date);
      if (date === null || !/^\d{4}-\d{2}-\d{2}$/.test(String(date).trim())) return;
      try {
        const res = await post(`/api/v1/admin/tasks/${task.id}/reschedule`, { plannedDate: String(date).trim() });
        alert(`已改期。新编号：${res.sampleCode}。请重新打印标签。`);
        await loadAll(); render(); showDetail(state.tasks.find(t => t.id === task.id) || task);
      } catch (error) { alert(error.message); }
    });
    if ($('#unlockTask')) $('#unlockTask').addEventListener('click', async () => {
      if (!confirm('确认人工解锁？该任务将回到待采样状态。')) return;
      try { await post(`/api/v1/admin/tasks/${task.id}/unlock`, {}); await loadAll(); render(); showDetail(state.tasks.find(t => t.id === task.id) || task); }
      catch (error) { alert(error.message); }
    });
    return;
  }
  const weather = task.server_weather_text || (task.server_weather_status === 'unavailable' ? '服务器天气查询失败' : '服务器天气待补齐');
  const delayMinutes = (task.received_at && task.captured_at)
    ? Math.max(0, Math.round((new Date(task.received_at) - new Date(task.captured_at)) / 60000))
    : null;
  const journeyMeta = task.start_distance_m != null
    ? `<div class="record-grid"><div><small>开始时距目标</small><strong>${Number(task.start_distance_m).toFixed(1)} 米${Number(task.start_distance_m) < 300 ? '（弱证据）' : ''}</strong></div><div><small>轨迹状态</small><strong>${task.interrupted ? '⚠ 中断后恢复' : '连续记录'}</strong></div></div>`
    : '';
  body.innerHTML = `
    ${task.reference_image ? `<div class="compare-grid"><figure><img src="${esc(task.photo_path)}" alt="现场采样照片"><figcaption>现场照片</figcaption></figure><figure><img src="${esc(task.reference_image)}" alt="管理员参考图"><figcaption>管理员参考图</figcaption></figure></div>` : `<img class="record-photo" src="${esc(task.photo_path)}" alt="现场采样照片">`}
    ${riskBadges(task)}
    <div class="record-grid">
      <div><small>历史序号</small><strong>${esc(task.site_code)}</strong></div>
      <div><small>样品类型</small><strong>${esc(TYPE_NAMES[task.sample_type] || task.sample_type)}</strong></div>
      <div><small>采样人员</small><strong>${esc(task.villager_name || '-')}</strong></div>
      <div><small>目标坐标(WGS84)</small><strong>${Number(task.target_latitude).toFixed(6)}, ${Number(task.target_longitude).toFixed(6)}</strong></div>
      <div><small>距目标点</small><strong>${Number(task.distance_m || 0).toFixed(1)} 米</strong></div>
      <div><small>定位精度</small><strong>±${task.accuracy_m != null && task.accuracy_m !== '' ? Math.round(Number(task.accuracy_m)) : '-'} 米</strong></div>
      <div><small>手机拍摄</small><strong>${formatTime(task.captured_at)}</strong></div>
      <div><small>服务器接收</small><strong>${formatTime(task.received_at)}</strong></div>
      <div><small>上传延迟</small><strong>${delayMinutes == null ? '-' : `${delayMinutes} 分钟`}</strong></div>
      <div><small>瓶号输入</small><strong>${task.manual_code ? `手动输入${task.exception_category ? ' · ' + esc(task.exception_category) : ''}` : '二维码扫描'}</strong></div>
      <div><small>手机天气</small><strong>${esc(task.weather_text)}</strong></div>
      <div><small>服务器天气</small><strong>${esc(weather)}</strong></div>
      <div><small>异常说明</small><strong>${esc(task.exception_detail || '-')}</strong></div>
      <div><small>审核状态</small><strong>${reviewName(task.review_status)}</strong></div>
    </div>
    ${task.journey_id ? trackInfo : ''}
    ${journeyMeta}
    ${task.reference_image ? `<div class="reference"><strong>管理员参考照片</strong><small>${esc(task.instructions || '对照现场地形和水体位置。')}</small></div>` : ''}
    ${task.printed_count ? `<p class="dialog-tip">标签已打印 ${task.printed_count} 次${task.printed_last ? `（最近 ${formatTime(task.printed_last)}）` : ''}；改期后旧标签作废，需重新打印。</p>` : ''}
    <div class="review-block">
      <textarea id="reviewNote" rows="2" placeholder="追加审核意见（不修改原始记录，只追加）">${esc(task.review_note || '')}</textarea>
      <div class="review-actions"><button class="approve" data-status="approved">✓ 审核通过</button><button class="suspicious" data-status="suspicious">! 标记可疑</button><button class="reject" data-status="rejected">↩ 退回重采</button><button data-status="pending">稍后审核</button></div>
    </div>
    <div class="detail-actions">
      ${task.server_weather_status !== 'complete' ? `<button id="backfillWeather" class="secondary">补齐服务器天气</button>` : ''}
      ${task.journey_id ? `<button id="exportGpx2" class="secondary">导出轨迹 GPX</button>` : ''}
      <a class="secondary" href="${esc(task.photo_path)}" target="_blank" download>下载原图</a>
    </div>`;
  document.querySelectorAll('.review-actions button').forEach(button => button.addEventListener('click', async () => {
    try {
      await post(`/api/v1/admin/records/${task.record_id}/review`, { status: button.dataset.status, note: $('#reviewNote').value });
      await loadAll();
      render();
      showDetail(state.tasks.find(t => t.id === task.id));
    } catch (error) { alert(error.message); }
  }));
  if ($('#backfillWeather')) $('#backfillWeather').addEventListener('click', async () => {
    try { await post(`/api/v1/admin/records/${task.record_id}/backfill-weather`, {}); await loadAll(); render(); showDetail(state.tasks.find(t => t.id === task.id)); }
    catch (error) { alert(error.message); }
  });
  if ($('#exportGpx2')) $('#exportGpx2').addEventListener('click', () => downloadFile(`/api/v1/admin/exports/gpx?journeyId=${task.journey_id}`, `journey-${task.journey_id}.gpx`));
}

// ---------- 点位管理 ----------
$('#siteManageButton').addEventListener('click', () => {
  state.siteMode = !state.siteMode;
  $('#siteManageButton').classList.toggle('active', state.siteMode);
  document.querySelectorAll('#dateList button').forEach(b => b.classList.remove('active'));
  render();
});

function typeCheckboxes(container, selected) {
  container.innerHTML = '';
  Object.entries(TYPE_NAMES).forEach(([code, name]) => {
    const label = document.createElement('label');
    label.className = 'type-chip';
    label.innerHTML = `<input type="checkbox" value="${code}" ${selected.includes(code) ? 'checked' : ''}> ${code} ${name}`;
    container.append(label);
  });
}
function checkedTypes(container) {
  return [...container.querySelectorAll('input:checked')].map(input => input.value);
}

// ---------- 坐标解析：支持【WGS84】29.66579301°N，94.34286257°E / 29.66, 94.34 等格式 ----------
function coordsText(lat, lon) {
  return `【WGS84】${Number(lat).toFixed(8)}°N，${Number(lon).toFixed(8)}°E`;
}
function parseCoords(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  let m = /(-?\d+(?:\.\d+)?)\s*°?\s*N\s*[,，\s]*(-?\d+(?:\.\d+)?)\s*°?\s*E/i.exec(s);
  if (m) return { latitude: Number(m[1]), longitude: Number(m[2]) };
  m = /(-?\d+(?:\.\d+)?)\s*[,，\s]\s*(-?\d+(?:\.\d+)?)/.exec(s);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { latitude: a, longitude: b };
    if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return { latitude: b, longitude: a };
  }
  return null;
}
function setCoordsFields(lat, lon) {
  $('#siteCoords').value = coordsText(lat, lon);
  $('#latitude').value = lat;
  $('#longitude').value = lon;
}
function currentCoords() {
  const parsed = parseCoords($('#siteCoords').value);
  if (parsed) return parsed;
  const lat = $('#latitude').value;
  const lon = $('#longitude').value;
  if (lat !== '' && lon !== '' && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))) {
    return { latitude: Number(lat), longitude: Number(lon) };
  }
  return null;
}

function resetSiteForm() {
  $('#siteForm').reset();
  $('#siteCoords').value = '';
  $('#referenceImagePreviewBox').classList.add('hidden');
  $('#referenceImagePreview').removeAttribute('src');
  $('#siteEnabled').checked = true;
  typeCheckboxes($('#siteTypes'), ['R']);
  state.editingSiteId = null;
  if (state.pickMarker) { state.pickMarker.remove(); state.pickMarker = null; }
}

function openSiteDialog(site = null, coords = null) {
  resetSiteForm();
  state.editingSiteId = site ? site.id : null;
  $('#siteDialogTitle').textContent = site ? `编辑采样点 ${site.code}` : '设置采样点';
  if (site) {
    $('#siteSortOrder').value = site.sort_order ?? '';
    $('#siteCode').value = site.code;
    $('#siteName').value = site.name;
    setCoordsFields(site.latitude, site.longitude);
    $('#siteAltitude').value = site.altitude_m ?? '';
    $('#siteInstructions').value = site.instructions || '';
    $('#siteRiskNote').value = site.risk_note || '';
    $('#siteRemarks').value = site.remarks || '';
    $('#siteEnabled').checked = Boolean(site.enabled);
    typeCheckboxes($('#siteTypes'), site.sample_types || []);
    if (site.reference_image) {
      $('#referenceImagePreview').src = site.reference_image;
      $('#referenceImagePreviewBox').classList.remove('hidden');
    }
  } else if (coords) {
    setCoordsFields(coords.latitude, coords.longitude);
  }
  $('#siteDialog').showModal();
}

$('#addSiteButton').addEventListener('click', () => openSiteDialog(null));
$('#siteCoords').addEventListener('input', () => {
  const parsed = parseCoords($('#siteCoords').value);
  $('#latitude').value = parsed ? parsed.latitude : '';
  $('#longitude').value = parsed ? parsed.longitude : '';
  if (state.pickMarker && parsed) state.pickMarker.setLatLng([parsed.latitude, parsed.longitude]);
});
$('#siteDialog').addEventListener('close', () => {
  // 由"在地图上选点"触发的关闭不清除选点模式（用 pickPending 标记区分），
  // 彻底消除 close 事件异步派发与 setTimeout 之间的竞态。
  if (state.pickPending) { state.pickPending = false; return; }
  state.pickMode = false;
  if (state.pickMarker) { state.pickMarker.remove(); state.pickMarker = null; }
});

$('#pickMap').addEventListener('click', () => {
  state.pickPending = true;
  state.pickMode = true;
  $('#siteDialog').close();
  const c = currentCoords();
  const lat = c ? c.latitude : 30.04;
  const lng = c ? c.longitude : 94.05;
  state.map.setView([lat, lng], Math.max(state.map.getZoom(), 13));
});

function finishPick(lat, lng) {
  state.pickMode = false;
  // 传入坐标重新打开对话框，避免 resetSiteForm 清掉刚选好的值。
  openSiteDialog(null, { latitude: lat, longitude: lng });
  placePickMarker(lat, lng);
}

function placePickMarker(lat, lng) {
  if (!state.map) return;
  if (state.pickMarker) state.pickMarker.remove();
  state.pickMarker = L.marker([lat, lng], { draggable: true, keyboard: false }).addTo(state.map);
  state.pickMarker.on('dragend', () => {
    const p = state.pickMarker.getLatLng();
    setCoordsFields(p.lat, p.lng);
  });
}

function resizeImage(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(image.src);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    image.onerror = () => reject(new Error('示例图片无法读取，请换一张照片'));
    image.src = URL.createObjectURL(file);
  });
}

$('#referenceImageFile').addEventListener('change', event => {
  const file = event.target.files[0];
  if (!file) return $('#referenceImagePreviewBox').classList.add('hidden');
  $('#referenceImagePreview').src = URL.createObjectURL(file);
  $('#referenceImagePreviewBox').classList.remove('hidden');
});

$('#saveSite').addEventListener('click', async () => {
  const form = $('#siteForm');
  if (!form.reportValidity()) return;
  if (!checkedTypes($('#siteTypes')).length) return alert('请至少选择一种样品类型');
  const coords = currentCoords();
  if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return alert('请填写有效的 WGS84 经纬度，格式如：【WGS84】29.66579301°N，94.34286257°E');
  if (Math.abs(coords.latitude) > 90 || Math.abs(coords.longitude) > 180) return alert('经纬度超出范围（纬度 ±90、经度 ±180）');
  const data = {
    sortOrder: Number($('#siteSortOrder').value) || 0,
    code: $('#siteCode').value.trim(),
    name: $('#siteName').value.trim(),
    latitude: coords.latitude,
    longitude: coords.longitude,
    altitudeM: $('#siteAltitude').value === '' ? null : Number($('#siteAltitude').value),
    sampleTypes: checkedTypes($('#siteTypes')),
    remarks: $('#siteRemarks').value,
    instructions: $('#siteInstructions').value,
    riskNote: $('#siteRiskNote').value,
    referenceImage: state.editingSiteId ? undefined : '',
    enabled: $('#siteEnabled').checked
  };
  let hasReference = false;
  try {
    const file = $('#referenceImageFile').files[0];
    if (file) {
      const imageData = await resizeImage(file, 1600, 0.82);
      const uploaded = await post('/api/v1/admin/reference-images', { imageData });
      data.referenceImage = uploaded.path;
      hasReference = true;
    }
    if (state.editingSiteId) {
      await api(`/api/v1/admin/sites/${state.editingSiteId}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      data.projectId = state.projectId;
      await post('/api/v1/admin/sites', data);
    }
    if (!hasReference && !$('#referenceImagePreviewBox').classList.contains('hidden')) hasReference = true;
    $('#siteDialog').close();
    await loadAll();
    alert(hasReference ? '采样点已保存。' : '采样点已保存。建议补充现场参考图，方便村民对照找点。');
  } catch (error) { alert(error.message); }
});

// ---------- CSV 导入 ----------
$('#importButton').addEventListener('click', () => $('#importDialog').showModal());
$('#runImport').addEventListener('click', async () => {
  const file = $('#csvFile').files[0];
  if (!file) return alert('请选择CSV文件');
  const rows = parseCsv(await file.text());
  let ok = 0, failed = 0;
  for (const row of rows) {
    try {
      const rawCode = row['序号'] ?? row.site_code ?? row['点位编号'];
      const coords = parseCoordinate(row['经纬度']);
      const remarks = row['备注'] ?? row.remarks ?? '';
      const sampleTypes = deriveSampleTypes(String(rawCode), String(remarks), row['样品类型'] ?? row.sample_type);
      await post('/api/v1/admin/sites', {
        projectId: state.projectId,
        sort_order: Number(row['编号'] ?? row.sort_order ?? 0) || 0,
        code: rawCode,
        name: row['点位名称'] ?? row.site_name ?? `采样点${rawCode}`,
        sampleTypes,
        latitude: coords ? coords.latitude : Number(row.latitude_wgs84 ?? row['纬度']),
        longitude: coords ? coords.longitude : Number(row.longitude_wgs84 ?? row['经度']),
        altitudeM: row['海拔'] ?? row.altitude_m ?? null,
        instructions: row['采样说明'] ?? row.instructions ?? '',
        riskNote: row['风险提醒'] ?? row.risk_note ?? '',
        remarks,
        referenceImage: '',
        enabled: true
      });
      ok++;
    } catch { failed++; }
  }
  $('#importResult').textContent = `导入完成：成功 ${ok} 个，失败 ${failed} 个。导入点位已启用，可补传现场参考图。`;
  await loadAll();
});

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines.shift());
  return lines.map(line => Object.fromEntries(splitCsvLine(line).map((value, i) => [headers[i], value])));
}
function splitCsvLine(line) {
  const out = []; let value = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { out.push(value.trim()); value = ''; }
    else value += c;
  }
  out.push(value.trim());
  return out;
}
function parseCoordinate(value = '') {
  const match = String(value).match(/([0-9]+(?:\.[0-9]+)?)\s*°?\s*N.*?([0-9]+(?:\.[0-9]+)?)\s*°?\s*E/i);
  return match ? { latitude: Number(match[1]), longitude: Number(match[2]) } : null;
}
function deriveSampleTypes(code, remarks, explicit) {
  if (explicit) return String(explicit).toUpperCase().split(/[,，;；]/).map(s => s.trim()).filter(s => TYPE_NAMES[s]);
  const result = [];
  if (remarks.includes('土')) result.push('S');
  if (remarks.includes('植')) result.push('P');
  if (remarks.includes('水') && !remarks.includes('无水')) result.push(code.includes('.') ? 'T' : 'R');
  return result.length ? result : ['R'];
}

// ---------- 任务下发与标签 ----------
$('#newTaskButton').addEventListener('click', async () => {
  $('#taskFields').classList.remove('hidden');
  $('#createTask').classList.remove('hidden');
  $('#labelResult').classList.add('hidden');
  $('#printLabel').classList.add('hidden');
  $('#plannedDate').value = new Date().toISOString().slice(0, 10);
  $('#taskVillager').innerHTML = state.villagers.filter(v => v.enabled).map(v => `<option value="${v.id}">${esc(v.display_name)}（${esc(v.username)}）</option>`).join('');
  const enabled = state.sites.filter(s => s.enabled);
  $('#taskSiteList').innerHTML = `<label class="site-pick select-all"><input type="checkbox" id="taskSiteAll"> <strong>全选 / 全不选</strong></label>` +
    (enabled.length
      ? enabled.map(s => `<label class="site-pick"><input type="checkbox" value="${s.id}"> ${esc(s.code)} · ${esc(s.name)}（${(s.sample_types || []).map(t => TYPE_NAMES[t] || t).join('/')}）</label>`).join('')
      : '<p class="dialog-tip">没有启用的点位，请先设置采样点。</p>');
  const all = $('#taskSiteAll');
  if (all) all.addEventListener('change', () => {
    $('#taskSiteList').querySelectorAll('input[type=checkbox]').forEach(input => { if (input !== all) input.checked = all.checked; });
  });
  typeCheckboxes($('#taskTypes'), ['R']);
  $('#taskDialog').showModal();
});

$('#createTask').addEventListener('click', async () => {
  const siteIds = [...$('#taskSiteList').querySelectorAll('input[type=checkbox]:checked')]
    .filter(input => input.id !== 'taskSiteAll')
    .map(input => Number(input.value));
  const types = checkedTypes($('#taskTypes'));
  if (!siteIds.length) return alert('请选择至少一个采样点');
  if (!types.length) return alert('请选择至少一种样品类型');
  if (!$('#taskVillager').value) return alert('请选择采样人员');
  try {
    const created = [];
    for (const siteId of siteIds) {
      const res = await post('/api/v1/admin/tasks', {
        siteId, villagerId: Number($('#taskVillager').value),
        plannedDate: $('#plannedDate').value, sampleTypes: types
      });
      created.push(...(res.codes || []));
    }
    const after = await api(`/api/v1/admin/tasks?projectId=${state.projectId}`);
    state.tasks = after.tasks;
    state.lastCreatedTaskIds = after.tasks.filter(t => created.includes(t.sample_code)).map(t => t.id);
    $('#labelCodes').innerHTML = created.map(c => `<div class="label-code-item">${esc(c)}</div>`).join('');
    $('#labelResult').classList.remove('hidden');
    $('#printLabel').classList.remove('hidden');
    $('#createTask').classList.add('hidden');
    $('#taskFields').classList.add('hidden');
    // 下发后：左栏出现计划日期并自动切到该日期，地图立即显示新任务。
    state.selectedDate = $('#plannedDate').value;
    renderDates();
    render();
  } catch (error) { alert(error.message); }
});

$('#printLabel').addEventListener('click', async () => {
  if (!state.lastCreatedTaskIds.length) return alert('没有可打印的任务');
  try {
    const html = await api(`/api/v1/admin/labels?taskIds=${state.lastCreatedTaskIds.join(',')}`);
    const win = window.open('', '_blank');
    if (!win) return alert('浏览器拦截了弹出窗口，请允许弹窗后重试');
    win.document.write(html._text ?? html);
    win.document.close();
    win.focus();
  } catch (error) { alert(error.message); }
});

// ---------- 设备激活与采样员管理 ----------
async function refreshVillagers() {
  const boot = await api('/api/v1/admin/bootstrap');
  state.villagers = boot.villagers;
}
function renderVillagerList() {
  $('#activationResult').classList.add('hidden');
  $('#qrcode').innerHTML = '';
  $('#villagerList').innerHTML = state.villagers.map(v => `
    <div class="vill-row">
      <div><strong>${esc(v.display_name)}</strong><small>${esc(v.username)}${v.enabled ? '' : '（已停用）'}</small></div>
      <div class="vill-actions">
        <button type="button" data-act="${v.id}" ${v.enabled ? '' : 'disabled'} class="secondary">生成激活二维码</button>
        <button type="button" data-toggle="${v.id}" class="ghost">${v.enabled ? '停用' : '启用'}</button>
      </div>
    </div>`).join('');
  $('#villagerList').querySelectorAll('button[data-act]').forEach(button => button.addEventListener('click', async () => {
    try {
      const res = await post(`/api/v1/admin/villagers/${button.dataset.act}/activation`, {});
      $('#activationResult').classList.remove('hidden');
      $('#activationValue').textContent = res.value;
      $('#activationExpires').textContent = `有效期至 ${formatTime(res.expiresAt)}（一次性使用）`;
      $('#qrcode').innerHTML = '';
      if (window.QRCode) new QRCode($('#qrcode'), { text: res.value, width: 180, height: 180, correctLevel: QRCode.CorrectLevel.M });
      else $('#qrcode').textContent = '二维码组件未加载';
    } catch (error) { alert(error.message); }
  }));
  $('#villagerList').querySelectorAll('button[data-toggle]').forEach(button => button.addEventListener('click', async () => {
    const villager = state.villagers.find(v => v.id === Number(button.dataset.toggle));
    const enable = !villager.enabled;
    try {
      await api(`/api/v1/admin/villagers/${villager.id}`, { method: 'PUT', body: JSON.stringify({ displayName: villager.display_name, enabled: enable }) });
      await refreshVillagers();
      renderVillagerList();
    } catch (error) { alert(error.message); }
  }));
}
$('#villagerButton').addEventListener('click', () => {
  renderVillagerList();
  $('#villagerDialog').showModal();
});
$('#addVillager').addEventListener('click', async () => {
  const username = $('#newVillagerUser').value.trim().toLowerCase();
  const displayName = $('#newVillagerName').value.trim();
  if (!username || !displayName) return alert('请填写账号和姓名');
  try {
    await post('/api/v1/admin/villagers', { username, displayName });
    $('#newVillagerUser').value = '';
    $('#newVillagerName').value = '';
    await refreshVillagers();
    renderVillagerList();
  } catch (error) { alert(error.message); }
});
$('#copyActivation').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#activationValue').textContent); alert('已复制到剪贴板'); }
  catch { window.prompt('复制以下内容：', $('#activationValue').textContent); }
});

// ---------- 诊断日志与健康 ----------
$('#logsButton').addEventListener('click', loadLogs);
$('#refreshLogs').addEventListener('click', loadLogs);
function logFilterQuery() {
  const params = new URLSearchParams({ limit: '1000' });
  if ($('#logLevel').value) params.set('level', $('#logLevel').value);
  if ($('#logDevice').value.trim()) params.set('deviceId', $('#logDevice').value.trim());
  if ($('#logFrom').value) params.set('from', $('#logFrom').value);
  if ($('#logTo').value) params.set('to', $('#logTo').value);
  return params.toString();
}
async function loadLogs() {
  try {
    const res = await api(`/api/v1/admin/logs?${logFilterQuery()}`);
    $('#logsBody').innerHTML = res.logs.length
      ? res.logs.map(l => `<tr><td>${formatTime(l.created_at)}</td><td><span class="log-level ${esc(l.level)}">${esc(l.level)}</span></td><td>#${l.device_id ?? '-'} ${esc(l.app_version || '')}</td><td title="${esc(l.diagnostics)}">${esc(l.message)}</td></tr>`).join('')
      : '<tr><td colspan="4">暂无日志</td></tr>';
    $('#logsDialog').showModal();
  } catch (error) { alert(error.message); }
}
$('#exportLogsCsv').addEventListener('click', () => downloadFile(`/api/v1/admin/exports/logs.csv?${logFilterQuery()}`, 'bsc-app-logs.csv'));

async function checkHealth() {
  try {
    const res = await api('/api/v1/admin/health');
    const dot = document.querySelector('.server-dot i');
    if (res.criticalLowDisk) {
      $('#healthText').textContent = `磁盘仅剩 ${fmtBytes(res.freeBytes)}，告警！`;
      dot.style.background = '#d95d58';
    } else if (res.warnLowDisk) {
      $('#healthText').textContent = `磁盘剩余 ${fmtBytes(res.freeBytes)}（偏低）`;
      dot.style.background = '#ef9c2f';
    } else {
      $('#healthText').textContent = `服务器运行正常 · 磁盘剩余 ${fmtBytes(res.freeBytes)}`;
      dot.style.background = '#30b987';
    }
  } catch { $('#healthText').textContent = '服务器健康检查失败'; }
}

// ---------- 导出 ----------
async function downloadFile(url, name) {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message || `导出失败：${res.status}`); }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (error) { alert(error.message); }
}
$('#exportCsv').addEventListener('click', () => downloadFile(`/api/v1/admin/exports/csv?projectId=${state.projectId}`, 'bsc-records.csv'));
$('#exportGeo').addEventListener('click', () => downloadFile(`/api/v1/admin/exports/geojson?projectId=${state.projectId}`, 'bsc-records.geojson'));
$('#exportPhotos').addEventListener('click', () => downloadFile(`/api/v1/admin/exports/photos.zip?projectId=${state.projectId}`, 'bsc-photos.zip'));
$('#exportAudit').addEventListener('click', () => downloadFile('/api/v1/admin/exports/audit.csv', 'bsc-audit.csv'));

// ---------- 启动 ----------
window.__bscState = state; // 调试用：浏览器控制台可查看内部状态
if (token()) { showApp(); init(); } else { showLogin(); }
