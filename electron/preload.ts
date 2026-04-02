import { contextBridge, ipcRenderer } from 'electron'

import type {
  FilePatchedPayload,
  GetItemsRequest,
  RawItemRequest,
  SessionsApi,
  TreeChangedPayload,
} from '../src/shared/sessions.js'

const api: SessionsApi = {
  getRoot: () => ipcRenderer.invoke('sessions:getRoot'),
  pickRoot: () => ipcRenderer.invoke('sessions:pickRoot'),
  listTree: () => ipcRenderer.invoke('sessions:listTree'),
  deleteFile: (path) => ipcRenderer.invoke('sessions:deleteFile', path),
  openFile: (path) => ipcRenderer.invoke('sessions:openFile', path),
  getItems: (request: GetItemsRequest) => ipcRenderer.invoke('sessions:getItems', request),
  getRawItem: (request: RawItemRequest) => ipcRenderer.invoke('sessions:getRawItem', request),
  onTreeChanged: (listener: (payload: TreeChangedPayload) => void) => {
    const wrapped = (_event: unknown, payload: TreeChangedPayload) => listener(payload)
    ipcRenderer.on('sessions:treeChanged', wrapped)
    return () => {
      ipcRenderer.removeListener('sessions:treeChanged', wrapped)
    }
  },
  onFilePatched: (listener: (payload: FilePatchedPayload) => void) => {
    const wrapped = (_event: unknown, payload: FilePatchedPayload) => listener(payload)
    ipcRenderer.on('sessions:filePatched', wrapped)
    return () => {
      ipcRenderer.removeListener('sessions:filePatched', wrapped)
    }
  },
}

contextBridge.exposeInMainWorld('sessionsApi', api)
