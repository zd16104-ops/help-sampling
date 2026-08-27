# 巴松措水样采样系统（Bsc Sampling）

面向西藏巴松措（Basum Lake）周边约 30 公里范围的水质采样现场记录与留证系统。由**原生 Android 采集端**和 **Node.js 服务器 + 管理站网页**两部分组成，面向 ≤10 名村民采样员的轻量场景，以"现场照片 + GPS 轨迹 + 时间/天气/坐标水印"作为核心证据，防止采样点弄虚作假。

> 正式域名：`https://bsc.gpsgps.online`（Nginx → 本机 `127.0.0.1:3100`）。坐标体系统一 **WGS84**。

---

## 系统架构

```
┌─────────────────────┐         HTTPS /api/v1/mobile/*          ┌──────────────────────────┐
│  Android 原生 APP     │ ───────────────────────────────────▶ │  Node.js 服务器            │
│  (bsc-android-native) │   激活 / 同步 / 轨迹 / 记录 / 日志      │  (bsc-sampling-v1)        │
│  • MapLibre 地图       │                                      │  • node:sqlite 数据库       │
│  • CameraX 拍照+水印   │ ◀─────────────────────────────────── │  • /uploads /reference     │
│  • 前台轨迹服务        │              任务 / 二维码            │  • 备份 / 导出 / 天气补齐    │
│  • 离线队列+补传       │                                      └────────────┬─────────────┘
└─────────────────────┘                                                    │ 静态管理站 /api/v1/admin/*
                                                                    ┌──────▼──────────┐
                                                                    │ 管理站网页       │
                                                                    │ (public/)       │
                                                                    │ Leaflet + 二维码 │
                                                                    └─────────────────┘
```

---

## 仓库目录

| 目录 | 说明 |
|---|---|
| `bsc-sampling-v1/` | Node.js 服务器 + 管理站网页 + 部署脚本 + 文档 + 自动化测试 |
| `bsc-android-native/` | Android 原生 APP 源码（Gradle / AGP 8.7.3 / Java 17） |

详细内容见各自目录下的 `README.md`，以及 `bsc-sampling-v1/docs/DEVELOPMENT_SPEC_V1.md`（完整开发基线，含源码快照附录 L）。

---

## 快速开始

### 1. 服务器与管理站（`bsc-sampling-v1/`）

环境要求：Node.js ≥ 22（开发使用 24.13.0，内置 `node:sqlite`，无需独立数据库）。

```powershell
cd bsc-sampling-v1
npm install            # 首次：qrcode + sharp（playwright 仅测试需要）
npm start              # node src/server.js，监听 127.0.0.1:3100
```

- 数据目录 `data/v1/`：数据库 `bsc-v1.sqlite`、照片 `uploads/`、参考图 `reference/`、配置 `config.json`、备份 `backups/`（该目录不入库）。
- 首次启动自动建库并写入种子数据：2 个项目、25 个正式点位（含 `5.1`/`9.5`/`9.6` 等历史序号）、采样员 `cmy01`。
- 默认管理员密码 `ChangeMe-2608!`，**正式部署必须修改** `data/v1/config.json`（或环境变量 `ADMIN_PASSWORD`/`SESSION_SECRET`）。登录为仅密码，可选启用 TOTP（`adminTotpSecret` 填 Base32 密钥）。
- 环境变量：`HOST`、`PORT`、`DATA_DIR`、`PUBLIC_BASE_URL`（激活二维码中的服务器地址）。

浏览器打开 `http://127.0.0.1:3100` 即管理站。

### 2. Android APP（`bsc-android-native/`）

环境要求：JDK 17、Gradle 8.9、Android SDK 35（compileSdk 35 / AGP 8.7.3 / minSdk 29）。

```powershell
cd bsc-android-native
# 1) 一次性安装工具链到工作区根 android-toolchain/（可选，也可用本机已装 SDK）
powershell -ExecutionPolicy Bypass -File tools\setup-toolchain.ps1

# 2) 新建 local.properties（机器相关，不入库）
#    sdk.dir=D\:\\你的路径\\android-toolchain\\sdk

# 3) 编译 debug APK
node tools\gradle-with-proxy.js assembleDebug --no-daemon
# 产物：app/build/outputs/apk/debug/app-debug.apk
```

- 默认服务器地址 `https://bsc.gpsgps.online`（见 `app/build.gradle` 的 `buildConfigField DEFAULT_SERVER`）。
- 正式发布需用自己的 keystore 签名，并记录 APK SHA-256。
- `tools/gradle-with-proxy.js` 是开发沙箱专用的本地 Maven 代理，不会打包进 APK；普通联网环境可直接 `gradle assembleDebug`。

### 3. 测试

```powershell
cd bsc-sampling-v1
npm run check      # 全部 JS 语法检查
npm test           # 38 项自动化测试（安全单元 / 数据库迁移 / API 集成）
npm run smoke      # 30 项端到端冒烟（需先 npm start）
npm run test:e2e   # 73 项无头浏览器端到端（Playwright，需 npm start）
```

Android 单元测试：`cd bsc-android-native && node tools\gradle-with-proxy.js testDebugUnitTest`（`QrDataTest` 8 项）。

---

## 核心能力

- **无 PIN 激活**：管理员一次性生成激活二维码（24 小时有效、绑定设备），村民扫码即激活并自动登录。
- **防作弊证据链**：现场拍照（CameraX，暗色时间/天气/坐标水印）+ 每 10 秒轨迹 + 30 秒实时位置 + 服务器天气补齐（独立字段，不覆盖手机原文）。
- **距离规则**：0–30 m 正常；30–80 m 必须选择原因；80–300 m 严重可疑；>300 m 禁止提交。
- **离线可用**：SQLite 本地队列 + WorkManager 联网补传；记录上传以 `client_record_id` 幂等。
- **管理站**：点位管理（地图选点/右键加点/CSV 导入）、任务下发（多点位 × 多类型批量 + 全选）、40 枚/页 A4 标签打印、审核详情（照片/轨迹/风险标志）、取消/改期、导出（CSV/GeoJSON/GPX/照片 ZIP/审计 CSV）、设备激活二维码、诊断日志与磁盘健康。
- **运维**：`VACUUM INTO` 一致快照备份 + 照片增量拷贝 + 恢复演练；登录/PIN 限速与短时锁定；磁盘 <10 GB 告警。

---

## 部署

见 `bsc-sampling-v1/deploy/DEPLOYMENT_GUIDE.md`：Windows Server + 便携 Node.js + Nginx + Let's Encrypt + NSSM 服务 + 每日备份。部署包由 `deploy/make-package.ps1` 生成（`bsc-deploy-v1.zip`，不含数据库与真实配置），可交服务器 AI 按 `PROMPTS_FOR_SERVER_AI.md` 操作。

---

## 技术栈与开源依赖

**服务器**：Node.js（内置 `node:sqlite`）、`qrcode`、`sharp`、`playwright`（仅测试）。管理站前端：原生 JS + Leaflet 1.9.4 + qrcodejs（均本地托管于 `public/vendor/`，不依赖 CDN）。

**Android**：Java 17、AGP 8.7.3、compileSdk 35、MapLibre 11.11.0、CameraX 1.5.2、ZXing 3.5.4、WorkManager 2.11.2、OkHttp 4.12.0、AndroidX。

## 状态

当前为**迭代开发中的 V1**（尚未完成真机验收与正式签名 APK）。完整状态、已实现清单与需求变更记录见 `bsc-sampling-v1/docs/DEVELOPMENT_SPEC_V1.md` 第 28 节。
