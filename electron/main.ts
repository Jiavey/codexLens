import { Menu, app, BrowserWindow, ipcMain } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { GetItemsRequest, RawItemRequest } from '../src/shared/sessions.js'
import { SessionsService } from './sessions-service.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const service = new SessionsService()
const APP_NAME = 'CodexLens'

async function createMainWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1520,
    height: 960,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#f3ede2',
    title: APP_NAME,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) {
      return
    }

    const html = `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Helvetica Neue',sans-serif;background:#f3ede2;color:#3f342b;">
    <h2 style="margin:0 0 12px;">页面加载失败</h2>
    <p style="margin:0 0 8px;">应用资源没有正常加载。</p>
    <p style="margin:0 0 8px;">错误码：${errorCode}</p>
    <p style="margin:0 0 8px;">错误信息：${errorDescription}</p>
    <p style="margin:0;word-break:break-all;">目标地址：${validatedURL}</p>
  </body>
</html>`

    void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL

  window.setMenuBarVisibility(false)
  window.removeMenu()

  if (devServerUrl) {
    await window.loadURL(devServerUrl)
    return
  }

  await window.loadFile(join(app.getAppPath(), 'dist/index.html'))
}

function registerIpcHandlers(): void {
  ipcMain.handle('sessions:getRoot', () => service.getRoot())
  ipcMain.handle('sessions:pickRoot', () => service.pickRoot())
  ipcMain.handle('sessions:listTree', () => service.listTree())
  ipcMain.handle('sessions:deleteFile', (_event, filePath: string) => service.deleteFile(filePath))
  ipcMain.handle('sessions:openFile', (_event, filePath: string) => service.openFile(filePath))
  ipcMain.handle('sessions:getItems', (_event, request: GetItemsRequest) =>
    service.getItems(request.path, request.start, request.limit),
  )
  ipcMain.handle('sessions:getRawItem', (_event, request: RawItemRequest) =>
    service.getRawItem(request.path, request.index),
  )
  ipcMain.handle('sessions:getConversationItems', (_event, filePath: string) =>
    service.getConversationItems(filePath),
  )
}

app.whenReady().then(async () => {
  app.setName(APP_NAME)
  Menu.setApplicationMenu(null)
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    copyright: 'Copyright © 2026 Weiweimao.',
  })
  registerIpcHandlers()
  await service.init()
  await createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  void service.dispose()
})
