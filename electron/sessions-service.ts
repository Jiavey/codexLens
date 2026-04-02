import { app, dialog, BrowserWindow, type OpenDialogOptions } from 'electron'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'

import chokidar, { type FSWatcher } from 'chokidar'

import {
  ITEM_PAGE_SIZE,
  type FilePatchedPayload,
  type OpenFileResult,
  type RawItemResult,
  type RootInfo,
  type SessionPreview,
  type SessionItemSummary,
  type TreeChangedPayload,
  type TreeNode,
  type TreeResponse,
} from '../src/shared/sessions.js'
import {
  parseSessionFile,
  parseSessionFileTail,
  readRawRange,
  readSessionPreview,
  type ParsedFileContext,
} from './sessions-parser.js'

const DEFAULT_ROOT_PATH = join(homedir(), '.codex', 'sessions')
const MAX_CONTEXT_CACHE = 4
const MAX_RAW_CACHE = 20

interface CachedContext extends ParsedFileContext {
  accessedAt: number
}

interface CachedPreview {
  preview: SessionPreview
  size: number
  mtime: number
}

export class SessionsService {
  private rootPath = DEFAULT_ROOT_PATH
  private rootWatcher: FSWatcher | null = null
  private activeFileWatcher: FSWatcher | null = null
  private activeFilePath: string | null = null
  private contexts = new Map<string, CachedContext>()
  private previewCache = new Map<string, CachedPreview>()
  private rawCache = new Map<string, RawItemResult>()
  private treeChangeTimer: NodeJS.Timeout | null = null
  private lastUpdatedAt: string | null = null
  private initialized = false

  async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    const persistedRoot = await this.loadPersistedRoot()
    this.rootPath = persistedRoot ?? DEFAULT_ROOT_PATH
    await this.resetRootWatcher()
    this.initialized = true
  }

  async dispose(): Promise<void> {
    if (this.treeChangeTimer) {
      clearTimeout(this.treeChangeTimer)
      this.treeChangeTimer = null
    }

    await Promise.allSettled([
      this.rootWatcher?.close(),
      this.activeFileWatcher?.close(),
    ])
  }

  async getRoot(): Promise<RootInfo> {
    await this.init()
    return {
      rootPath: this.rootPath,
      available: await this.pathExists(this.rootPath),
    }
  }

  async pickRoot(): Promise<RootInfo> {
    await this.init()

    const focusedWindow = BrowserWindow.getFocusedWindow()
    const options: OpenDialogOptions = {
      title: '选择 Codex 会话目录',
      properties: ['openDirectory'],
      defaultPath: this.rootPath,
    }
    const result = focusedWindow
      ? await dialog.showOpenDialog(focusedWindow, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return this.getRoot()
    }

    await this.setRootPath(result.filePaths[0])
    return this.getRoot()
  }

  async listTree(): Promise<TreeResponse> {
    await this.init()
    const available = await this.pathExists(this.rootPath)

    return {
      rootPath: this.rootPath,
      available,
      tree: available ? await this.scanTree(this.rootPath) : [],
      lastUpdatedAt: this.lastUpdatedAt,
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    await this.init()
    const absolutePath = resolve(filePath)

    if (!this.isManagedSessionFile(absolutePath)) {
      throw new Error('只能删除当前会话目录中的 .jsonl 文件。')
    }

    let stat

    try {
      stat = await fs.stat(absolutePath)
    } catch {
      throw new Error(`会话文件不存在：${basename(absolutePath)}`)
    }

    if (!stat.isFile()) {
      throw new Error('只能删除文件，不能删除目录。')
    }

    if (this.activeFilePath === absolutePath) {
      await this.detachActiveFileWatcher()
      this.activeFilePath = null
    }

    this.contexts.delete(absolutePath)
    this.previewCache.delete(absolutePath)

    for (const key of [...this.rawCache.keys()]) {
      if (key.startsWith(`${absolutePath}:`)) {
        this.rawCache.delete(key)
      }
    }

    await fs.unlink(absolutePath)
    this.lastUpdatedAt = new Date().toISOString()
  }

  async openFile(filePath: string): Promise<OpenFileResult> {
    await this.init()
    const absolutePath = resolve(filePath)
    const context = await this.getContext(absolutePath, true)
    const initialStart = Math.max(0, context.items.length - ITEM_PAGE_SIZE)

    await this.attachActiveFileWatcher(absolutePath)

    return {
      path: context.path,
      name: context.name,
      preview: context.preview,
      totalCount: context.items.length,
      initialStart,
      initialItems: context.items.slice(initialStart),
      meta: context.meta,
      mtime: context.mtime,
    }
  }

  async getItems(filePath: string, start: number, limit: number): Promise<SessionItemSummary[]> {
    await this.init()
    const context = await this.getContext(resolve(filePath), false)
    const safeStart = Math.max(0, start)
    const safeEnd = Math.min(context.items.length, safeStart + Math.max(limit, 1))
    return context.items.slice(safeStart, safeEnd)
  }

  async getRawItem(filePath: string, index: number): Promise<RawItemResult> {
    await this.init()
    const absolutePath = resolve(filePath)
    const cacheKey = `${absolutePath}:${index}`
    const cached = this.rawCache.get(cacheKey)

    if (cached) {
      this.rawCache.delete(cacheKey)
      this.rawCache.set(cacheKey, cached)
      return cached
    }

    const context = await this.getContext(absolutePath, false)
    const item = context.items[index]

    if (!item) {
      throw new Error(`Record ${index} not found in ${basename(filePath)}`)
    }

    const rawText = await readRawRange(absolutePath, item.rawByteStart, item.rawByteEnd)

    let formattedJson = rawText
    let parseError: string | undefined

    try {
      formattedJson = JSON.stringify(JSON.parse(rawText), null, 2)
    } catch {
      parseError = 'This line is not valid JSON.'
    }

    const result: RawItemResult = {
      path: absolutePath,
      index,
      rawText,
      formattedJson,
      parseError,
    }

    this.rawCache.set(cacheKey, result)
    this.trimRawCache()
    return result
  }

  async handleActiveFileChange(filePath: string): Promise<void> {
    await this.init()
    const absolutePath = resolve(filePath)
    const cached = this.contexts.get(absolutePath)

    if (!cached) {
      return
    }

    const stat = await fs.stat(absolutePath)

    if (stat.size < cached.fileSize) {
      const rebuilt = await this.refreshContext(absolutePath)

      this.broadcastFilePatched({
        path: absolutePath,
        mode: 'reset',
        totalCount: rebuilt.items.length,
      })
      return
    }

    if (stat.size === cached.fileSize) {
      return
    }

    const startIndex = cached.items.length
    const tail = await parseSessionFileTail(absolutePath, cached.fileSize, startIndex)

    if (tail.items.length === 0) {
      cached.fileSize = stat.size
      cached.mtime = stat.mtimeMs
      return
    }

    cached.items.push(...tail.items)
    cached.fileSize = tail.fileSize
    cached.mtime = tail.mtime
    cached.accessedAt = Date.now()

    this.broadcastFilePatched({
      path: absolutePath,
      mode: 'append',
      totalCount: cached.items.length,
      startIndex,
      items: tail.items,
    })
  }

  private async setRootPath(nextRootPath: string): Promise<void> {
    this.rootPath = resolve(nextRootPath)
    this.activeFilePath = null
    this.contexts.clear()
    this.previewCache.clear()
    this.rawCache.clear()
    await this.persistRoot(this.rootPath)
    await this.resetRootWatcher()
    await this.detachActiveFileWatcher()
    this.broadcastTreeChanged()
  }

  private async getContext(filePath: string, activate: boolean): Promise<CachedContext> {
    const existing = this.contexts.get(filePath)

    if (existing) {
      const stat = await fs.stat(filePath)

      if (stat.size === existing.fileSize) {
        existing.accessedAt = Date.now()

        if (activate) {
          this.activeFilePath = filePath
        }

        this.touchContext(filePath)
        return existing
      }
    }

    const context = await this.refreshContext(filePath)

    if (activate) {
      this.activeFilePath = filePath
    }

    return context
  }

  private async refreshContext(filePath: string): Promise<CachedContext> {
    const parsed = await parseSessionFile(filePath)
    const cached: CachedContext = {
      ...parsed,
      accessedAt: Date.now(),
    }

    this.contexts.set(filePath, cached)
    this.touchContext(filePath)
    this.trimContexts()
    return cached
  }

  private touchContext(filePath: string): void {
    const cached = this.contexts.get(filePath)

    if (!cached) {
      return
    }

    this.contexts.delete(filePath)
    this.contexts.set(filePath, cached)
  }

  private trimContexts(): void {
    while (this.contexts.size > MAX_CONTEXT_CACHE) {
      const oldestKey = this.contexts.keys().next().value as string | undefined

      if (!oldestKey) {
        return
      }

      if (oldestKey === this.activeFilePath) {
        const active = this.contexts.get(oldestKey)

        if (!active) {
          return
        }

        this.contexts.delete(oldestKey)
        this.contexts.set(oldestKey, active)
        continue
      }

      this.contexts.delete(oldestKey)

      for (const key of this.rawCache.keys()) {
        if (key.startsWith(`${oldestKey}:`)) {
          this.rawCache.delete(key)
        }
      }
    }
  }

  private trimRawCache(): void {
    while (this.rawCache.size > MAX_RAW_CACHE) {
      const oldestKey = this.rawCache.keys().next().value as string | undefined

      if (!oldestKey) {
        return
      }

      this.rawCache.delete(oldestKey)
    }
  }

  private async scanTree(dirPath: string): Promise<TreeNode[]> {
    const fileNodes = await this.collectSessionFiles(dirPath)
    const grouped = new Map<string, TreeNode[]>()

    for (const fileNode of fileNodes) {
      const projectName = fileNode.preview?.projectName || '未知项目'
      const bucket = grouped.get(projectName)

      if (bucket) {
        bucket.push(fileNode)
      } else {
        grouped.set(projectName, [fileNode])
      }
    }

    const projectNodes = Array.from(grouped.entries()).map(([projectName, children]) => {
      const sortedChildren = children.sort((left, right) => {
        const rightValue = this.getNodeSortValue(right)
        const leftValue = this.getNodeSortValue(left)

        if (rightValue !== leftValue) {
          return rightValue - leftValue
        }

        return right.name.localeCompare(left.name, undefined, { numeric: true })
      })

      return {
        id: `project:${projectName}`,
        name: projectName,
        path: `project:${projectName}`,
        kind: 'directory' as const,
        children: sortedChildren,
        mtime: sortedChildren[0]?.mtime,
      }
    })

    return projectNodes.sort((left, right) => {
      const rightValue = this.getNodeSortValue(right)
      const leftValue = this.getNodeSortValue(left)

      if (rightValue !== leftValue) {
        return rightValue - leftValue
      }

      return left.name.localeCompare(right.name, undefined, { numeric: true })
    })
  }

  private async resetRootWatcher(): Promise<void> {
    await this.rootWatcher?.close()
    this.rootWatcher = null
    this.lastUpdatedAt = new Date().toISOString()

    if (!(await this.pathExists(this.rootPath))) {
      return
    }

    this.rootWatcher = chokidar.watch(this.rootPath, {
      ignored: (candidatePath) => this.isIgnoredWatchedPath(candidatePath),
      ignoreInitial: true,
      depth: 4,
    })

    const scheduleBroadcast = () => {
      this.lastUpdatedAt = new Date().toISOString()

      if (this.treeChangeTimer) {
        clearTimeout(this.treeChangeTimer)
      }

      this.treeChangeTimer = setTimeout(() => {
        this.broadcastTreeChanged()
      }, 160)
    }

    this.rootWatcher
      .on('add', scheduleBroadcast)
      .on('unlink', scheduleBroadcast)
      .on('addDir', scheduleBroadcast)
      .on('unlinkDir', scheduleBroadcast)
      .on('change', scheduleBroadcast)
  }

  private async attachActiveFileWatcher(filePath: string): Promise<void> {
    if (this.activeFilePath === filePath && this.activeFileWatcher) {
      return
    }

    this.activeFilePath = filePath
    await this.detachActiveFileWatcher()

    this.activeFileWatcher = chokidar.watch(filePath, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 180,
        pollInterval: 60,
      },
    })

    this.activeFileWatcher
      .on('change', () => {
        void this.handleActiveFileChange(filePath)
      })
      .on('unlink', () => {
        this.broadcastFilePatched({
          path: filePath,
          mode: 'reset',
          totalCount: 0,
        })
      })
  }

  private async detachActiveFileWatcher(): Promise<void> {
    await this.activeFileWatcher?.close()
    this.activeFileWatcher = null
  }

  private async loadPersistedRoot(): Promise<string | null> {
    try {
      const raw = await fs.readFile(this.getConfigPath(), 'utf8')
      const parsed = JSON.parse(raw) as { rootPath?: string }
      return parsed.rootPath ? resolve(parsed.rootPath) : null
    } catch {
      return null
    }
  }

  private async persistRoot(rootPath: string): Promise<void> {
    await fs.mkdir(app.getPath('userData'), { recursive: true })
    await fs.writeFile(this.getConfigPath(), JSON.stringify({ rootPath }, null, 2), 'utf8')
  }

  private getConfigPath(): string {
    return join(app.getPath('userData'), 'sessions-viewer.json')
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath)
      return true
    } catch {
      return false
    }
  }

  private isIgnoredWatchedPath(candidatePath: string): boolean {
    const relativePath = relative(this.rootPath, resolve(candidatePath))

    if (!relativePath || relativePath === '.') {
      return false
    }

    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      return false
    }

    return relativePath.split(/[\\/]/).some((part) => part.startsWith('.'))
  }

  private isManagedSessionFile(filePath: string): boolean {
    if (extname(filePath) !== '.jsonl') {
      return false
    }

    const relativePath = relative(this.rootPath, filePath)

    return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath)
  }

  private broadcastTreeChanged(): void {
    void this.getRoot().then((root) => {
      const payload: TreeChangedPayload = {
        rootPath: root.rootPath,
        available: root.available,
        at: new Date().toISOString(),
      }

      this.broadcast('sessions:treeChanged', payload)
    })
  }

  private broadcastFilePatched(payload: FilePatchedPayload): void {
    this.broadcast('sessions:filePatched', payload)
  }

  private broadcast(channel: string, payload: unknown): void {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(channel, payload)
    }
  }

  private async getPreview(
    filePath: string,
    size: number,
    mtime: number,
    fallbackName: string,
  ): Promise<SessionPreview> {
    const cached = this.previewCache.get(filePath)

    if (cached && cached.size === size && cached.mtime === mtime) {
      return cached.preview
    }

    let preview: SessionPreview

    try {
      preview = await readSessionPreview(filePath)
    } catch {
      preview = {
        rawName: fallbackName,
        projectName: '未知项目',
        displayTitle: fallbackName,
        subtitle: '未知项目',
        startedAt: null,
      }
    }

    this.previewCache.set(filePath, {
      preview,
      size,
      mtime,
    })

    return preview
  }

  private async collectSessionFiles(dirPath: string): Promise<TreeNode[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const nodes: TreeNode[] = []

    const sorted = [...entries]
      .filter((entry) => !entry.name.startsWith('.'))
      .sort((left, right) => right.name.localeCompare(left.name, undefined, { numeric: true }))

    for (const entry of sorted) {
      const absolutePath = join(dirPath, entry.name)

      if (entry.isDirectory()) {
        nodes.push(...await this.collectSessionFiles(absolutePath))
        continue
      }

      if (entry.isFile() && extname(entry.name) === '.jsonl') {
        const stat = await fs.stat(absolutePath)
        const preview = await this.getPreview(absolutePath, stat.size, stat.mtimeMs, entry.name)
        nodes.push({
          id: absolutePath,
          name: entry.name,
          path: absolutePath,
          kind: 'file',
          preview,
          size: stat.size,
          mtime: stat.mtimeMs,
        })
      }
    }

    return nodes
  }

  private getNodeSortValue(node: TreeNode): number {
    if (node.kind === 'file') {
      const startedAt = node.preview?.startedAt ? Date.parse(node.preview.startedAt) : Number.NaN
      return Number.isFinite(startedAt) ? startedAt : (node.mtime ?? 0)
    }

    const firstChild = node.children?.[0]

    if (!firstChild) {
      return node.mtime ?? 0
    }

    return this.getNodeSortValue(firstChild)
  }
}
