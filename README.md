# Codex 会话查看器

本项目是一个本地会话查看器，用来浏览 `~/.codex/sessions` 下的会话记录。

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## macOS 打包

- 当前已接入 macOS 打包链路
- 默认输出到 `release/`
- 当前脚本按“当前机器架构”打包；这台机器是 `arm64`

```bash
npm run pack:mac
npm run dist:mac:zip
npm run dist:mac:dmg
npm run dist:mac
```

`pack:mac` 会生成解包后的 `.app`，适合本机验包。  
`dist:mac:zip` 会生成一个可分发的 `.zip`。  
`dist:mac:dmg` 只生成 `.dmg`。  
`dist:mac` 会生成可分发的 `dmg + zip`。

## macOS 签名 / 公证

如果只是本机测试，可以先不签名。  
如果要分发给其他 Mac，建议配置以下环境变量后再执行 `npm run dist:mac`：

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

当前应用不请求相机、麦克风、屏幕录制等系统权限。  
它只访问用户选择的本地目录，以及默认的 `~/.codex/sessions`。
