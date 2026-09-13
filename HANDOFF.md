# 巴松措采样系统（Bsc Sampling）交接文档

> 本文档供后续接手的开发 Agent 使用，目标是：快速建立上下文、能独立构建/运行/测试、明确"还需要修什么"。
> 生成时间：基于仓库 `main` 分支 `8366fce`（tag `v1.3.7`）。

---

## 0. 一句话概述

面向西藏巴松措（Basum Lake）周边约 30 km 的**水质采样现场记录与留证系统**。核心目标：防止采样员在采样点弄虚作假，以「现场照片 + GPS 轨迹 + 时间/天气/坐标水印」作为证据链。系统由**原生 Android 采集端** + **Node.js 服务器 + 管理站网页**两部分组成，服务 ≤10 名村民采样员。

- 正式域名：`https://bsc.gpsgps.online`（Nginx → 本机 `127.0.0.1:3100`）
- 坐标体系统一 **WGS84**
- 默认管理员密码 `ChangeMe-2608!`（正式部署必须改）

---

## 1. 版本与状态（⚠ 重点）

### 版本号存在三处错位，接手后应最先统一：

| 位置 | 当前值 | 说明 |
|---|---|---|
| Git tag（最新） | **v1.3.7**（`8366fce`，2026-09-02） | 服务端+管理站的发版口径 |
| `bsc-sampling-v1/package.json` | `1.0.0` | Node 包固定声明，**不是**发版版本，勿按此判断 |
| Android `app/build.gradle` | `versionCode 110` / `versionName 1.3.2` | **Android 端仍停留在 1.3.2** |
| 服务端 `app_versions` 表登记 | 最高 `version_code 110 / 1.3.2`（`src/schema.js`） | 与 Android 端一致，但落后于 git tag |

**结论**：v1.3.3 ~ v1.3.7 这 5 个版本的改动目前**只有服务端/管理站侧**（点位序号复用、批量删任务、标签加点位名、PDF 标签修复、多设备采样），**尚未同步到 Android 版本号与 `app_versions` 登记**。若需要"版本对齐"，要做：Android `versionCode/versionName` 提升 + `schema.js` 补 `INSERT` 登记 + 重新出 APK。

### 工作区状态

- `git status` 基本干净，仅一个未跟踪目录 `docs/superpowers/plans/screenshots/`（UI 走查截图，可入库可忽略）。
- `HEAD` == tag `v1.3.7`，无未提交的源码改动。

### 历史版本线

- `v1.0.0 → v1.1.x → v1.2.x → v1.3.0 → … → v1.3.7`，全部打在 `main` 分支上（无 feature 分支、无 release 分支）。
- `water-sampling-system/`（`version 0.2.0`）是**最早的 WebView 原型**，已被废弃，勿混入正式代码。

---

## 2. 仓库目录速览

| 路径 | 用途 | 是否核心 |
|---|---|---|
| `bsc-sampling-v1/` | Node.js 服务器 + 管理站网页 + 部署脚本 + 测试 + 文档 | ✅ 核心 |
| `bsc-android-native/` | 原生 Android APP 源码（Gradle / AGP 8.7.3 / Java 17） | ✅ 核心 |
| `bsc-sampling-v1/docs/DEVELOPMENT_SPEC_V1.md` | **完整开发基线文档**（含需求变更记录 §28.3、已知风险 §29、源码快照附录 L） | ✅ 必读 |
| `bsc-sampling-v1/docs/SYNC_DIAGNOSIS.md` | 同步问题排查手册（日志骨架、错误对照表） | ✅ 排障必读 |
| `deploy-staging/bsc-server/` | 服务器 staging 部署副本（含 node_modules，勿当源码改） | 次要 |
| `tools-dbcopy/` | 空目录（疑似遗留） | 忽略 |
| `docs/superpowers/` | UI 换肤的 plan + spec + 截图 | 参考 |
| `android-toolchain/` | 本机 Gradle 8.9 + Android SDK 35（构建工具链，不入库） | 环境 |
| `bsc-deploy-v1.zip` | 部署包产物 | 产物 |
| `water-sampling-system/` | 废弃的 v0.2 WebView 原型 | 忽略 |

---

## 3. 技术栈

- **服务器**：Node.js ≥22（开发用 24.13.0），内置 `node:sqlite`（无独立数据库）；依赖 `qrcode`、`sharp`、`pdfkit`；`playwright` 仅测试用。
- **管理站前端**：原生 JS + Leaflet 1.9.4 + qrcodejs（均本地托管于 `public/vendor/`，不依赖 CDN）。
- **Android**：Java 17、AGP 8.7.3、compileSdk 35、minSdk 29、MapLibre 11.11.0、CameraX 1.5.2、ZXing 3.5.4、WorkManager 2.11.2、OkHttp 4.12.0。
- **注意**：CameraX 被锁死在 **1.5.2**（1.6.x 要求 compileSdk 36 + AGP 8.9.1，与本工程不兼容）。

---

## 4. 快速启动 / 构建 / 测试

### 服务器与管理站（`bsc-sampling-v1/`）

```powershell
cd bsc-sampling-v1
npm install
npm start            # node src/server.js，监听 127.0.0.1:3100
```

浏览器打开 `http://127.0.0.1:3100` 即管理站。数据目录 `data/v1/`（`bsc-v1.sqlite`、`uploads/`、`reference/`、`config.json`、`backups/`）。

### 测试（`bsc-sampling-v1/`）

```powershell
npm run check        # JS 语法检查
npm test             # 自动化测试（安全/迁移/API/备份/轨迹平滑，数量随版本演进）
npm run smoke        # 端到端冒烟（需先 npm start）
npm run test:e2e     # 无头浏览器 E2E（Playwright，需 npm start）
npm run backup       # 日常备份
```

### Android（`bsc-android-native/`）

```powershell
cd bsc-android-native
# 1) 一次性安装工具链（可选，也可用本机已装 SDK）
powershell -ExecutionPolicy Bypass -File tools\setup-toolchain.ps1
# 2) 新建 local.properties（机器相关，不入库）
#    sdk.dir=D\:\\你的路径\\android-toolchain\\sdk
# 3) 编译 debug APK
node tools\gradle-with-proxy.js assembleDebug --no-daemon
# 产物：app/build/outputs/apk/debug/app-debug.apk
# 单元测试：
node tools\gradle-with-proxy.js testDebugUnitTest
```

- `tools/gradle-with-proxy.js` 是**开发沙箱专用的本地 Maven 代理**，不打包进 APK；普通联网环境可直接 `gradle assembleDebug`。
- 默认服务器地址 `https://bsc.gpsgps.online`（`app/build.gradle` 的 `buildConfigField DEFAULT_SERVER`）。

---

## 5. 系统架构与核心设计

### 5.1 数据流

```
Android APP ──HTTPS /api/v1/mobile/*──▶ Node.js 服务器 ──静态──▶ 管理站网页
(激活/同步/轨迹/记录/日志)              (node:sqlite / uploads / reference)
```

### 5.2 二维码机制（⚠ 与"改经纬度"问题直接相关）

系统有**两类二维码**：

1. **激活二维码**：`BSC-ACT|<publicBaseUrl>|<username>|<raw>`，管理员生成，24h 有效、绑定设备，扫码即激活登录（无 PIN）。
2. **采样标签二维码**（A4 打印，60 枚/页）：`BSC-SAMPLE|<sample_code>|<qr_token>`。

**关键结论**：采样二维码内容**不含经纬度**，只含 `sample_code`（= `日期-类型-点位历史序号`）和 `qr_token`（下发任务时的随机 24 位 token）。因此**修改点位的经纬度不会让已打印二维码失效**（扫码仍能匹配任务、`qr_token` 校验仍通过）。

**但要注意**：任务表 `tasks` **不存坐标快照**，距离校验的目标坐标是提交/同步时**实时 JOIN `sites.latitude/longitude`** 得到的。改坐标后，该点位下**所有未完成任务**会用新坐标算距离，可能触发 `30/80/300 m` 风险规则甚至 >300 m 禁止提交。

### 5.3 距离规则

- 0–30 m：正常
- 30–80 m：可疑（自动打 `distance_30_80m` 风险标志）
- 80–300 m：严重可疑（`distance_80_300m`）
- **>300 m：禁止提交**（`dist > severe_radius_m` 直接 422）

### 5.4 离线与同步

- 手机端 SQLite 本地队列（任务/行程/轨迹/记录/日志），无网先落盘，联网补传。
- WorkManager 每 15 分钟 + 网络恢复即时同步。
- 记录上传以 `client_record_id` **幂等**。
- 同步日志骨架见 `docs/SYNC_DIAGNOSIS.md`（`SYNC_BEGIN → SYNC_TASKS → … → SYNC_END`）。

### 5.5 安全

- `/uploads/`、`/reference/` 图片签名鉴权（7 天时效 URL，裸路径 403）。
- 全站安全响应头（CSP 等）。
- 登录/激活限速（5 次失败锁定 10 分钟窗口）。
- 管理员登录仅密码（TOTP 可选）。

### 5.6 数据库（`src/schema.js`，SQLite）

核心表：`projects`、`sites`（点位）、`tasks`（任务）、`villagers`（采样员）、`devices`、`activation_codes`、`journeys`（行程）、`track_points`、`records`（采样记录）、`label_prints`、`app_versions`、`audit_logs` 等。首次启动自动建库 + 种子数据（2 项目、25 点位、采样员 `cmy01`）。

---

## 6. 关键源码文件地图

### 服务器（`bsc-sampling-v1/src/`）

| 文件 | 职责 |
|---|---|
| `server.js` | 主入口，全部路由（`/api/v1/admin/*`、`/api/v1/mobile/*`、静态、图片鉴权），约 52 KB |
| `schema.js` | 建库、迁移、种子数据、`app_versions` 版本登记 |
| `security.js` | 登录令牌 HMAC 签名、TOTP、随机 token |
| `weather.js` | 服务器天气补齐（独立字段，不覆盖手机原文） |
| `track.js` | 轨迹展示层平滑（漂移点剔除/分段/滑动平均，不动原始 GPX） |
| `exif.js` | 极简 EXIF 解析（时间防篡改 `exif_time_mismatch`） |
| `exports.js` | CSV/GeoJSON/GPX/照片 ZIP/审计 CSV 导出 |
| `labels.js` | A4 60 枚/页标签 PDF 渲染（pdfkit） |
| `ratelimit.js` | 登录/激活限速 |

### 前端（`bsc-sampling-v1/public/`）

- `index.html` + `app.js`（约 62 KB，全部 `/api/v1` 交互）+ `styles.css`（v1.3.0 山水青绿组件化换肤，CSS 变量驱动）。
- `styles.legacy.css` 是换肤前的旧样式（备份）。

### Android（`bsc-android-native/app/src/main/java/online/gpsgps/bscsampling/`）

| 文件 | 职责 |
|---|---|
| `MainActivity.java` | 主界面/任务列表/地图/上传页 |
| `TaskActivity.java` | 任务详情与采样流程 |
| `ScanActivity.java` | CameraX + ZXing 扫码 |
| `PhotoActivity.java` | 现场拍照 + 水印（无相册入口） |
| `TrackingService.java` | 前台轨迹服务 |
| `SyncEngine.java` | 同步、天气补全、静默重登（`AUTO_RELOGIN`）、失败重试 |
| `SyncDns.java` | DoH（223.5.5.5）回退，解决移动网络 DNS 解析失败 |
| `Store.java` | 本地 SQLite（任务/行程/轨迹/记录/日志） |
| `Api.java` / `Prefs.java` / `Util.java` / `Watermark.java` / `QrData.java` | 网络/偏好/工具/水印/二维码解析 |
| `SyncWorker.java` / `UpdateWorker.java` / `BootReceiver.java` | WorkManager 后台同步 / 版本提醒 / 重启恢复 |

---

## 7. 核心业务规则速查

- **无 PIN 激活**：扫码即激活登录，10 年令牌，管理端停用采样员/设备即时生效。
- **样品编号**：`sample_code = <YYYYMMDD 后 4 位>-<类型>-<点位序号>-<当日序号 2 位>`（见 `server.js` 的 `sampleCode()`）。
- **类型码**：`R/T/S/P/Y/L`（河水/湖水/…等，具体见点位 `sample_types`）。
- **任务改期会重新编号 + 更换 `qr_token`**（旧标签作废需重印）。
- **已取消任务不再下发手机**；取消前已缓存任务的离线提交仍进入审核（留证）。
- **照片是主证据**，GPS/轨迹是辅助证据，最终由管理员审核。

---

## 8. 已知问题 / 待办清单（接手后优先处理）

### 8.1 立即可修的明确问题

1. **版本号三处错位**（见 §1）：git tag 到 v1.3.7，Android 与 `app_versions` 登记停在 1.3.2。
2. **`app_versions` 登记落后**：`src/schema.js` 只 `INSERT` 到 1.3.1/1.3.2，若手机端要收到更新提醒需补登记。

### 8.2 未完成（来自 `DEVELOPMENT_SPEC_V1.md` §28.2，不得宣称可上线）

1. Android 尚未完成 **OPPO Find X7 真机验收**（弱网/重启/边界/后台轨迹）。
2. **公网部署进行中**：Windows 服务化 / Nginx / HTTPS / 备份计划任务需按 `deploy/DEPLOYMENT_GUIDE.md` 确认到位。
3. **真机公网验收**（手机 4G 走通「激活→采样→上传」全流程）尚未完成。
4. 正式签名 APK 的 keystore/密码**离线单独保管、不入库**，需确认是否已归档。

### 8.3 已知风险（§29）

| 风险 | 应对方向 |
|---|---|
| Android 15/OPPO 后台限制（息屏轨迹被结束） | 前台服务 + 权限引导 + 真机测试 |
| 高山 GPS 漂移（30 m 内误判） | 不以 GPS 单独否定，人工审核 |
| 无网多设备同时开始（服务器锁失效） | 允许保存，上传后保留冲突标记 |
| Windows 服务器磁盘仅 ~18 GB | 每日监测 + 10 GB 告警 + 异机备份 |
| 照片近景瓶子与远景难同时清晰 | 瓶子 40–80 cm 占 1/4，先真机检验 |

---

## 9. 历史坑与教训（⚠ 改代码前必读，避免复发）

1. **PowerShell `.ps1` 必须保持 UTF-8 BOM**：编辑去掉 BOM 后，PowerShell 5.1 会按 GBK 解码，中文注释会"吞掉"下一行命令——**历史上导致 `make-package.ps1` 漏拷整个 `src/` 目录**。相关文件：`deploy/make-package.ps1`、`deploy/schedule-backup.ps1`。
2. **Android `org.json` 的 `optString()` 怪癖**：对 JSON 空值返回字符串 `"null"`（4 字符），曾导致所有任务的 `canceled_at` 被误判为"已取消"、任务列表永久空白。`Task.canceled()` 必须用 `isNull()` 判定，并把文本 `"null"` 一并视为空。
3. **布局 XML 与 Java 类型强转要一致**：曾出现 `view_list.xml` 声明 `<ListView>` 而代码强转 `ExpandableListView`（ClassCastException 闪退），且组 ID 与任务 ID stable ID 冲突二次崩溃。改列表类布局时核对类型 + ID 错开（组 ID 用负值）。
4. **点位软删除后历史序号释放**：删除点位时把 `code` 改名为 `原序号-DEL{id}` 释放 `(project_id, code)` 唯一约束。已知取舍：被删点位的历史记录会显示改名序号（仅历史展示）。
5. **`tools/backup.js` 的 `copyDir()`**：曾因 `reference/` 顶层直接放真实参考图而 ENOENT 失败（备份中断）；已改为进入前 `mkdirSync(recursive)` + 同秒重跑追加 `-2`。改备份逻辑时保留 `test/backup.test.js` 的回归断言。
6. **`tools/embed-source-doc.js` 的文件清单改为自动遍历 `src/`**，新增源文件不会再漏嵌附录；附录 L 从 `DEVELOPMENT_SPEC_V1.md` 恢复用 `tools/restore-from-appendix.js`（SHA-256 校验）。
7. **CSP 需含 `img-src blob:`**：否则浏览器拦截本地预览图（曾致"参考图无法添加"）。
8. **标签 PDF 是 60 枚/页（5 列×12 行）**，A4 210×297 mm 整除，二维码 24.75×24.75 mm（占满格高防畸变）；改动 `labels.js` 时要保持二维码不变形。

---

## 10. 部署信息

- 部署手册：`bsc-sampling-v1/deploy/DEPLOYMENT_GUIDE.md`
- 部署包生成：`deploy/make-package.ps1`（产物 `bsc-deploy-v1.zip`，不含数据库与真实配置）
- 交给服务器 AI 的提示词：`deploy/PROMPTS_FOR_SERVER_AI.md`
- 健康告警：`deploy/health-alert.ps1`（每小时，服务/磁盘/证书/备份）
- 每日备份：`deploy/schedule-backup.ps1`（02:30，VACUUM INTO 快照 + 照片增量 + `--mirror` 异机镜像，保留 14 天）

---

## 11. 接手建议的优先级

1. **通读** `bsc-sampling-v1/docs/DEVELOPMENT_SPEC_V1.md` 的 §5–§29（尤其 §28 需求变更记录、§29 风险），这是最权威的上下文。
2. **跑一遍测试**：`npm run check && npm test`，确认基线绿。
3. **处理版本错位**（§8.1），明确"最新版本"的口径。
4. 按用户的具体"修复"目标推进，优先 §8.2 的验收与部署收尾。
5. 每次改动同步更新 `DEVELOPMENT_SPEC_V1.md` 的「当前代码状态」，并遵守 §30 代码与文档规则（固定依赖版本、API 保持 `/api/v1`、UTF-8 等）。
