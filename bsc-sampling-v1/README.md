# 巴松措采样系统 V1 服务器与管理站

原生 Android 采集端的配套服务器：Node.js 22+（内置 SQLite），提供 `/api/v1` 移动端与管理端接口、管理站静态页面、照片与参考图目录，默认只监听 `127.0.0.1:3100`，由 Nginx 转发 `https://bsc.gpsgps.online`。

## 启动

```powershell
npm install          # 首次（qrcode + sharp）
npm start            # node src/server.js，监听 127.0.0.1:3100
```

- 数据目录：`data/v1/`（数据库 `bsc-v1.sqlite`、照片 `uploads/`、参考图 `reference/`、配置 `config.json`、备份 `backups/`）。
- 首次启动自动建库并写入种子数据：2 个项目、25 个正式点位（含 `5.1`、`9.5`、`9.6` 等历史序号）、采样员 `cmy01`（扫码激活即登录，无 PIN）。
- 默认管理员密码 `ChangeMe-2608!`：正式部署必须通过 `data/v1/config.json` 或环境变量 `ADMIN_PASSWORD`/`SESSION_SECRET` 修改，建议配置 `ADMIN_TOTP_SECRET` 启用动态验证码。
- 环境变量：`HOST`、`PORT`、`DATA_DIR`、`PUBLIC_BASE_URL`（激活二维码中的服务器地址）。

## 接口

- 移动端（Android APP）：`/api/v1/mobile/*` —— 激活、登录、同步、开始行程、轨迹批量上传、实时位置、幂等采样记录（照片 Base64 单包上传）、结束行程、诊断日志。
- 管理端：`/api/v1/admin/*` —— 登录（密码+可选 TOTP）、bootstrap、点位查询/新建/编辑（审计）、参考图上传压缩、设备激活二维码、任务创建/查询（按日期或待采样）、取消/解锁、40 枚/页 A4 标签打印页、审核、导出（CSV/GeoJSON/GPX/照片 ZIP/审计 CSV）、日志、健康检查（含磁盘余量）、天气补齐。
- 静态：管理站页面由 `/` 提供；照片 `/uploads/`、参考图 `/reference/`。

HTTP 语义：422 业务拒绝（超 300 m、二维码不匹配、异常原因缺失等），423 被其他设备锁定，401/403 身份失败，429 登录/PIN 限速（5 次失败锁定 10 分钟窗口），413 过大。移动端记录上传以 `client_record_id` 幂等。

## 测试与运维

```powershell
npm run check      # 全部 JS 语法检查
npm test           # 39 项自动化测试（安全单元、数据库迁移、API 集成、备份回归）
npm run smoke      # 30 项端到端冒烟（需要本机已启动服务器）
npm run test:e2e   # 无头浏览器端到端（Playwright，断言数随数据量动态变化，需要 npm start 运行中）
npm run backup     # 日常备份：node tools/backup.js --photos --keep 14
node tools/restore.js data/v1/backups/backup-<时间戳>   # 恢复演练
```

- 备份使用 `VACUUM INTO` 生成 WAL 一致快照；照片增量拷贝；保留 14 天。
- 磁盘告警：`GET /api/v1/admin/health` 返回剩余空间，小于 10 GB 告警、小于 5 GB 提示禁大导出。
- 恢复演练：`tools/restore.js` 恢复到临时目录并验证任意一条照片记录可打开（验收项 A16）。

## 管理站前端

`public/index.html` + `public/app.js` 已全部对接 `/api/v1`：项目/拍摄日期导航、卫星地图状态色标记、点位管理（选点/CSV 导入/编辑/参考图）、任务下发与 40 枚/页标签打印、审核详情（照片/参考图/轨迹/风险标志/审核意见）、取消/解锁、天气补齐、导出、设备激活二维码、诊断日志与磁盘健康。Leaflet 1.9.4 与 qrcodejs 本地托管在 `public/vendor/`，不依赖 CDN。

## 文档

- 开发基线：`docs/DEVELOPMENT_SPEC_V1.md`（含生成式源码快照附录 L）。
- `tools/embed-source-doc.js`：把当前源码重新嵌入文档；`tools/restore-from-appendix.js`：从附录 L 恢复源码（SHA-256 校验）。

正式上线前仍未完成（见开发文档 §28.2）：Android 真机验收、签名 APK、Windows 服务化、DNS 与 HTTPS。
