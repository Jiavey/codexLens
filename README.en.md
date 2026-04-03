<div align="center">

# CodexLens

An app that lets you inspect Codex conversation history with a magnifying-glass view.

[简体中文](./README.md) | English

![Version](https://img.shields.io/badge/version-1.0.1-E46845)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-14A38B)
![Stack](https://img.shields.io/badge/stack-Vue%203%20%2B%20Vite%20%2B%20Electron-445FC6)

</div>

## Overview

CodexLens is a local desktop viewer for browsing Codex session files under `~/.codex/sessions`.
It focuses on fast session discovery, role-aware timelines, live file updates, and lightweight memory usage.
The app runs locally, only reads the session directory you choose, and does not upload session content.

## Documentation

- macOS installation guide: [macOS Installation Guide](./docs/macos-install.en.md)
- Chinese installation guide: [macos安装说明](./docs/macos-install.md)

## Features

- Project-grouped session tree with recent-first ordering
- Role-aware conversation timeline for `user`, `codex`, `developer`, and `system/tool`
- Live updates when session files are appended or changed locally
- Session deletion that also removes the matching thread record from `~/.codex/state_5.sqlite`
- Chinese / English interface switching, with Chinese as the default language
- Conversation-only mode with duplicate user-event filtering
- Full conversation preview rendered as Markdown-style chat bubbles
- On-demand raw JSON viewer with delayed loading to reduce memory pressure

## Quick Start

```bash
npm install
npm run dev
```

## Settings

- A settings button is available at the top of the left sidebar
- The settings dialog lets you change the sessions folder and switch the interface language (Chinese / English)
- The dialog opens automatically on the first launch after installation, and does not auto-open again afterward

## Build

```bash
npm run build
```

## Packaging

All build outputs are generated under `release/`.

### macOS

```bash
npm run pack:mac
npm run dist:mac:dmg
npm run dist:mac:zip
npm run dist:mac
```

- `pack:mac`: builds the unpacked `.app` for local verification
- `dist:mac:dmg`: builds distributable `.dmg`
- `dist:mac:zip`: builds distributable `.zip`
- `dist:mac`: builds both `dmg + zip`

### Windows

NSIS installers can be built with `electron-builder`:

```bash
npx electron-builder --config electron-builder.yml --win nsis --x64
npx electron-builder --config electron-builder.yml --win nsis --arm64
```

## Permissions

The app does not request camera, microphone, screen recording, or location access.
It only reads the session directory selected by the user, plus the default `~/.codex/sessions` source.

## Tech Stack

- Vue 3
- Vite
- Electron
- TypeScript
- Chokidar

## Release Notes

- Current app name: `CodexLens`
- Current release version: `1.0.1`
- Copyright: `Copyright © 2026 Weiweimao.`

## Open Source

- License: [MIT](./LICENSE)
- Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Issues: [GitHub Issues](https://github.com/Jiavey/codexLens/issues)
