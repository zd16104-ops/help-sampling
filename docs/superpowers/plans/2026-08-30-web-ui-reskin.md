# 管理站网页 UI 换肤（山水青绿风）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用本地内置的轻量组件体系整体替换管理站网页 UI（山水青绿风），功能与接口零改动，现有 Playwright 端到端套件全程保持绿色。

**Architecture:** 保留 `public/app.js` 全部业务逻辑与 `index.html` 全部元素 id/事件钩子；重写 `public/styles.css` 为 CSS 变量驱动的组件库（语义化 class 换肤）；`app.js` 仅允许"等价的颜色常量替换"（地图标记/轨迹/状态点色值）；`index.html` 仅做 class 与图标微调。每完成一个页面批次即运行完整 `npm run test:e2e` 回归。

**Tech Stack:** 原生 HTML/CSS/JS + Leaflet 1.9.4（本地 vendor）、Playwright 1.62.1（验收）、Node 24（本地服务）。

**Spec:** `docs/superpowers/specs/2026-08-30-ui-reskin-design.md`

## Global Constraints

- CSP 不变：`script-src 'self'`；不引入任何 CDN、网络字体、第三方 JS；新资源仅本地 CSS 与内联 SVG。
- 功能零改动：所有元素 `id`、`data-*`、事件绑定、API 调用、Leaflet 逻辑、`<dialog>` 结构一律不动；`app.js` 唯一允许的修改是颜色常量替换（本计划逐处列出）。
- **E2E 红线选择器（必须原样存在且行为不变）**：`#loginForm`、`#app`、`#menuButton`、`#dateList`、`#projectList`、`#healthText`、`#siteCoords`、`#latitude`、`#longitude`、`#taskSiteList`、`#taskSiteAll`、`#labelCodes`、`#villagerList`、`#activationValue`、`#qrcode`、`#logsBody`、`#detailBody`、`#taskTableBody`、`#batchApprove`、`#batchWeather`、`#statAll`、`#cancelTask`、`.sidebar`（离屏侧栏布局与 `.open` 行为）、`.top-action-wrap .info-badge`（数量恒为 7）、`#exportCsv ~ .info-tip`（兄弟结构）、`.sample-marker`、`.map-panel`、`.review-actions button[data-status]`、`.record-photo`、`.watermark-preview`、`#taskTableBody .row-check`、`.map-label`、`.vill-row`、`.cancel-note`。
- 配色令牌：primary `#0E9F8A`、accent `#2E7CB8`、bg `#F4F8F7`、ink `#17343A`、卡片白、圆角 `12px`；状态语义色：待采样=琥珀、已采样=青绿、可疑=橙红、已通过=绿。
- 打印 CSS（旧 `styles.css` L9 `@media print` 块）**原样保留**；标签打印页（`src/labels.js` 生成）不改。
- 验收：每个任务结束跑 `npm run check` + 完整 `npm run test:e2e`（BASE `http://127.0.0.1:3100`、密码 `ChangeMe-2608!`，与本地 config 一致）全绿后才提交。

---

### Task 1: 设计令牌与基础组件层（styles.css 重写 + 登录页）

**Files:**
- Modify: `bsc-sampling-v1/public/styles.css`（全量重写）
- Modify: `bsc-sampling-v1/public/index.html`（仅登录页 class 微调，见 Step 3）

**Interfaces:**
- Consumes: 无（本计划不新增 JS 接口）
- Produces: 全部组件 class 语义与令牌（后续任务直接引用）：`.btn/.btn-primary/.btn-secondary/.btn-ghost/.btn-danger`、`.card`、`.chip`、`.field`、`.dialog-panel` 等；令牌 `--c-primary`、`--c-accent`、`--c-bg`、`--c-ink`、`--radius`、`--shadow-soft`

- [ ] **Step 1: 备份旧样式**

```powershell
Copy-Item public\styles.css public\styles.legacy.css
```

- [ ] **Step 2: 写入新 `public/styles.css` 骨架（令牌 + 基础 + 登录页 + 打印块）**

完整替换文件内容（本任务只写以下内容，后续任务按批追加）：

```css
:root{
  --c-primary:#0E9F8A;--c-primary-strong:#0B7F6E;--c-accent:#2E7CB8;--c-bg:#F4F8F7;--c-card:#FFFFFF;
  --c-ink:#17343A;--c-ink-2:#5A6B6E;--c-line:#DDE8E5;--c-danger:#D95D58;--c-amber:#EF9C2F;--c-green:#16A27A;
  --radius:12px;--radius-sm:8px;--shadow-soft:0 2px 10px rgba(23,52,58,.06);--shadow-pop:0 10px 40px rgba(23,52,58,.14);
  --font:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{font-family:var(--font);background:var(--c-bg);color:var(--c-ink);font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased}
.hidden{display:none!important}
h1,h2,h3{margin:0;line-height:1.25}
button{font-family:var(--font)}
/* 基础组件 */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 16px;border:1px solid var(--c-line);
  border-radius:var(--radius-sm);background:#fff;color:var(--c-ink);font-size:13.5px;font-weight:600;cursor:pointer;transition:all .15s ease}
.btn:hover{border-color:var(--c-primary);color:var(--c-primary)}
.btn-primary,.primary{background:var(--c-primary);border-color:var(--c-primary);color:#fff}
.btn-primary:hover,.primary:hover{background:var(--c-primary-strong);color:#fff}
.btn-secondary,.secondary{background:#EAF6F3;border-color:transparent;color:var(--c-primary-strong)}
.btn-secondary:hover,.secondary:hover{background:#D8EFEA}
.btn-ghost,.ghost{background:transparent;border-color:transparent;color:var(--c-ink-2)}
.btn-ghost:hover,.ghost:hover{background:#EFF4F3;color:var(--c-ink)}
.field input,.field select,.field textarea,input[type=text],input[type=password],input[type=number],input[type=date],select,textarea{
  width:100%;padding:10px 12px;border:1px solid var(--c-line);border-radius:var(--radius-sm);background:#fff;color:var(--c-ink);
  font:inherit;transition:border-color .15s ease}
.field input:focus,input:focus,select:focus,textarea:focus{outline:none;border-color:var(--c-primary);box-shadow:0 0 0 3px rgba(14,159,138,.15)}
/* 登录页 */
.login-shell{min-height:100vh;display:grid;place-items:center;padding:24px;
  background:linear-gradient(160deg,#EAF7F4 0%,#F4F8F7 55%,#E8F1F6 100%)}
.login-card{width:min(400px,100%);background:var(--c-card);border-radius:20px;box-shadow:var(--shadow-pop);padding:36px 32px;text-align:center}
.brand-mark{width:56px;height:56px;margin:0 auto 14px;display:grid;place-items:center;border-radius:16px;font-size:26px;font-weight:700;
  color:#fff;background:linear-gradient(135deg,var(--c-primary),var(--c-accent))}
.login-card h1{font-size:21px;margin-bottom:6px}
.eyebrow{font-size:12px;letter-spacing:.12em;color:var(--c-accent);font-weight:700}
.muted{color:var(--c-ink-2)}
.login-card form{display:grid;gap:12px;margin-top:22px;text-align:left}
.login-card label{display:grid;gap:6px;font-size:13px;color:var(--c-ink-2);font-weight:600}
.error{color:var(--c-danger);font-size:13px;min-height:18px;margin:0}
/* 打印（原样保留，勿改） */
@media print{body *{visibility:hidden}#labelResult,#labelResult *{visibility:visible}#labelResult{position:absolute;left:20mm;top:20mm;width:85mm;border:1px solid #222;background:#fff}.label-result p{display:none}}
```

- [ ] **Step 3: `index.html` 登录表单微调（只加 class，不动 id/结构）**

将 L18-23 登录表单中的 `<label>` 改为 `<label class="field">`（3 处 label：密码/TOTP/无），提交按钮 class `primary` 改为 `btn btn-primary`。

- [ ] **Step 4: 语法与功能回归**

```powershell
npm run check
npm test
node src/server.js   # 后台启动（127.0.0.1:3100）
npm run test:e2e
```

Expected: check 通过；`test:e2e` 全绿（此时除登录页外视觉未换，功能断言全部不受影响）。

- [ ] **Step 5: 视觉核对**

浏览器打开 `http://127.0.0.1:3100`：登录卡片居中、青绿渐变图标、圆角输入框、按钮为青绿胶囊。截图存档 `docs/superpowers/plans/screenshots/01-login.png`。

- [ ] **Step 6: Commit**

```bash
git add bsc-sampling-v1/public/styles.css bsc-sampling-v1/public/index.html bsc-sampling-v1/public/styles.legacy.css
git commit -m "style(web): 设计令牌与基础组件层+登录页山水青绿换肤"
```

---

### Task 2: 应用壳（侧栏/顶栏/统计卡）+ 表格视图

**Files:**
- Modify: `bsc-sampling-v1/public/styles.css`（追加）
- Modify: `bsc-sampling-v1/public/index.html`（仅品牌图标 SVG 化，见 Step 2）

**Interfaces:**
- Consumes: Task 1 令牌与 `.btn*`
- Produces: 壳样式（后续任务共享）

- [ ] **Step 1: 追加壳与表格样式（styles.css 末尾追加）**

```css
/* 应用壳 */
.app{display:grid;grid-template-columns:230px minmax(0,1fr);height:100vh;background:var(--c-bg)}
.app.side-collapsed{grid-template-columns:64px minmax(0,1fr)}
.sidebar{background:linear-gradient(180deg,#FDFEFE,#EFF7F5);border-right:1px solid var(--c-line);display:flex;flex-direction:column;gap:6px;padding:16px 12px;overflow:auto}
.brand{display:flex;align-items:center;gap:10px;padding:4px 8px 14px}
.brand .brand-mark.small{width:36px;height:36px;margin:0;font-size:18px;border-radius:10px}
.brand strong{font-size:15px}.brand small{display:block;color:var(--c-ink-2);font-size:11px}
.section-label{font-size:11px;color:var(--c-ink-2);letter-spacing:.1em;margin:10px 8px 2px}
.side-action{display:flex;align-items:center;gap:8px;width:100%;padding:9px 12px;border:0;border-radius:var(--radius-sm);
  background:transparent;color:var(--c-ink);font-size:13.5px;cursor:pointer;text-align:left}
.side-action:hover{background:#E3F2EE;color:var(--c-primary-strong)}
.side-action.active{background:var(--c-primary);color:#fff}
.date-list,.project-list{display:flex;flex-direction:column;gap:4px}
#dateList button,#projectList button{border:0;border-radius:var(--radius-sm);background:transparent;color:var(--c-ink);font-size:13px;padding:8px 12px;text-align:left;cursor:pointer}
#dateList button:hover,#projectList button:hover{background:#E3F2EE}
#dateList button.active,#projectList button.active{background:var(--c-primary);color:#fff}
.sidebar-bottom{margin-top:auto;display:grid;gap:6px;padding-top:10px;border-top:1px solid var(--c-line)}
.server-dot{display:flex;align-items:center;gap:8px;color:var(--c-ink-2);font-size:12px;padding:4px 8px}
.server-dot i{width:8px;height:8px;border-radius:50%;background:var(--c-green)}
/* 顶栏 */
.main{min-width:0;display:flex;flex-direction:column;padding:18px 22px;gap:16px;overflow:auto}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:14px}
.topbar-title{display:flex;align-items:center;gap:10px}
.crumb{font-size:12px;color:var(--c-ink-2)}
.topbar h2{font-size:24px;font-weight:800}
.menu-button{display:none;border:0;background:transparent;font-size:20px;cursor:pointer}
.top-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
/* 统计卡 */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.stats article{display:flex;align-items:center;gap:12px;background:var(--c-card);border:1px solid var(--c-line);border-radius:var(--radius);padding:14px 16px;box-shadow:var(--shadow-soft)}
.stats small{color:var(--c-ink-2);font-size:12px}
.stats strong{font-size:22px;display:block}
.stat-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;font-weight:700;color:#fff}
.stat-icon.blue{background:var(--c-accent)}.stat-icon.green{background:var(--c-green)}
.stat-icon.amber{background:var(--c-amber)}.stat-icon.gray{background:#9AA8A5}
/* 表格视图 */
.task-table-wrap{background:var(--c-card);border:1px solid var(--c-line);border-radius:var(--radius);box-shadow:var(--shadow-soft);overflow:hidden}
.task-table-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:12px 14px;border-bottom:1px solid var(--c-line);background:#FBFDFC}
.task-table-tools select,.task-table-tools input{width:auto;min-width:150px}
.task-table-scroll{overflow:auto;max-height:60vh}
.task-table{width:100%;border-collapse:collapse;font-size:13px}
.task-table th{position:sticky;top:0;background:#F0F7F5;color:var(--c-ink-2);font-size:12px;text-align:left;padding:10px 12px}
.task-table td{padding:10px 12px;border-top:1px solid var(--c-line)}
.task-table tbody tr:hover{background:#F2F9F7}
.row-check{accent-color:var(--c-primary)}
```

- [ ] **Step 2: `index.html` 品牌图标 SVG 化（只换 L14/L29 的 `水` 字符块）**

L14 `.brand-mark` 内容改为内联水滴 SVG：`<svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="M12 2.5C12 2.5 4.5 10.8 4.5 16.3a7.5 7.5 0 0 0 15 0C19.5 10.8 12 2.5 12 2.5Z" fill="#fff"/></svg>`；L29 `.brand-mark.small` 同样替换（width 16）。

- [ ] **Step 3: 回归 + 视觉核对 + 提交**

```powershell
npm run check
npm run test:e2e   # 全绿（覆盖：侧栏抽屉行为、info-badge=7、日期列表、表格行、批量审核按钮）
```

Expected: e2e 全绿。截图 `02-shell.png`（主界面+表格视图）。

```bash
git add bsc-sampling-v1/public/styles.css bsc-sampling-v1/public/index.html
git commit -m "style(web): 侧栏/顶栏/统计卡/表格视图换肤"
```

---

### Task 3: 地图面板 + 详情审核侧栏 + 状态配色常量

**Files:**
- Modify: `bsc-sampling-v1/public/styles.css`（追加）
- Modify: `bsc-sampling-v1/public/app.js`（**仅颜色常量替换**：L373、L445、L454、L529、L1052、L1055、L1058）

**Interfaces:**
- Consumes: Task 2 壳样式
- Produces: 地图/详情组件样式；app.js 新配色常量与 CSS 令牌一致

- [ ] **Step 1: app.js 颜色常量替换（逐处精确替换，其余一行不动）**

```js
// L373 旧: const MARKER_COLORS = { gray: '#7f8d8c', amber: '#ef9c2f', green: '#16a27a', red: '#d95d58' };
const MARKER_COLORS = { gray: '#9AA8A5', amber: '#F0A23B', green: '#0E9F8A', red: '#E0685F' };
// L445 旧 color: '#16a27a' → color: '#0E9F8A'
// L454 旧 color: '#326fcb' → color: '#2E7CB8'
// L529 旧 color: '#326fcb' → color: '#2E7CB8'
// L1052 旧 dot.style.background = '#d95d58'; → dot.style.background = '#E0685F';
// L1055 旧 dot.style.background = '#ef9c2f'; → dot.style.background = '#F0A23B';
// L1058 旧 dot.style.background = '#30b987'; → dot.style.background = '#0E9F8A';
```

- [ ] **Step 2: 追加地图与详情样式（styles.css 末尾）**

```css
/* 地图面板 */
.map-panel{background:var(--c-card);border:1px solid var(--c-line);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow-soft);position:relative;min-height:0}
.map-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-bottom:1px solid var(--c-line);background:#FBFDFC}
.legend{display:flex;gap:14px;font-size:12px;color:var(--c-ink-2)}
.legend span{display:inline-flex;align-items:center;gap:6px}
.pin{width:10px;height:10px;border-radius:50%;display:inline-block}
.pin.gray{background:#9AA8A5}.pin.amber{background:#F0A23B}.pin.green{background:#0E9F8A}.pin.red{background:#E0685F}
.map-action{padding:7px 12px;border:1px solid var(--c-line);border-radius:var(--radius-sm);background:#fff;font-size:12.5px;font-weight:600;cursor:pointer}
.map-action:hover{border-color:var(--c-primary);color:var(--c-primary)}
.map-fallback{position:absolute;inset:0;display:grid;place-items:center;align-content:center;gap:6px;color:var(--c-ink-2);background:#F4F8F7}
/* 详情侧栏 */
.detail{position:fixed;right:0;top:0;bottom:0;width:430px;background:var(--c-card);box-shadow:var(--shadow-pop);z-index:1400;overflow:auto;padding:18px 20px;display:flex;flex-direction:column;gap:14px}
.detail-head{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:1px solid var(--c-line);padding-bottom:12px}
.detail-head small{color:var(--c-accent);font-weight:700;letter-spacing:.06em}
.detail-head button{border:0;background:transparent;font-size:22px;cursor:pointer;color:var(--c-ink-2)}
.record-photo{width:100%;border-radius:var(--radius);border:1px solid var(--c-line)}
.compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.review-actions{display:flex;flex-wrap:wrap;gap:8px}
.review-actions button[data-status=approved]{background:var(--c-green);border-color:var(--c-green);color:#fff}
.review-actions button[data-status=rejected]{background:var(--c-danger);border-color:var(--c-danger);color:#fff}
.cancel-note{background:#FDF3EC;border:1px solid #F5D9C4;border-radius:var(--radius-sm);padding:10px 12px;color:#9A5B2D;font-size:13px}
```

- [ ] **Step 3: 回归 + 提交**

```powershell
npm run check
npm run test:e2e   # 全绿（覆盖：sample-marker 计数与点击、审核面板 record-photo/watermark-preview、批量审核、地图切换）
```

截图 `03-map-detail.png`。然后：

```bash
git add bsc-sampling-v1/public/styles.css bsc-sampling-v1/public/app.js
git commit -m "style(web): 地图面板/详情审核侧栏换肤+状态配色令牌化"
```

---

### Task 4: 全部弹窗与表单组件

**Files:**
- Modify: `bsc-sampling-v1/public/styles.css`（追加）
- Modify: `bsc-sampling-v1/public/index.html`（仅必要 class 补齐：各 dialog 的按钮 `primary/secondary/ghost` → `btn btn-*`；label 加 `field`）

**Interfaces:**
- Consumes: Task 1 的 `.btn*`、`.field`
- Produces: 弹窗/表单组件样式

- [ ] **Step 1: 追加弹窗与表单样式（styles.css 末尾）**

```css
/* 弹窗 */
dialog{border:0;border-radius:16px;box-shadow:var(--shadow-pop);padding:0;background:var(--c-card);max-width:560px;width:calc(100vw - 48px)}
dialog::backdrop{background:rgba(13,34,38,.45)}
.dialog-head{display:flex;align-items:flex-start;justify-content:space-between;padding:18px 20px 12px;border-bottom:1px solid var(--c-line)}
.dialog-head small{color:var(--c-accent);font-weight:700;letter-spacing:.06em;font-size:11.5px}
.dialog-head button{border:0;background:transparent;font-size:22px;cursor:pointer;color:var(--c-ink-2)}
.dialog-actions{display:flex;gap:10px;justify-content:flex-end;align-items:center;padding:14px 20px;border-top:1px solid var(--c-line);background:#FBFDFC;border-radius:0 0 16px 16px}
.dialog-actions span{flex:1}
.dialog-tip{font-size:12.5px;color:var(--c-ink-2);background:#EFF7F5;border-radius:var(--radius-sm);padding:10px 12px}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 16px;padding:18px 20px}
.form-grid label{display:grid;gap:6px;font-size:13px;color:var(--c-ink-2);font-weight:600}
.form-grid .wide{grid-column:1/-1}
.type-checkboxes,.site-pick-list{display:grid;gap:6px;max-height:220px;overflow:auto;border:1px solid var(--c-line);border-radius:var(--radius-sm);padding:10px}
.site-pick{border:1px solid var(--c-line);border-radius:var(--radius-sm);padding:8px 10px;background:#fff}
.site-pick:hover{border-color:var(--c-primary)}
.checkbox-line{display:flex!important;align-items:center;gap:8px;font-weight:500!important}
.checkbox-line input{width:auto;accent-color:var(--c-primary)}
/* 标签结果与激活 */
.label-result{background:#EFF7F5;border-radius:var(--radius);padding:12px 14px}
.label-codes{display:flex;flex-wrap:wrap;gap:6px}
.label-code-item{background:#fff;border:1px dashed var(--c-primary);color:var(--c-primary-strong);border-radius:var(--radius-sm);padding:4px 10px;font-size:12px;font-weight:700}
.vill-new{display:flex;gap:8px;padding:0 20px 12px}
.vill-new input{flex:1}
.vill-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 20px;border-top:1px solid var(--c-line)}
.vill-row small{color:var(--c-ink-2)}
.activation-result{display:flex;gap:16px;padding:12px 20px;align-items:center}
.activation-qr{background:#fff;border:1px solid var(--c-line);border-radius:var(--radius);padding:10px}
.activation-value{font-size:11.5px;color:var(--c-ink-2);word-break:break-all}
.logs-filters{display:flex;flex-wrap:wrap;gap:10px;padding:12px 20px}
.logs-filters input,.logs-filters select{width:auto}
.logs-table-wrap{max-height:50vh;overflow:auto;margin:0 20px;border:1px solid var(--c-line);border-radius:var(--radius-sm)}
.logs-table{width:100%;border-collapse:collapse;font-size:12.5px}
.logs-table th{position:sticky;top:0;background:#F0F7F5;padding:8px 10px;text-align:left;color:var(--c-ink-2)}
.logs-table td{padding:8px 10px;border-top:1px solid var(--c-line)}
.file-input{border:1px dashed var(--c-line);border-radius:var(--radius-sm);padding:14px;width:100%;margin:0 0 12px}
.import-result{font-size:13px;padding:0 20px 12px}
```

- [ ] **Step 2: `index.html` 弹窗按钮/标签 class 补齐**

把 6 个 `<dialog>`（projectDialog/siteDialog/importDialog/taskDialog/villagerDialog/logsDialog）内所有 `class="primary"` 按钮改为 `class="btn btn-primary"`、`class="secondary"` → `class="btn btn-secondary"`、`class="ghost"` → `class="btn btn-ghost"`；每个 `<label>` 补 `class="field"`（`checkbox-line` 类不动）。

- [ ] **Step 3: 回归 + 提交**

```powershell
npm run check
npm run test:e2e   # 全绿（覆盖：点位选点回填、CSV 导入弹窗、下发弹窗全选+生成+标签、激活弹窗二维码、日志弹窗行渲染）
```

截图 `04-dialogs.png`。然后：

```bash
git add bsc-sampling-v1/public/styles.css bsc-sampling-v1/public/index.html
git commit -m "style(web): 全部弹窗与表单组件换肤"
```

---

### Task 5: 响应式收尾 + 全量回归 + 用户视觉确认（闸门）

**Files:**
- Modify: `bsc-sampling-v1/public/styles.css`（追加响应式块，替换旧 L10 的媒体查询）

**Interfaces:**
- Consumes: Task 1-4 全部组件
- Produces: 最终主题

- [ ] **Step 1: 追加响应式块（styles.css 末尾，覆盖旧 L10 行为）**

```css
@media(max-width:900px){.app{grid-template-columns:200px minmax(0,1fr)}.stats{grid-template-columns:1fr 1fr}.map-panel{height:calc(100vh - 280px)}.legend{display:none}}
@media(max-width:650px){.app{display:block;overflow:auto}.menu-button{display:block}.sidebar{position:fixed;top:0;left:0;bottom:0;width:270px;z-index:1300;transform:translateX(-105%);transition:transform .22s ease;box-shadow:18px 0 50px rgba(17,43,47,.16);overflow:auto;display:block}.sidebar.open{transform:translateX(0)}.sidebar-backdrop{display:block;position:fixed;inset:0;z-index:1250;background:rgba(13,34,38,.42)}.main{padding:14px}.topbar{align-items:flex-start;gap:12px}.top-actions{display:grid}.topbar h2{font-size:21px}.stats{grid-template-columns:1fr 1fr}.map-panel{height:70vh}.form-grid{grid-template-columns:1fr}.form-grid .wide{grid-column:auto}.record-grid{grid-template-columns:1fr}.detail{width:100%}.top-action-wrap .info-tip{display:none}}
@media(max-width:400px){.stats{grid-template-columns:1fr}.stat-icon{display:none}.dialog-actions{grid-template-columns:1fr 1fr}.activation-result{flex-direction:column}}
```

（以上三个媒体查询与旧 L10 行为逐条等价，仅换视觉参数。）

- [ ] **Step 2: 全量回归 + 打印核对**

```powershell
npm run check
npm test
npm run test:e2e
```

Expected: 全部绿。另在浏览器打开标签打印页（下发→打印标签），核对 40 枚/页排版未破版、打印预览正常（`@media print` 原样保留）。

- [ ] **Step 3: 视觉走查清单（逐项截图存档 `docs/superpowers/plans/screenshots/`）**

登录页、主界面（地图）、表格视图、下发弹窗、点位弹窗、激活弹窗、日志弹窗、审核详情侧栏、移动端宽度（375px）侧栏抽屉。共 9 张。

- [ ] **Step 4: 用户确认闸门 —— STOP，把 9 张截图发给用户确认，得到"OK"后才进入 Task 6。**

- [ ] **Step 5: Commit**

```bash
git add bsc-sampling-v1/public/styles.css
git commit -m "style(web): 响应式收尾与视觉走查"
```

---

### Task 6: 文档快照、版本号与发布（闸门后执行）

**Files:**
- Modify: `bsc-sampling-v1/docs/DEVELOPMENT_SPEC_V1.md`（增补条目 44：UI 换肤记录）
- Modify: `bsc-sampling-v1/docs/APPENDIX_L_SOURCE_SNAPSHOT.md`（工具自动重生成）
- Modify: `bsc-sampling-v1/src/schema.js`（`app_versions` 登记 109/'1.3.0'）

**Interfaces:**
- Consumes: Task 5 的最终主题
- Produces: 发布版本 v1.3.0

- [ ] **Step 1: 文档增补与快照重生成**

spec 条目列表末尾追加（与条目 42/43 同格式）："44. **管理站网页 UI 整体换肤（用户要求，功能零改动）**：……（一句话说明山水青绿组件化换肤与验收方式）"。然后：

```powershell
node tools\embed-source-doc.js
```

- [ ] **Step 2: schema.js 版本登记（在 108 行之后追加）**

```js
db.prepare('INSERT OR IGNORE INTO app_versions (version_code,version_name,notes) VALUES (?,?,?)').run(109, '1.3.0', '管理站网页 UI 山水青绿组件化换肤（功能零改动）');
```

- [ ] **Step 3: 打包与发布**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy\make-package.ps1
```

产物 `bsc-deploy-v1.zip` 与提交一起：commit + tag `v1.3.0` + push + GitHub Release（附部署包）。

---

## Self-Review

- **Spec coverage:** 规格 §2.1 路线→Task 1-4；§2.2 配色→Task 1 令牌与 Task 3 常量；§2.3 全量范围→Task 2-5（登录/壳/表格/地图/详情/弹窗/打印核对/响应式）；§2.5 验证→每任务 e2e + Task 5 走查与闸门；§2.4 文件→各任务 Files 一致；手机端（§3）不在本计划（独立子项目后续另出计划）。
- **Placeholder scan:** 无 TBD；每个代码步骤含实际代码或精确的"旧→新"替换。
- **Type/命名一致性:** `.btn-primary/.btn-secondary/.btn-ghost` 在 Task 1 定义、Task 2/4 引用，命名一致；颜色令牌 `--c-primary` 等全局唯一。
