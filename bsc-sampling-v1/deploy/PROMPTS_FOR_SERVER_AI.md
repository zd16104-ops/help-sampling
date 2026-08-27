# 交给服务器 AI 的部署提示词（按阶段复制粘贴）

> 每个提示词都自包含：目标、前置信息、步骤、验证方式、成功标准、禁止事项。
> 部署包：`bsc-deploy-v1.zip`（含 `bsc-server/` 与 `deploy/`）。
> 全程红线：不动 gpsgps.online / auto.gpsgps.online 的既有 Nginx 站点；
> 不装 Docker/Hyper-V/WSL2；3100 端口只监听 127.0.0.1，绝不对外开放。

---

## 提示词 1：环境准备（便携 Node.js）

```text
你是 Windows 服务器运维助手。请在这台 Windows Server 2022 上安装便携版 Node.js，
要求：
1. 下载 Node.js 24.x LTS 的 Windows x64 zip 版（nodejs.org 官方），解压到 D:\node24\，
   不要使用安装包全局安装，避免影响服务器上其他已有业务。
2. 把 D:\node24 加入系统 PATH（setx /M），并确认 node -v 输出 v24.x、npm -v 正常。
3. 不安装任何其他软件，不改动服务器现有服务。
完成后报告：node 版本、npm 版本、PATH 修改方式。
成功标准：新开一个终端执行 node -v 显示 v24.x。
```

## 提示词 2：部署包解压与首次启动

```text
你是 Windows 服务器运维助手。部署包 bsc-deploy-v1.zip 已在 D:\ 目录。
请执行：
1. 解压到 D:\bsc\（保持 bsc-server 与 deploy 两个目录结构）。
2. cd D:\bsc\bsc-server 运行 node src\server.js 做首次启动测试，
   确认输出 "BSC Sampling V1 listening on http://127.0.0.1:3100"，
   并确认 data\v1\config.json 与 bsc-v1.sqlite 已自动生成。
3. 编辑 data\v1\config.json：adminPassword 改为强密码（至少12位，大小写+数字+符号，
   由我后续提供或你生成后向我展示），其余字段保持默认。
4. 用浏览器/curl 验证 http://127.0.0.1:3100 返回管理站登录页（HTTP 200），
   GET /health 返回 {"status":"healthy"}。
5. 测试完成后先停止该测试进程（不要留着 CMD 窗口常驻，第 4 步会注册 Windows 服务）。
6. 禁止：添加防火墙 3100 入站规则；修改 src 下任何代码。
完成后报告：解压路径、首次启动日志、健康检查结果、修改后的配置项（密码不要明文写进报告，只写长度与是否包含特殊字符）。
成功标准：http://127.0.0.1:3100 可访问且 /health 返回 healthy。
```

## 提示词 3：Nginx 站点与 HTTPS 证书

```text
你是 Windows 服务器 Nginx 运维助手。服务器已有 Nginx，且已有 gpsgps.online、
auto.gpsgps.online 站点，这些站点绝不允许改动。
任务：为 bsc.gpsgps.online 新增独立站点并签发 Let's Encrypt 证书。
1. 使用部署包 deploy\nginx-bsc.conf 的内容，以 include 方式加入现有 nginx.conf，
   不要覆盖或重写现有配置。先用 nginx -t 验证语法。
2. 使用 win-acme（wacs.exe，若服务器没有请先下载解压到 D:\win-acme\）为
   bsc.gpsgps.online 签发证书，HTTP-01 验证，并确认它已自动注册续期计划任务。
3. 把 ssl_certificate / ssl_certificate_key 改为实际签发路径，nginx -t 后 reload。
4. 验证：curl -I https://bsc.gpsgps.online 返回 200；http://bsc.gpsgps.online 301 跳转 https。
5. 禁止：开放 3100 到公网；给 bsc 站点配置任何 WebSocket/缓存改写。
完成后报告：nginx -t 结果、证书路径与到期时间、curl 验证输出、reload 是否成功。
成功标准：HTTPS 访问返回 200，HTTP 自动跳转，证书到期日在 60 天以上。
```

## 提示词 4：注册 Windows 服务（开机自启 + 崩溃拉起）

```text
你是 Windows 服务器运维助手。请把巴松措采样服务注册为 Windows 服务：
1. 以管理员身份运行 D:\bsc\deploy\install-service.bat。
   （脚本会自动下载 nssm 2.24 到 D:\bsc\tools 并注册服务 BscSampling，
     工作目录 D:\bsc\bsc-server，命令 node src\server.js，开机自启，
     异常退出 5 秒后自动重启，日志轮转 10MB。）
2. 注册后检查：sc query BscSampling 状态为 RUNNING。
3. 重启服务一次验证自动拉起：nssm stop BscSampling 后 10 秒内应再次 RUNNING。
4. 确认 D:\bsc\bsc-server\logs\service.out.log 无报错。
完成后报告：服务状态、自动拉起验证结果、日志尾部关键行。
成功标准：BscSampling 处于 RUNNING，人工 stop 后自动恢复。
```

## 提示词 5：每日备份计划任务

```text
你是 Windows 服务器运维助手。请注册每日备份：
1. 管理员 PowerShell 执行 D:\bsc\deploy\schedule-backup.ps1，
   注册计划任务 BscSamplingBackup（每天 02:30，数据库一致快照+照片增量，保留14天）。
2. 手动执行一次验证：cd D:\bsc\bsc-server 后运行 node tools\backup.js --photos，
   确认 data\v1\backups\ 下生成 backup-<时间戳> 目录且包含 bsc-v1.sqlite 与 photos\。
3. 恢复演练：node tools\restore.js <刚生成的backup目录>，确认输出 "DRILL PASSED"。
4. 检查磁盘剩余空间并报告（Get-PSDrive C）。若剩余不足 10GB，明确提醒我。
完成后报告：计划任务名称与下次运行时间、备份目录清单、恢复演练结果、磁盘剩余。
成功标准：计划任务已注册且手动备份+恢复演练均成功。
```

## 提示词 6：上线验收自检（部署完成后执行）

```text
你是 Windows 服务器运维助手。请对巴松措采样系统做部署验收自检并逐项报告结果：
1. 进程：sc query BscSampling = RUNNING；netstat 确认 3100 仅监听 127.0.0.1。
2. 公网：curl -I https://bsc.gpsgps.online = 200；证书链完整（SSL Labs 或 curl -v 检查）。
3. 管理站：登录页可打开；/api/v1/admin/health 返回 freeBytes 与磁盘告警标志。
4. Nginx：nginx -t 通过；确认 gpsgps.online 与 auto.gpsgps.online 两个老站点访问不受影响。
5. 备份：BscSamplingBackup 计划任务存在；今日备份目录存在。
6. 日志：D:\bsc\bsc-server\logs\service.err.log 无未处理异常。
对每一项给出【通过/未通过】与证据（命令输出），未通过项给出修复建议但先不要擅自改代码。
成功标准：以上 6 项全部通过。
```

## 提示词 7：故障排查（仅在有异常时使用）

```text
你是 Windows 服务器运维助手。巴松措采样系统出现异常，请按以下顺序排查并报告证据：
1. sc query BscSampling 状态；D:\bsc\bsc-server\logs\service.err.log 最后 50 行。
2. 管理站"诊断日志"（/api/v1/admin/logs）最近 20 条 error 级日志。
3. 磁盘剩余（Get-PSDrive C）与 data\v1\backups 最新备份时间。
4. nginx 错误日志中 bsc.gpsgps.online 相关的最后 20 条。
5. curl -v https://bsc.gpsgps.online/api/v1/admin/health 输出。
把以上原始输出汇总给我（不要自行修改代码或数据库），并给出你的初步判断。
```
