# 巴松措采样 Android V1

原生 Android 10+ 客户端。默认只连接 `https://bsc.gpsgps.online`，不再使用 WebView，也不把 `127.0.0.1` 或电脑局域网地址写进 APK。

## 已实现流程

设备激活二维码或密钥 → 自动登录（无 PIN）→ WGS84地图与任务 → 可选开始前往并记录轨迹 → 300米内可直接扫码 → CameraX现场拍照 → 深色时间/天气/坐标水印 → SQLite待上传队列 → WorkManager联网补传。

激活策略：管理员为每台设备生成一次性激活二维码或密钥（24 小时有效），同一采样员可绑定多台设备；激活后打开 APP 直接进入，不再要求 PIN 或再次登录。

距离规则：0–30米正常；30–80米必须选择原因；80–300米严重可疑；超过300米禁止。二维码连续失败3次或10秒才出现损坏入口，手动编号必须和任务完全一致。应用没有“从相册选择”入口。

## 关键目录

- `app/src/main/java/.../Store.java`：任务、行程、轨迹、照片、日志本地数据库。
- `TrackingService.java`：前台轨迹与常驻通知。
- `ScanActivity.java`：CameraX + ZXing二维码。
- `PhotoActivity.java`：只允许现场相机与水印。
- `SyncEngine.java`：服务器同步、天气补全、失败重试。
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

在 OPPO Find X7 / Android 15 上依次验证：后台位置设为“始终允许”、锁屏30分钟轨迹不断、飞行模式采样、恢复网络自动上传、错误瓶子被拒绝、重复提交幂等、超过300米被禁止、无水记录、任务取消后仍可留证并进入审核。
