# 巴松措采样系统 V1 部署手册（Windows Server 2022）

> 适用：1 核 / 4 GB、已有 Nginx、磁盘约 18 GB 的 Windows 服务器。
> 原则：不装 Docker/Hyper-V/WSL2，不动 gpsgps.online 与 auto.gpsgps.online 既有站点，
> Node.js 只监听 127.0.0.1:3100，公网只有 HTTPS 443。

## 部署包结构

```
bsc-deploy-v1.zip
├─ bsc-server/                  ← Node 服务（含生产依赖 node_modules）
│  ├─ src/                      ← 服务源码（server.js / schema.js / ...）
│  ├─ public/                   ← 管理站网页（含本地 Leaflet/qrcodejs）
│  ├─ tools/                    ← 备份/恢复/文档工具
│  ├─ docs/                     ← 开发基线文档（含源码快照附录 L）
│  ├─ data/v1/                  ← 首次启动自动建库（含 25 个正式点位种子），
│  │  └─ config.json             ←   启动后自动生成的唯一配置文件（勿放其他配置文件）
│  ├─ config.example.json        ← 配置示例（参考用；正式配置在 data\v1\config.json）
│  └─ package.json
└─ deploy/                      ← 部署脚本与本手册
   ├─ nginx-bsc.conf
   ├─ install-service.bat / uninstall-service.bat
   ├─ schedule-backup.ps1
   ├─ DEPLOYMENT_GUIDE.md       ← 本手册
   └─ PROMPTS_FOR_SERVER_AI.md  ← 交给服务器 AI 的操作提示词
```

## 部署步骤总览

| 步骤 | 内容 | 负责 |
|---|---|---|
| 1 | 京东云 DNS：`bsc.gpsgps.online` A 记录 → 服务器公网 IP | 管理员（网页操作） |
| 2 | 便携版 Node.js 24 安装到独立目录并加入 PATH | 服务器 AI |
| 3 | 解压部署包到 `D:\bsc\`，首次启动、修改管理员密码 | 服务器 AI |
| 4 | Nginx 增加站点 + Let's Encrypt 证书（win-acme）+ 自动续期 | 服务器 AI |
| 5 | NSSM 注册 Windows 服务（开机自启、崩溃自动拉起） | 服务器 AI |
| 6 | 每日备份计划任务 + 磁盘告警 | 服务器 AI |
| 7 | 验收：手机 4G 打开 `https://bsc.gpsgps.online` 走通激活 | 管理员 + 真机 |

## 详细说明

### 1. DNS（京东云控制台）

记录类型 A，主机记录 `bsc`，记录值 = 服务器公网 IP。验证：

```powershell
nslookup bsc.gpsgps.online
```

### 2. 便携 Node.js 24

- 从 https://nodejs.org 下载 Windows x64 zip 版（v24.x LTS），解压到 `D:\node24\`。
- 把 `D:\node24` 加入系统 PATH（重启终端生效）。
- 验证：`node -v` 输出 v24.x。
- 说明：部署包已自带生产依赖（node_modules），使用 Node 24 可直接运行，无需联网 npm install；
  若服务器 Node 版本不是 24，请运行 `npm install --omit=dev` 重新安装依赖。

### 3. 解压与首次启动

```powershell
# 解压到 D:\bsc\
Expand-Archive bsc-deploy-v1.zip -DestinationPath D:\bsc\
cd D:\bsc\bsc-server
node src\server.js
```

- 首次启动自动生成 `data\v1\config.json` 与数据库（含 2 个项目、25 个正式点位、测试采样员 cmy01）。`data\v1\` 内始终只有这一个配置文件（`bsc-server\config.example.json` 仅为参考示例）。
- **上线前必做**：修改 `data\v1\config.json`：
  - `adminPassword` 改为强密码（≥12 位，含大小写数字符号）；
  - `sessionSecret` 换成随机长字符串（首次启动已自动生成，保留即可）；
  - 可选：`adminTotpSecret` 填入 Base32 TOTP 密钥启用管理员动态验证码；
  - `publicBaseUrl` 保持 `https://bsc.gpsgps.online`。
- 验证：浏览器打开 `http://127.0.0.1:3100` 显示登录页 → 用新密码登录。
- **防火墙**：3100 只应监听 127.0.0.1；不要添加任何入站放行规则。

### 4. Nginx 与证书

- 用部署包内 `deploy\nginx-bsc.conf`，把两个 server 块 include 进现有 nginx.conf。
- 证书推荐 win-acme（Windows 原生 ACME 客户端）：

```powershell
wacs.exe   # 交互式：选择 bsc.gpsgps.online → HTTP 验证 → 自动签发并配置续期任务
```

- 签发后把 `ssl_certificate` / `ssl_certificate_key` 路径改成实际文件。
- `nginx -t` 通过后 reload。验证：`curl -I https://bsc.gpsgps.online` 返回 200/301。

### 5. Windows 服务（NSSM）

```bat
cd D:\bsc\deploy
install-service.bat     :: 服务名 BscSampling，开机自启、崩溃 5 秒自动拉起
```

- 服务日志：`D:\bsc\bsc-server\logs\service.*.log`。
- 更新代码后重启：`nssm restart BscSampling`。

### 6. 备份与磁盘

```powershell
powershell -ExecutionPolicy Bypass -File D:\bsc\deploy\schedule-backup.ps1
```

- 每天 02:30：数据库 `VACUUM INTO` 一致快照 + 照片增量拷贝，保留 14 天，输出 `data\v1\backups\`。
- 磁盘告警：管理站左侧底部实时显示剩余空间（<10 GB 橙色告警、<5 GB 红色告警），
  接口 `GET /api/v1/admin/health` 返回 `warnLowDisk/criticalLowDisk`。
- 服务器剩余约 18 GB：建议每周把 `data\v1\backups` 与 `data\v1\uploads` 异机拷贝一次。

### 7. 上线验收（服务器侧可自测项）

- [ ] `http://127.0.0.1:3100` 管理站登录、点位/任务/标签/导出正常
- [ ] `https://bsc.gpsgps.online` 证书有效、HTTP 自动跳转 HTTPS
- [ ] 管理站"诊断日志"能查到 APP 日志
- [ ] 服务停止后 NSSM 自动拉起
- [ ] 备份目录生成今天的快照，`node tools\restore.js <备份>` 恢复演练通过
- [ ] 手机（4G，不连 WiFi）浏览器打开管理站正常；安装 APK 扫码激活成功（真机验收）

### 8. 常见问题

| 现象 | 处理 |
|---|---|
| 3100 被占用 | `netstat -ano | findstr 3100` 查进程；不要盲目换端口，换端口需同步改 nginx 与 APP |
| sharp 报错（Node 版本不符） | `cd D:\bsc\bsc-server && npm install --omit=dev` |
| 证书续期失败 | win-acme 日志排查；到期前 30 天演练一次 |
| 服务起不来 | 看 `bsc-server\logs\service.err.log`，必要时把日志发管理员 |
| 上传大照片 413 | 检查 nginx `client_max_body_size 15m` 是否生效 |

## 交给服务器 AI 的提示词

见 `deploy\PROMPTS_FOR_SERVER_AI.md`，按阶段复制粘贴即可。
