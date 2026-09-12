# 第三方资源说明

## Material Symbols Rounded

- 用途：APP 导航、全局操作、采样步骤、上传状态和七种样本图标。
- 来源：Google `material-design-icons` 官方仓库。
- 固定提交：`40a7a292a79d9394157e1ea24f83d52d5e17c556`。
- 本地资源：`app/src/main/java/online/gpsgps/bscsampling/MaterialSymbols.java`。
- 许可证：Apache License 2.0。
- 官方仓库：https://github.com/google/material-design-icons
- 许可证原文：https://github.com/google/material-design-icons/blob/master/LICENSE

SVG path 已固化为本地 Android Drawable 实现，不在运行时请求 Google Fonts、CDN 或其他互联网资源。

## 藏文字体与文案

当前 Android 10+ 版本使用设备系统的 Unicode 藏文字体回退。正式部署前必须在 OPPO Find X7 上完成字形、组合音标和行高测试；若目标 ROM 覆盖不足，再随 APK 打包 Noto Tibetan 官方固定版本及其许可证。当前藏文文案为开发暂定稿，不代表已经过当地母语人员审核。
