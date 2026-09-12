# 巴松措采样 Android V1.5

原生 Android 10+ 客户端。默认只连接 `https://bsc.gpsgps.online`，不再使用 WebView，也不把 `127.0.0.1` 或电脑局域网地址写进 APK。

## 已实现流程

采样员账号 + 管理员设置的 8 位密钥（二维码为辅助）→ 激活后自动登录 → WGS84 地图与左日期/右点位任务列表 → 可选开始前往并记录轨迹 → 300 米内可直接扫码 → CameraX 现场拍照 → 深色时间/天气/坐标水印 → SQLite 待上传队列 → WorkManager 联网补传。

激活策略：管理员为每台设备设置或自动生成一次性 8 位数字密钥（24 小时有效），同时保留二维码；激活后打开 APP 直接进入，不再要求 PIN 或再次登录。

距离规则：0–30 米正常；30–80 米记录距离供审核；80–300 米严重可疑；超过 300 米禁止。二维码连续失败 3 次或 10 秒才出现损坏入口，手动编号必须和任务完整编号完全一致。应用没有“从相册选择”入口。

界面默认藏文主行、汉文辅行同时显示，不提供语言选择，也不包含语音功能。地图、任务、上传、我的四个入口保持不变；任务列表继续使用可滚动的左侧日期栏。上传页逐条显示等待上传、上传失败和已上传。采样详情固定显示“1 到点 → 2 扫码 → 3 拍照 → 4 保存”。七种样本（含地下水 `G`）使用统一的本地 Material Symbols Rounded 图标。

## 关键目录

- `app/src/main/java/.../Store.java`：任务、行程、轨迹、照片、日志本地数据库。
- `TrackingService.java`：前台轨迹与常驻通知。
- `ScanActivity.java`：CameraX + ZXing二维码。
- `PhotoActivity.java`：只允许现场相机与水印。
- `SyncEngine.java`：服务器同步、天气补全、失败重试。
- `Bilingual.java`：藏文主行、汉文辅行的统一排版。
- `SampleTypeCatalog.java`：七种样本的类型码、双语名称、颜色和图标唯一映射。
- `MaterialSymbols.java`：固定版本、随 APK 离线提供的 Material Symbols Rounded 路径。
- `tools/gradle-with-proxy.js`：本开发沙箱专用构建代理，不会打包进APK。

## 本机构建（Windows）

1. 一次性安装工具链（Gradle 8.9 + Android SDK 35 到工作区根目录 `android-toolchain/`）：

   ```powershell
   powershell -ExecutionPolicy Bypass -File tools\setup-toolchain.ps1
   ```

2. 新建 `local.properties`（机器相关，不提交）：

   ```properties
   sdk.dir=D\:\\你的路径\\android-toolchain\\sdk
   ```

3. 编译（依赖走本地缓存代理，首次较慢）：

   ```powershell
   node tools\gradle-with-proxy.js assembleDebug --no-daemon
   ```

   产物：`app/build/outputs/apk/debug/app-debug.apk`。正式发布需要签名（keystore 离线保存并记录 APK SHA-256）。

## 正式验收前必须真机检查

在 OPPO Find X7 / Android 15 上依次验证：藏文字形与长行不裁切、图标清楚、后台位置设为“始终允许”、锁屏 30 分钟轨迹不断、飞行模式采样、恢复网络自动上传、错误瓶子被拒绝、重复提交幂等、超过 300 米被禁止、无水记录、任务取消后仍可留证并进入审核。当前藏文文案是开发暂定稿，正式发布前必须由当地母语人员逐条确认。
