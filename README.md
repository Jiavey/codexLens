<div align="center">

# CodexLens

一款关于Codex历史会话查看的放大镜应用。

简体中文 | [English](./README.en.md)

![版本](https://img.shields.io/badge/版本-1.0.0-E46845)
![平台](https://img.shields.io/badge/平台-macOS%20%7C%20Windows-14A38B)
![技术栈](https://img.shields.io/badge/技术栈-Vue%203%20%2B%20Vite%20%2B%20Electron-445FC6)

</div>

## 项目简介

CodexLens 是一个本地桌面查看器，用来浏览 `~/.codex/sessions` 下的 Codex 会话记录。
它强调快速定位会话、按角色区分消息、实时监听文件变化，以及尽量克制的内存占用。
应用完全本地运行，只读取你选择的会话目录，不会上传会话内容。

## 文档入口

- macOS 安装说明：[macos安装说明](./docs/macos-install.md)
- English install guide: [macOS Installation Guide](./docs/macos-install.en.md)

## 功能特性

- 按项目分组展示会话树，并按最近更新时间倒序排列
- 按 `user`、`codex`、`developer`、`system/tool` 区分时间线内容
- 监听本地会话文件新增内容，支持实时刷新
- 支持删除会话文件，并同步删除 `~/.codex/state_5.sqlite` 里的对应线程记录
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

## 开源协作

- 许可证：[MIT](./LICENSE)
- 贡献指南：[CONTRIBUTING.md](./CONTRIBUTING.md)
- 问题反馈：[GitHub Issues](https://github.com/Jiavey/codexLens/issues)
