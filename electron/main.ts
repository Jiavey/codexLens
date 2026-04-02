import { app, BrowserWindow, ipcMain } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { GetItemsRequest, RawItemRequest } from '../src/shared/sessions.js'
import { SessionsService } from './sessions-service.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const service = new SessionsService()

async function createMainWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1520,
    height: 960,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#f3ede2',
    title: 'Codex 会话查看器',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL

  if (devServerUrl) {
    await window.loadURL(devServerUrl)
    return
  }

  await window.loadFile(join(__dirname, '../dist/index.html'))
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
}

app.whenReady().then(async () => {
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
