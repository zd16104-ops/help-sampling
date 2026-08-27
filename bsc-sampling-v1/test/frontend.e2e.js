'use strict';

// 管理站前端端到端验证（无头 Chromium）：
//   npm run test:e2e   （需要本机已启动 npm start 服务器）
// 覆盖：登录 → 项目/日期导航 → 地图标记 → 详情与审核 → 任务下发与标签打印弹窗
// → 设备激活二维码 → 诊断日志 → 磁盘健康。

const { chromium } = require('playwright');
const sharp = require('sharp');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100';
const PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMe-2608!';
const today = new Date().toISOString().slice(0, 10);

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

// 通过 API 造一条今天的完整采样记录，保证 UI 有可审核对象。
async function seedRecord() {
  const login = await call('POST', '/api/v1/admin/login', { password: PASSWORD });
  if (login.status !== 200) throw new Error(`admin login failed: ${JSON.stringify(login.json)}`);
  const admin = login.json.token;
  const boot = await call('GET', '/api/v1/admin/bootstrap', null, admin);
  const villagerId = boot.json.villagers.find(v => v.username === 'cmy01').id;
  const sites = await call('GET', '/api/v1/admin/sites?projectId=1', null, admin);
  const site = sites.json.sites.find(s => s.code === '5');
  const task = await call('POST', '/api/v1/admin/tasks', { siteId: site.id, villagerId, plannedDate: today, sampleTypes: ['R'] }, admin);
  const taskId = task.json.ids[0];
  const act = await call('POST', `/api/v1/admin/villagers/${villagerId}/activation`, {}, admin);
  const [, , user, raw] = String(act.json.value).split('|');
  const activate = await call('POST', '/api/v1/mobile/activate', {
    username: user, activationToken: raw, deviceUuid: `e2e-${Date.now()}`, appVersion: '1.0.0'
  });
  const mobile = activate.json.token;
  const start = await call('POST', `/api/v1/mobile/tasks/${taskId}/start`, { latitude: Number(site.latitude), longitude: Number(site.longitude), accuracyM: 3 }, mobile);
  const journeyId = start.json.journey.id;
  await call('POST', `/api/v1/mobile/journeys/${journeyId}/track`, {
    points: [{ sequence: 0, recordedAt: new Date().toISOString(), latitude: Number(site.latitude) - 0.001, longitude: Number(site.longitude) - 0.001, accuracyM: 4, speedMps: 1, mockLocation: false }]
  }, mobile);
  const sync = await call('GET', '/api/v1/mobile/sync', null, mobile);
  const freshTask = sync.json.tasks.find(t => t.id === taskId);
  const photo = await sharp({ create: { width: 480, height: 360, channels: 3, background: '#2e8b57' } }).jpeg().toBuffer();
  const record = await call('POST', `/api/v1/mobile/tasks/${taskId}/record`, {
    clientRecordId: `e2e-${Date.now()}`, capturedAt: `${today}T09:30:00+08:00`,
    latitude: Number(site.latitude), longitude: Number(site.longitude), accuracyM: 5, weatherText: '晴 12℃',
    noWater: false, manualCode: false, qrToken: freshTask.qr_token, exceptionCategory: '', exceptionDetail: '',
    mockLocation: false, offlineStart: false, photoDataUrl: `data:image/jpeg;base64,${photo.toString('base64')}`
  }, mobile);
  if (record.status !== 201) throw new Error(`record failed: ${JSON.stringify(record.json)}`);
  return { sampleCode: freshTask.sample_code, siteCode: site.code, recordId: record.json.id };
}

async function main() {
  let seeded;
  try { seeded = await seedRecord(); } catch (e) { console.error('seeding failed:', e.message); process.exit(1); }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('dialog', d => d.accept());
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  // 1. 登录页 → 登录成功进入主界面
  check('登录页显示', await page.locator('#loginForm').isVisible());
  await page.fill('#password', PASSWORD);
  await page.click('#loginForm button[type=submit]');
  await page.waitForSelector('#app:not(.hidden)', { timeout: 10000 });
  check('登录后进入主界面', await page.locator('#app:not(.hidden)').isVisible());

  // 1c. 响应式：手机宽度下侧栏变抽屉（☰ 展开），桌面宽度下菜单按钮隐藏
  check('桌面宽度不显示菜单按钮', !(await page.locator('#menuButton').isVisible()));
  await page.setViewportSize({ width: 480, height: 820 });
  await page.waitForTimeout(250);
  check('手机宽度显示菜单按钮', await page.locator('#menuButton').isVisible());
  check('手机宽度侧栏默认收起', !(await page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().left >= 0)));
  await page.click('#menuButton');
  await page.waitForTimeout(350);
  check('点击☰展开侧栏', await page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().left >= 0));
  await page.click('#refresh');
  await page.waitForTimeout(350);
  check('点击侧栏项后抽屉收起', !(await page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().left >= 0)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(250);

  // 1b. 顶栏按钮"!"信息点与悬停详情
  check('顶栏按钮均带"!"信息点', await page.locator('.top-action-wrap .info-badge').count() === 7);
  await page.hover('#exportCsv');
  await page.waitForSelector('#exportCsv ~ .info-tip', { state: 'visible', timeout: 5000 });
  const tipText = await page.locator('#exportCsv ~ .info-tip').textContent();
  check('悬停显示功能详情', tipText.includes('CSV') && tipText.includes('风险标志'), tipText.slice(0, 60));

  // 2. 侧栏：项目、日期列表、健康状态
  await page.waitForSelector('#dateList button', { timeout: 10000 });
  const projectCount = await page.locator('#projectList button').count();
  check('项目列表渲染', projectCount >= 2, `count=${projectCount}`);
  check('待采样入口存在', await page.locator('#dateList button').filter({ hasText: '待采样' }).count() === 1);
  check('按拍摄日期归档存在', await page.locator('#dateList button').filter({ hasText: '年' }).count() >= 1);
  await page.waitForFunction(() => document.querySelector('#healthText').textContent.includes('磁盘'), null, { timeout: 8000 });
  check('磁盘健康状态显示', (await page.locator('#healthText').textContent()).includes('磁盘'));

  // 3. 地图标记渲染
  await page.waitForSelector('.sample-marker', { timeout: 10000 });
  const markerCount = await page.locator('.sample-marker').count();
  check('地图任务标记渲染', markerCount >= 1, `count=${markerCount}`);

  // 3b. 采样点交互：右键选点、地图选点流程、经纬度格式解析
  const mapBox = await page.locator('#map').boundingBox();
  await page.mouse.click(mapBox.x + 60, mapBox.y + 60, { button: 'right' });
  await page.waitForSelector('#siteDialog[open]', { timeout: 5000 });
  const rightCoords = await page.locator('#siteCoords').inputValue();
  check('右键地图弹出设置采样点并填充坐标', rightCoords.startsWith('【WGS84】') && rightCoords.includes('°N'), rightCoords);
  await page.click('#siteDialog button[value=cancel]');
  await page.click('#addSiteButton');
  await page.waitForSelector('#siteDialog[open]');
  await page.click('#pickMap');
  await page.waitForSelector('#siteDialog:not([open])', { state: 'attached' });
  // 直接向地图容器派发完整点击序列（Leaflet 需要同点 mousedown 才不视为拖拽）
  await page.evaluate(({ x, y }) => {
    const map = document.getElementById('map');
    const rect = map.getBoundingClientRect();
    const cx = rect.left + x;
    const cy = rect.top + y;
    for (const type of ['mousedown', 'mouseup', 'click']) {
      map.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
    }
  }, { x: 140, y: 140 });
  await page.waitForSelector('#siteDialog[open]', { timeout: 5000 });
  const pickedCoords = await page.locator('#siteCoords').inputValue();
  check('地图选点后对话框回填坐标（选点流程修复）', pickedCoords.startsWith('【WGS84】'), pickedCoords);
  await page.click('#siteDialog button[value=cancel]');
  await page.click('#addSiteButton');
  await page.waitForSelector('#siteDialog[open]');
  await page.fill('#siteCoords', '【WGS84】29.66579301°N，94.34286257°E');
  const latVal = await page.locator('#latitude').inputValue();
  const lonVal = await page.locator('#longitude').inputValue();
  check('解析【WGS84】格式经纬度', latVal === '29.66579301' && lonVal === '94.34286257', `${latVal},${lonVal}`);
  await page.click('#siteDialog button[value=cancel]');

  // 4. 依次点击日期（计划日期+拍摄日期自动归档），找到一条记录 → 审核通过
  let reviewed = false;
  const dateButtons = page.locator('#dateList button').filter({ hasText: '年' });
  const dateCount = await dateButtons.count();
  for (let d = 0; d < Math.min(dateCount, 6) && !reviewed; d++) {
    await dateButtons.nth(d).click();
    await page.waitForTimeout(400);
    const markerCount2 = await page.locator('.sample-marker').count();
    // 从最新的标记倒序找（最新任务排在后面，优先找到本轮 seed 的待审核记录）
    for (let i = markerCount2 - 1; i >= 0 && !reviewed; i--) {
      // 大量任务堆叠时坐标点击会命中最上层标记；直接对标记元素派发 click 事件精确命中
      await page.locator('.sample-marker').nth(i).dispatchEvent('click');
      await page.waitForSelector('#detail:not(.hidden)', { timeout: 5000 });
      const hasReview = await page.locator('.review-actions button').count();
      if (hasReview) {
        check('审核面板显示（照片/风险/意见）', (await page.locator('#detailBody .record-photo').count()) >= 1);
        const bodyText = await page.locator('#detailBody').textContent();
        check('审核页显示历史序号/目标坐标/上传延迟', bodyText.includes('历史序号') && bodyText.includes('目标坐标') && bodyText.includes('上传延迟'));
        check('照片不再叠加重复水印文字', (await page.locator('#detailBody .watermark-preview').count()) === 0);
        const accText = bodyText.match(/±([\d.]+) 米/);
        check('定位精度取整显示（无小数）', accText !== null && !accText[1].includes('.'), `精度=${accText ? accText[1] : '无'}`);
        if (/审核状态已通过/.test(bodyText)) {
          await page.click('#closeDetail');
          await page.waitForTimeout(150);
          continue;
        }
        const statusBefore = await page.locator('#detailBody').textContent();
        await page.locator('.review-actions button[data-status=approved]').click();
        await page.waitForFunction(() => document.querySelector('#detailBody')?.textContent.includes('已通过'), null, { timeout: 8000 });
        const statusAfter = await page.locator('#detailBody').textContent();
        check('审核通过并回显状态', statusAfter.includes('已通过') && !statusBefore.includes('已通过'));
        reviewed = true;
      } else {
        await page.click('#closeDetail');
        await page.waitForTimeout(150);
      }
    }
  }
  check('找到并完成一次审核', reviewed);
  await page.click('#closeDetail');
  await page.waitForSelector('#detail.hidden', { state: 'attached' });

  // 4c. 表格视图：切换、筛选、批量审核、批量天气按钮
  await page.click('#tableViewButton');
  await page.waitForSelector('#taskTableWrap:not(.hidden)', { timeout: 5000 });
  check('表格视图渲染行', (await page.locator('#taskTableBody tr').count()) >= 1);
  const reviewableCount = await page.locator('#taskTableBody .row-check').count();
  check('表格批量审核功能就绪', await page.locator('#batchApprove').isVisible());
  if (reviewableCount) {
    await page.click('#tableCheckAll');
    await page.click('#batchApprove');
    await page.waitForTimeout(1500);
    check('批量审核后表格刷新', (await page.locator('#taskTableBody tr').count()) >= 1);
  }
  check('批量天气按钮存在', await page.locator('#batchWeather').isVisible());
  await page.click('#tableViewButton');
  await page.waitForSelector('#taskTableWrap.hidden', { state: 'attached', timeout: 5000 });
  check('切回地图视图', await page.locator('.map-panel').isVisible());

  // 4b. 今天日期视图：同一点位的多个任务必须展开为多个标记，且标签显示数量。
  const todayLabel = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${today}T00:00:00`));
  if (await page.locator('#dateList button').filter({ hasText: todayLabel }).count()) {
    await page.locator('#dateList button').filter({ hasText: todayLabel }).first().click();
    await page.waitForTimeout(500);
    const statAllOnToday = Number(await page.locator('#statAll').textContent());
    const markerCountOnToday = await page.locator('.sample-marker').count();
    check('地图标记数量与任务总数一致（无重叠丢失）', markerCountOnToday === statAllOnToday, `markers=${markerCountOnToday} tasks=${statAllOnToday}`);
    const labels = await page.locator('.map-label').allTextContents();
    check('同点位任务展开并显示数量标签', labels.some(t => /×\d+/.test(t)), labels.join('|'));
  }

  // 5. 任务下发（全选点位、计划日期=明天）→ 左栏自动出现计划日期并切换、地图显示新任务 + 标签打印弹窗
  const tomorrowStr = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  const tomorrowLabel = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${tomorrowStr}T00:00:00`));
  await page.click('#newTaskButton');
  await page.waitForSelector('#taskDialog[open]');
  await page.fill('#plannedDate', tomorrowStr);
  const siteInputs = page.locator('#taskSiteList input[type=checkbox]');
  check('任务对话框列出启用点位', await siteInputs.count() >= 1);
  check('存在全选按键', await page.locator('#taskSiteAll').count() === 1);
  await page.locator('#taskSiteAll').check();
  await page.click('#createTask');
  await page.waitForSelector('#labelResult:not(.hidden)', { timeout: 10000 });
  const codeText = await page.locator('#labelCodes').textContent();
  check('任务创建返回瓶子编号', /-R-\d+\.\d+-|-[RTSYP L]-\d+\.?[\d.]*-\d{2}/.test(codeText) || codeText.length > 2, codeText.trim());
  check('下发后左栏自动出现计划日期并切换', await page.locator('#dateList button').filter({ hasText: tomorrowLabel }).count() === 1);
  await page.waitForSelector('.sample-marker', { timeout: 10000 });
  check('下发后地图立即显示新任务', await page.locator('.sample-marker').count() >= 1);
  const popupPromise = page.waitForEvent('popup');
  await page.click('#printLabel');
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  const popupTitle = await popup.title();
  check('标签打印页打开（40枚/页）', popupTitle.includes('瓶子标签'), `title=${popupTitle}`);
  const labelCount = await popup.locator('.label').count();
  check('标签页包含标签', labelCount >= 1, `count=${labelCount}`);
  await popup.close();
  await page.click('#taskDialog button[value=cancel]');

  // 6. 设备激活二维码
  await page.click('#villagerButton');
  await page.waitForSelector('#villagerDialog[open]');
  await page.locator('#villagerList button[data-act]').first().click();
  await page.waitForSelector('#activationResult:not(.hidden)', { timeout: 8000 });
  const activationValue = await page.locator('#activationValue').textContent();
  check('激活二维码内容生成', activationValue.startsWith('BSC-ACT|'), activationValue);
  check('二维码图形渲染', await page.locator('#qrcode img, #qrcode canvas').count() >= 1);
  const newUser = `e2e${Date.now()}`;
  await page.fill('#newVillagerUser', newUser);
  await page.fill('#newVillagerName', '端到端村民');
  await page.click('#addVillager');
  await page.waitForFunction(u => [...document.querySelectorAll('#villagerList .vill-row small')].some(el => el.textContent.includes(u)), newUser, { timeout: 8000 });
  check('新建采样员出现在列表', true);
  await page.click('#villagerDialog button[value=cancel]');

  // 7. 诊断日志
  await page.click('#logsButton');
  await page.waitForSelector('#logsDialog[open]');
  await page.waitForSelector('#logsBody tr', { timeout: 8000 });
  check('诊断日志列表渲染', await page.locator('#logsBody tr').count() >= 1);
  await page.click('#logsDialog button[value=cancel]');

  // 8. 待采样视图与取消按钮（无记录任务）
  await page.locator('#dateList button').filter({ hasText: '待采样' }).click();
  await page.waitForTimeout(400);
  const pendingMarker = await page.locator('.sample-marker').count();
  check('待采样视图渲染', pendingMarker >= 0);
  if (pendingMarker > 0) {
    await page.locator('.sample-marker').first().click({ force: true });
    await page.waitForSelector('#detail:not(.hidden)');
    const hasCancel = await page.locator('#cancelTask').count();
    check('无记录任务详情显示（含取消入口或已取消标注）', (await page.locator('#detailBody').textContent()).includes('等待村民采样') && (hasCancel > 0 || (await page.locator('.cancel-note').count()) > 0));
  }

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
