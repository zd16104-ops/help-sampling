# 第三方资源说明

## Material Symbols Rounded

- 用途：管理站功能图标、样本类型图标、瓶身标签样本图标。
- 来源：Google `material-design-icons` 官方仓库。
- 固定提交：`40a7a292a79d9394157e1ea24f83d52d5e17c556`。
- 本地资源：`public/icons.js` 与 `src/sample-types.js` 中的 SVG path 数据。
- 许可证：Apache License 2.0。
- 官方仓库：https://github.com/google/material-design-icons
- 许可证原文：https://github.com/google/material-design-icons/blob/master/LICENSE

图标在构建时已经固化到项目中。管理站和标签生成过程不会在运行时请求 Google Fonts、CDN 或其他互联网资源。

## 标签字体

项目当前不重新分发操作系统字体。生产部署必须通过 `LABEL_TIBETAN_FONT_PATH` 和 `LABEL_FONT_PATH` 指向服务器上的已授权字体文件，并将字体连同其许可证归档到部署材料中。建议藏文字体采用 Noto Tibetan 官方项目中经实物打印验证的固定版本：https://github.com/notofonts/tibetan
