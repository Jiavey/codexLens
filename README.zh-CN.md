<div align="center">

# CodexLens

一款关于Codex历史会话查看的放大镜应用。

简体中文 | [English](./README.md)

![版本](https://img.shields.io/badge/版本-1.0.0-E46845)
![平台](https://img.shields.io/badge/平台-macOS%20%7C%20Windows-14A38B)
![技术栈](https://img.shields.io/badge/技术栈-Vue%203%20%2B%20Vite%20%2B%20Electron-445FC6)

</div>

## 项目简介

CodexLens 是一个本地桌面查看器，用来浏览 `~/.codex/sessions` 下的 Codex 会话记录。
它强调快速定位会话、按角色区分消息、实时监听文件变化，以及尽量克制的内存占用。

## 文档入口

- macOS 安装说明：[macos安装说明](./docs/macos-install.md)
- English install guide: [macOS Installation Guide](./docs/macos-install.en.md)

## 功能特性

- 按项目分组展示会话树，并按最近更新时间倒序排列
- 按 `user`、`codex`、`developer`、`system/tool` 区分时间线内容
- 监听本地会话文件新增内容，支持实时刷新
- 支持“只显示对话”，并过滤重复的用户事件消息
- 支持完整对话预览，并以 Markdown 风格聊天气泡渲染
- 支持按需加载原始 JSON，减少一次性内存占用

## 开发启动

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 打包说明

所有产物默认输出到 `release/` 目录。

### macOS

```bash
npm run pack:mac
npm run dist:mac:dmg
npm run dist:mac:zip
npm run dist:mac
```

- `pack:mac`：生成解包后的 `.app`，适合本机验包
- `dist:mac:dmg`：生成可分发的 `.dmg`
- `dist:mac:zip`：生成可分发的 `.zip`
- `dist:mac`：同时生成 `dmg + zip`

### Windows

Windows 安装包使用 `NSIS` 生成：

```bash
npx electron-builder --config electron-builder.yml --win nsis --x64
npx electron-builder --config electron-builder.yml --win nsis --arm64
```

## macOS 签名 / 公证

如果只是本机测试，可以先不签名。
如果要分发给其他 Mac，建议在打包前配置以下环境变量：

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `CSC_LINK` 或本机可用的 `Developer ID Application` 证书

项目已经预留：

- `electron-builder.yml`
- `build/entitlements.mac.plist`
- `build/entitlements.mac.inherit.plist`
- `scripts/notarize.mjs`

## 权限说明

当前应用不会请求相机、麦克风、屏幕录制或定位权限。
它只会读取用户选择的本地会话目录，以及默认的 `~/.codex/sessions`。

## 技术栈

- Vue 3
- Vite
- Electron
- TypeScript
- Chokidar

## 当前版本信息

- 应用名：`CodexLens`
- 当前版本：`1.0.0`
- 版权所有：`Copyright © 2026 Weiweimao.`
