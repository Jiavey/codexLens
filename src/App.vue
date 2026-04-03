<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DOMPurify from 'dompurify'
import { marked } from 'marked'

import SessionVirtualList from './components/SessionVirtualList.vue'
import TreeNodeItem from './components/TreeNodeItem.vue'
import { maskDisplayText, maskDisplayValue } from './utils/display'
import {
  type ConversationItemDetail,
  ITEM_PAGE_SIZE,
  type FilePatchedPayload,
  type RawItemResult,
  type SessionItemSummary,
  type SessionMetaSummary,
  type SessionPreview,
  type TreeNode,
  type TreeResponse,
} from './shared/sessions'

const SHOW_CONVERSATION_ONLY_STORAGE_KEY = 'timeline.showConversationOnly'

const timelineRef = ref<InstanceType<typeof SessionVirtualList> | null>(null)
const tree = ref<TreeNode[]>([])
const rootPath = ref('')
const rootAvailable = ref(false)
const lastUpdatedAt = ref<string | null>(null)
const selectedFilePath = ref<string | null>(null)
const selectedPreview = ref<SessionPreview | null>(null)
const selectedMeta = ref<SessionMetaSummary | null>(null)
const totalCount = ref(0)
const totalConversationCount = ref<number | null>(0)
const items = ref<Array<SessionItemSummary | null>>([])
const isLoadingTree = ref(false)
const isLoadingFile = ref(false)
const rawDetail = ref<RawItemResult | null>(null)
const rawLoading = ref(false)
const rawError = ref('')
const pendingNewCount = ref(0)
const deletingPath = ref<string | null>(null)
const isAtLatestEdge = ref(true)
const isDescending = ref(false)
const fatalError = ref('')
const showConversationOnly = ref(
  readBooleanPreference(SHOW_CONVERSATION_ONLY_STORAGE_KEY, true),
)
const conversationPreviewOpen = ref(false)
const conversationPreviewLoading = ref(false)
const conversationPreviewError = ref('')
const conversationPreviewItems = ref<Array<ConversationPreviewItem>>([])

const loadedPages = new Set<number>()
const loadingPages = new Set<number>()
let currentOpenToken = 0
let stopTreeChanged: (() => void) | null = null
let stopFilePatched: (() => void) | null = null

interface ConversationPreviewItem extends ConversationItemDetail {
  html: string
}

const hasSelection = computed(() => Boolean(selectedFilePath.value))
const canPreviewConversation = computed(() => hasSelection.value && showConversationOnly.value)
const loadedCount = computed(() => items.value.filter(Boolean).length)
const loadedProgressCount = computed(() =>
  isDescending.value ? getLoadedSuffixCount() : getLoadedPrefixCount(),
)
const displayTotalCount = computed(() =>
  {
    if (!showConversationOnly.value) {
      return totalCount.value
    }

    if (typeof totalConversationCount.value === 'number') {
      return totalConversationCount.value
    }

    if (items.value.length > 0 && items.value.every((item) => item !== null)) {
      return countDisplayedLoadedItems(items.value, 0)
    }

    return displayLoadedCount.value
  },
)
const displayLoadedCount = computed(() =>
  showConversationOnly.value ? countDisplayedLoadedItems(items.value, 0) : loadedCount.value,
)
const displayLoadedProgressCount = computed(() => {
  if (!showConversationOnly.value) {
    return loadedProgressCount.value
  }

  if (isDescending.value) {
    const start = getLoadedSuffixStart()
    return countDisplayedLoadedItems(items.value.slice(start), start)
  }

  return countDisplayedLoadedItems(items.value.slice(0, getLoadedPrefixCount()), 0)
})
const ownershipDisplayLabel = computed(() => {
  const meta = selectedMeta.value

  if (!meta) {
    return '暂无'
  }

  const parts = [
    formatAuthMode(meta.authMode),
    formatOriginator(meta.originator),
    formatSource(meta.source),
  ].filter(
    (value): value is string => Boolean(value?.trim()),
  )

  return parts.join(' / ') || '暂无'
})
const timelineEntries = computed(() => {
  const next: Array<{ actualIndex: number; item: SessionItemSummary | null }> = []

  if (isDescending.value) {
    for (let index = items.value.length - 1; index >= 0; index -= 1) {
      const item = items.value[index]

      if (shouldDisplayTimelineItem(item, index)) {
        next.push({ actualIndex: index, item })
      }
    }

    return next
  }

  for (let index = 0; index < items.value.length; index += 1) {
    const item = items.value[index]

    if (shouldDisplayTimelineItem(item, index)) {
      next.push({ actualIndex: index, item })
    }
  }

  return next
})
const lastConversationAt = computed(() => {
  for (let index = items.value.length - 1; index >= 0; index -= 1) {
    const item = items.value[index]

    if (item && item.bucket !== 'system' && item.timestamp) {
      return item.timestamp
    }
  }

  for (let index = items.value.length - 1; index >= 0; index -= 1) {
    const item = items.value[index]

    if (item?.timestamp) {
      return item.timestamp
    }
  }

  return null
})
const timelineItems = computed(() => timelineEntries.value.map((entry) => entry.item))
const timelineActualIndexes = computed(() => timelineEntries.value.map((entry) => entry.actualIndex))

watch(showConversationOnly, (value) => {
  writeBooleanPreference(SHOW_CONVERSATION_ONLY_STORAGE_KEY, value)
  pendingNewCount.value = 0

  if (!value) {
    closeConversationPreview()
  }

  void nextTick().then(() => {
    timelineRef.value?.scrollToIndex(0)
  })
})

watch(selectedFilePath, (value, previousValue) => {
  if (value !== previousValue) {
    closeConversationPreview()
  }
})

onMounted(() => {
  if (!window.sessionsApi) {
    fatalError.value = '桌面应用预加载桥接不可用，请通过应用入口启动。'
    return
  }

  stopTreeChanged = window.sessionsApi.onTreeChanged(() => {
    void refreshTree({ preserveSelection: true, allowAutoSelect: false })
  })
  stopFilePatched = window.sessionsApi.onFilePatched((payload) => {
    void handleFilePatched(payload)
  })

  void bootstrap()
})

onBeforeUnmount(() => {
  stopTreeChanged?.()
  stopFilePatched?.()
})

async function bootstrap() {
  await refreshTree({ preserveSelection: false, allowAutoSelect: true })
}

async function refreshTree(options: { preserveSelection: boolean; allowAutoSelect: boolean }) {
  isLoadingTree.value = true

  try {
    const response = await window.sessionsApi.listTree()
    applyTreeResponse(response)

    if (options.preserveSelection && (selectedFilePath.value || selectedPreview.value || selectedMeta.value)) {
      return
    }

    if (!options.allowAutoSelect) {
      return
    }

    if (!selectedFilePath.value || !containsPath(tree.value, selectedFilePath.value)) {
      const firstFile = findFirstFile(tree.value)

      if (firstFile) {
        await openFile(firstFile.path)
      } else {
        clearSelection()
      }
    }
  } finally {
    isLoadingTree.value = false
  }
}

async function handlePickRoot() {
  await window.sessionsApi.pickRoot()
  await refreshTree({ preserveSelection: false, allowAutoSelect: true })
}

async function handleDeleteFile(payload: { path: string; label: string }) {
  if (deletingPath.value) {
    return
  }

  const confirmed = window.confirm(
    `确认删除这个本机会话文件吗？\n\n${maskDisplayText(payload.label)}\n${maskDisplayText(payload.path)}\n\n删除后无法恢复。`,
  )

  if (!confirmed) {
    return
  }

  deletingPath.value = payload.path

  try {
    await window.sessionsApi.deleteFile(payload.path)
    await refreshTree({
      preserveSelection: selectedFilePath.value !== payload.path,
      allowAutoSelect: selectedFilePath.value === payload.path,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除会话文件失败。'
    window.alert(message)
  } finally {
    deletingPath.value = null
  }
}

async function openFile(path: string) {
  currentOpenToken += 1
  const openToken = currentOpenToken
  isLoadingFile.value = true
  rawDetail.value = null
  rawError.value = ''
  pendingNewCount.value = 0
  loadedPages.clear()
  loadingPages.clear()

  try {
    const result = await window.sessionsApi.openFile(path)

    if (openToken !== currentOpenToken) {
      return
    }

    selectedFilePath.value = result.path
    selectedPreview.value = result.preview
    selectedMeta.value = result.meta
    totalCount.value = result.totalCount
    totalConversationCount.value = normalizeCountValue(result.conversationCount)
    items.value = Array.from({ length: result.totalCount }, () => null)
    mergeItems(result.initialStart, result.initialItems)
    rememberPages(result.initialStart, result.initialItems.length)

    await nextTick()

    timelineRef.value?.scrollToIndex(0)
  } finally {
    isLoadingFile.value = false
  }
}

function clearSelection() {
  closeConversationPreview()
  selectedFilePath.value = null
  selectedPreview.value = null
  selectedMeta.value = null
  totalCount.value = 0
  totalConversationCount.value = 0
  items.value = []
  rawDetail.value = null
  pendingNewCount.value = 0
}

function applyTreeResponse(response: TreeResponse) {
  tree.value = response.tree
  rootPath.value = response.rootPath
  rootAvailable.value = response.available
  lastUpdatedAt.value = response.lastUpdatedAt
}

function containsPath(nodes: TreeNode[], path: string): boolean {
  return nodes.some((node) => node.path === path || containsPath(node.children ?? [], path))
}

function findFirstFile(nodes: TreeNode[]): TreeNode | null {
  for (const node of nodes) {
    if (node.kind === 'file') {
      return node
    }

    const child = findFirstFile(node.children ?? [])

    if (child) {
      return child
    }
  }

  return null
}

function mergeItems(start: number, chunk: SessionItemSummary[]) {
  if (chunk.length === 0) {
    return
  }

  const next = items.value.slice()

  for (let offset = 0; offset < chunk.length; offset += 1) {
    next[start + offset] = chunk[offset]
  }

  items.value = next
}

function rememberPages(start: number, count: number) {
  if (count === 0) {
    return
  }

  const firstPage = Math.floor(start / ITEM_PAGE_SIZE)
  const lastPage = Math.floor((start + count - 1) / ITEM_PAGE_SIZE)

  for (let page = firstPage; page <= lastPage; page += 1) {
    loadedPages.add(page)
  }
}

function shouldDisplayTimelineItem(item: SessionItemSummary | null, actualIndex: number): boolean {
  if (!showConversationOnly.value || item === null) {
    return true
  }

  if (isRedundantUserMessageEvent(actualIndex, item)) {
    return false
  }

  if (item.bucket === 'user') {
    return true
  }

  return item.bucket === 'codex' && item.role !== 'agent_message'
}

function countDisplayedLoadedItems(entries: Array<SessionItemSummary | null>, baseIndex: number): number {
  let count = 0

  for (let offset = 0; offset < entries.length; offset += 1) {
    const entry = entries[offset]

    if (entry && shouldDisplayTimelineItem(entry, baseIndex + offset)) {
      count += 1
    }
  }

  return count
}

function isRedundantUserMessageEvent(actualIndex: number, item: SessionItemSummary): boolean {
  if (item.bucket !== 'user' || item.role !== 'user_message') {
    return false
  }

  const normalizedText = normalizeConversationText(item.textPreview)

  if (!normalizedText) {
    return false
  }

  for (let offset = -2; offset <= 2; offset += 1) {
    if (offset === 0) {
      continue
    }

    const candidate = items.value[actualIndex + offset]

    if (!candidate || candidate.bucket !== 'user' || candidate.role !== 'user') {
      continue
    }

    if (normalizeConversationText(candidate.textPreview) !== normalizedText) {
      continue
    }

    const timeDelta = getTimestampDeltaMs(item.timestamp, candidate.timestamp)

    if (timeDelta === null || timeDelta <= 5000) {
      return true
    }
  }

  return false
}

function normalizeConversationText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function getTimestampDeltaMs(left: string | null, right: string | null): number | null {
  if (!left || !right) {
    return null
  }

  const leftValue = Date.parse(left)
  const rightValue = Date.parse(right)

  if (Number.isNaN(leftValue) || Number.isNaN(rightValue)) {
    return null
  }

  return Math.abs(leftValue - rightValue)
}

function isPageLoaded(page: number): boolean {
  const start = page * ITEM_PAGE_SIZE
  const end = Math.min(items.value.length, start + ITEM_PAGE_SIZE)

  if (end <= start) {
    return true
  }

  for (let index = start; index < end; index += 1) {
    if (items.value[index] === null) {
      return false
    }
  }

  return true
}

function getLoadedPrefixCount(): number {
  let index = 0

  while (index < items.value.length && items.value[index] !== null) {
    index += 1
  }

  return index
}

function getLoadedSuffixStart(): number {
  let index = items.value.length

  while (index > 0 && items.value[index - 1] !== null) {
    index -= 1
  }

  return index
}

function getLoadedSuffixCount(): number {
  return totalCount.value - getLoadedSuffixStart()
}

function expandRangeForProgress(payload: { start: number; end: number }): { start: number; end: number } {
  if (isDescending.value) {
    const suffixStart = getLoadedSuffixStart()

    if (payload.start < suffixStart) {
      return {
        start: payload.start,
        end: suffixStart,
      }
    }

    return payload
  }

  const prefixCount = getLoadedPrefixCount()

  if (payload.end > prefixCount) {
    return {
      start: prefixCount,
      end: payload.end,
    }
  }

  return payload
}

async function ensureRangeLoaded(payload: { start: number; end: number }) {
  if (!selectedFilePath.value || totalCount.value === 0) {
    return
  }

  const targetPath = selectedFilePath.value
  const normalized = expandRangeForProgress(payload)
  const firstPage = Math.floor(normalized.start / ITEM_PAGE_SIZE)
  const lastPage = Math.floor(Math.max(normalized.end - 1, 0) / ITEM_PAGE_SIZE)

  for (let page = firstPage; page <= lastPage; page += 1) {
    if (loadingPages.has(page) || isPageLoaded(page)) {
      continue
    }

    loadingPages.add(page)

    try {
      const start = page * ITEM_PAGE_SIZE
      const chunk = await window.sessionsApi.getItems({
        path: targetPath,
        start,
        limit: ITEM_PAGE_SIZE,
      })

      if (selectedFilePath.value !== targetPath) {
        return
      }

      mergeItems(start, chunk)
      rememberPages(start, chunk.length)
    } finally {
      loadingPages.delete(page)
    }
  }
}

function mapDisplayIndexToActual(index: number): number {
  return timelineActualIndexes.value[index] ?? -1
}

function mapDisplayRangeToActual(payload: { start: number; end: number }): { start: number; end: number } {
  const start = Math.max(0, payload.start)
  const end = Math.min(timelineActualIndexes.value.length, Math.max(payload.end, start))

  if (end <= start) {
    return { start: 0, end: 0 }
  }

  const slice = timelineActualIndexes.value.slice(start, end)

  if (slice.length === 0) {
    return { start: 0, end: 0 }
  }

  let actualStart = slice[0]
  let actualEnd = slice[0] + 1

  for (let index = 1; index < slice.length; index += 1) {
    const actualIndex = slice[index]
    actualStart = Math.min(actualStart, actualIndex)
    actualEnd = Math.max(actualEnd, actualIndex + 1)
  }

  return { start: actualStart, end: actualEnd }
}

async function handleRequestRange(payload: { start: number; end: number }) {
  const actualRange = mapDisplayRangeToActual(payload)

  if (actualRange.end <= actualRange.start) {
    return
  }

  await ensureRangeLoaded(actualRange)
}

async function openRawItem(displayIndex: number) {
  if (!selectedFilePath.value) {
    return
  }

  const targetPath = selectedFilePath.value
  const index = mapDisplayIndexToActual(displayIndex)

  if (index < 0 || index >= totalCount.value) {
    return
  }

  rawLoading.value = true
  rawError.value = ''

  try {
    const detail = await window.sessionsApi.getRawItem({
      path: targetPath,
      index,
    })

    if (selectedFilePath.value !== targetPath) {
      return
    }

    rawDetail.value = detail
  } catch (error) {
    rawError.value = error instanceof Error ? error.message : '读取原始 JSON 失败。'
  } finally {
    rawLoading.value = false
  }
}

async function toggleTimelineOrder(nextDescending: boolean) {
  if (isDescending.value === nextDescending) {
    return
  }

  isDescending.value = nextDescending
  await nextTick()
  timelineRef.value?.scrollToIndex(0)
}

async function openConversationPreview() {
  if (!selectedFilePath.value || !showConversationOnly.value) {
    return
  }

  const targetPath = selectedFilePath.value
  conversationPreviewOpen.value = true
  conversationPreviewLoading.value = true
  conversationPreviewError.value = ''
  conversationPreviewItems.value = []

  try {
    const result = await window.sessionsApi.getConversationItems(targetPath)

    if (selectedFilePath.value !== targetPath) {
      return
    }

    conversationPreviewItems.value = await Promise.all(
      result.items.map(async (item) => ({
        ...item,
        html: await renderMarkdownToHtml(item.markdown),
      })),
    )
  } catch (error) {
    if (selectedFilePath.value !== targetPath) {
      return
    }

    conversationPreviewError.value = error instanceof Error ? error.message : '加载完整对话失败。'
  } finally {
    if (selectedFilePath.value === targetPath) {
      conversationPreviewLoading.value = false
    }
  }
}

function closeConversationPreview() {
  conversationPreviewOpen.value = false
  conversationPreviewLoading.value = false
  conversationPreviewError.value = ''
  conversationPreviewItems.value = []
}

function closeRawPanel() {
  rawDetail.value = null
  rawError.value = ''
}

async function handleFilePatched(payload: FilePatchedPayload) {
  if (!selectedFilePath.value || payload.path !== selectedFilePath.value) {
    return
  }

  if (payload.mode === 'reset') {
    try {
      await openFile(payload.path)
    } catch {
      await refreshTree({ preserveSelection: false, allowAutoSelect: true })
    }
    return
  }

  if (!payload.items || payload.startIndex === undefined) {
    return
  }

  if (payload.totalCount > items.value.length) {
    items.value = [
      ...items.value,
      ...Array.from({ length: payload.totalCount - items.value.length }, () => null),
    ]
  }

  totalCount.value = payload.totalCount
  totalConversationCount.value = normalizeCountValue(payload.conversationCount) ?? totalConversationCount.value
  mergeItems(payload.startIndex, payload.items)
  rememberPages(payload.startIndex, payload.items.length)
  let visiblePatchedCount = 0

  for (let offset = 0; offset < payload.items.length; offset += 1) {
    const actualIndex = payload.startIndex + offset
    const item = items.value[actualIndex]

    if (item && shouldDisplayTimelineItem(item, actualIndex)) {
      visiblePatchedCount += 1
    }
  }

  if (isAtLatestEdge.value) {
    pendingNewCount.value = 0

    if (visiblePatchedCount === 0) {
      return
    }

    await nextTick()
    if (isDescending.value) {
      timelineRef.value?.scrollToIndex(0)
    } else {
      timelineRef.value?.scrollToBottom()
    }
    return
  }

  if (visiblePatchedCount > 0) {
    pendingNewCount.value += visiblePatchedCount
  }
}

async function jumpToLatest() {
  pendingNewCount.value = 0

  if (!selectedFilePath.value || totalCount.value === 0) {
    return
  }

  const start = Math.max(0, totalCount.value - ITEM_PAGE_SIZE)
  await ensureRangeLoaded({ start, end: totalCount.value })
  await nextTick()

  if (isDescending.value) {
    timelineRef.value?.scrollToIndex(0)
    return
  }

  timelineRef.value?.scrollToBottom()
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '暂无'
  }

  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatAuthMode(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  switch (value.trim().toLowerCase()) {
    case 'apikey':
      return 'API 密钥'
    case 'chatgpt':
      return 'ChatGPT 登录'
    default:
      return value
  }
}

function formatOriginator(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  switch (value.trim().toLowerCase()) {
    case 'codex desktop':
    case 'codex_desktop':
      return '桌面端'
    case 'codex_exec':
      return '执行器'
    case 'codex cli':
    case 'codex_cli':
      return 'CLI'
    default:
      return value
  }
}

function formatSource(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  switch (value.trim().toLowerCase()) {
    case 'vscode':
      return 'VS Code'
    case 'exec':
      return '执行任务'
    case 'cli':
      return 'CLI'
    default:
      return value
  }
}

async function renderMarkdownToHtml(markdown: string): Promise<string> {
  const rendered = await marked.parse(maskDisplayText(markdown), {
    breaks: true,
    gfm: true,
  })

  return DOMPurify.sanitize(rendered)
}

function readBooleanPreference(key: string, fallback: boolean): boolean {
  try {
    const rawValue = window.localStorage.getItem(key)

    if (rawValue === null) {
      return fallback
    }

    return rawValue !== '0'
  } catch {
    return fallback
  }
}

function writeBooleanPreference(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0')
  } catch {
    // Ignore storage write failures and keep the in-memory preference.
  }
}

function normalizeCountValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value
  }

  return null
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar-panel">
        <div class="panel-heading">
          <p>Codex 会话</p>
          <button class="ghost-button" type="button" @click="handlePickRoot">
            切换目录
          </button>
        </div>

        <div class="root-chip">
          <span>{{ rootAvailable ? '已连接' : '目录不可用' }}</span>
          <code>{{ maskDisplayText(rootPath) }}</code>
        </div>

        <div class="sidebar-status">
          <span>{{ isLoadingTree ? '正在刷新目录...' : '目录树已同步' }}</span>
          <span v-if="lastUpdatedAt">更新于 {{ formatDate(lastUpdatedAt) }}</span>
        </div>
      </div>

      <div class="sidebar-tree">
        <div v-if="fatalError" class="sidebar-empty sidebar-empty--danger">
          {{ fatalError }}
        </div>

        <div v-else-if="!rootAvailable" class="sidebar-empty">
          当前根目录不存在，请点击“切换目录”选择新的会话目录。
        </div>

        <div v-else-if="tree.length === 0" class="sidebar-empty">
          目录里还没有 `.jsonl` 会话文件。
        </div>

        <TreeNodeItem
          v-for="node in tree"
          v-else
          :key="node.id"
          :deleting-path="deletingPath"
          :node="node"
          :selected-path="selectedFilePath"
          @delete="handleDeleteFile"
          @select="openFile($event)"
        />
      </div>
    </aside>

    <main class="workspace">
      <section class="workspace-header">
        <div v-if="hasSelection" class="session-header-card">
          <div>
            <p class="eyebrow">当前会话</p>
            <h1>{{ selectedPreview ? maskDisplayText(selectedPreview.displayTitle) : '' }}</h1>
            <div class="session-stats">
              <span v-if="selectedPreview?.subtitle">{{ maskDisplayText(selectedPreview.subtitle) }}</span>
              <span>{{ displayLoadedProgressCount }}/{{ displayTotalCount }}条记录已加载</span>
              <span v-if="displayLoadedCount > displayLoadedProgressCount">
                {{ displayLoadedCount }} 条已缓存
              </span>
            </div>
            <div v-if="selectedMeta?.timestamp || lastConversationAt" class="session-time-meta">
              <span v-if="selectedMeta?.timestamp">开始于 {{ formatDate(selectedMeta.timestamp) }}</span>
              <span v-if="lastConversationAt">最后一次对话 {{ formatDate(lastConversationAt) }}</span>
              <span>归属 {{ ownershipDisplayLabel }}</span>
            </div>
            <div v-if="selectedPreview?.rawName" class="session-raw-name" :title="selectedPreview.rawName">
              {{ maskDisplayText(selectedPreview.rawName) }}
            </div>
          </div>

          <dl class="meta-grid">
            <div>
              <dt>工作目录</dt>
              <dd>{{ maskDisplayValue(selectedMeta?.cwd) }}</dd>
            </div>
            <div>
              <dt>发起端</dt>
              <dd>{{ maskDisplayValue(selectedMeta?.originator) }}</dd>
            </div>
            <div>
              <dt>模型提供方</dt>
              <dd>{{ maskDisplayValue(selectedMeta?.modelProvider) }}</dd>
            </div>
            <div>
              <dt>来源</dt>
              <dd>{{ maskDisplayValue(selectedMeta?.source) }}</dd>
            </div>
          </dl>
        </div>

        <div v-else class="session-header-empty">
          <p>从左侧选择一个 `.jsonl` 文件开始查看。</p>
        </div>
      </section>

      <section class="workspace-body">
        <div v-if="!hasSelection" class="timeline-empty">
          <p>目录树准备好后，右侧会展示当前会话的消息流和原始 JSON。</p>
        </div>

        <template v-else>
          <div class="timeline-toolbar">
            <span>{{ isLoadingFile ? '正在加载会话...' : '滚动会按需加载更多历史记录' }}</span>
            <div class="timeline-toolbar-actions">
              <label class="toolbar-checkbox">
                <input v-model="showConversationOnly" type="checkbox">
                <span>只显示对话</span>
              </label>

              <button
                v-if="canPreviewConversation"
                class="ghost-button"
                type="button"
                @click="openConversationPreview"
              >
                预览完整对话
              </button>

              <button
                v-if="isDescending"
                class="ghost-button"
                type="button"
                @click="toggleTimelineOrder(false)"
              >
                切到顺序
              </button>
              <button
                v-else
                class="ghost-button"
                type="button"
                @click="toggleTimelineOrder(true)"
              >
                切到倒序
              </button>

              <button
                v-if="pendingNewCount > 0"
                class="primary-button"
                type="button"
                @click="jumpToLatest"
              >
                有 {{ pendingNewCount }} 条新记录
              </button>
            </div>
          </div>

          <SessionVirtualList
            ref="timelineRef"
            :items="timelineItems"
            @open-raw="openRawItem"
            @request-range="handleRequestRange"
            @scroll-state="isAtLatestEdge = isDescending ? $event.atTop : $event.atBottom"
          />
        </template>
      </section>
    </main>

    <aside class="raw-panel" :class="{ 'raw-panel--open': rawDetail || rawLoading || rawError }">
      <div class="raw-panel-header">
        <div>
          <p class="eyebrow">原始 JSON</p>
          <strong v-if="rawDetail">#{{ rawDetail.index }}</strong>
          <strong v-else>按需查看</strong>
        </div>

        <button class="ghost-button" type="button" @click="closeRawPanel">
          关闭
        </button>
      </div>

      <div v-if="rawLoading" class="raw-panel-body raw-panel-body--empty">
        正在读取原始 JSON...
      </div>

      <div v-else-if="rawError" class="raw-panel-body raw-panel-body--empty raw-panel-body--error">
        {{ rawError }}
      </div>

      <div v-else-if="rawDetail" class="raw-panel-body">
        <p v-if="rawDetail.parseError" class="raw-warning">
          {{ rawDetail.parseError }}
        </p>
        <pre>{{ maskDisplayText(rawDetail.formattedJson) }}</pre>
      </div>

      <div v-else class="raw-panel-body raw-panel-body--empty">
        点击任意记录卡片，在这里查看格式化后的 JSON。
      </div>
    </aside>

    <section v-if="conversationPreviewOpen" class="conversation-preview-overlay">
      <div class="conversation-preview-header">
        <div>
          <p class="eyebrow">完整对话预览</p>
          <h2>{{ selectedPreview ? maskDisplayText(selectedPreview.displayTitle) : '当前会话' }}</h2>
        </div>

        <button class="ghost-button" type="button" @click="closeConversationPreview">
          关闭
        </button>
      </div>

      <div v-if="conversationPreviewLoading" class="conversation-preview-body conversation-preview-body--empty">
        正在渲染完整对话...
      </div>

      <div
        v-else-if="conversationPreviewError"
        class="conversation-preview-body conversation-preview-body--empty conversation-preview-body--error"
      >
        {{ conversationPreviewError }}
      </div>

      <div v-else-if="conversationPreviewItems.length === 0" class="conversation-preview-body conversation-preview-body--empty">
        当前会话没有可预览的完整对话内容。
      </div>

      <div v-else class="conversation-preview-body">
        <div class="conversation-preview-stack">
          <article
            v-for="item in conversationPreviewItems"
            :key="item.index"
            class="conversation-preview-row"
            :class="`conversation-preview-row--${item.bucket}`"
          >
            <div class="conversation-preview-bubble" :class="`conversation-preview-bubble--${item.bucket}`">
              <div class="conversation-preview-meta">
                <span class="conversation-preview-speaker">
                  <span class="conversation-preview-avatar" :style="{ backgroundColor: item.avatarColor }">
                    {{ item.speakerLabel.slice(0, 2).toUpperCase() }}
                  </span>
                  <strong>{{ item.speakerLabel }}</strong>
                </span>
                <time>{{ formatDate(item.timestamp) }}</time>
              </div>

              <div class="conversation-preview-markdown" v-html="item.html" />
            </div>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>
