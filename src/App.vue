<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import SessionVirtualList from './components/SessionVirtualList.vue'
import TreeNodeItem from './components/TreeNodeItem.vue'
import {
  ITEM_PAGE_SIZE,
  type FilePatchedPayload,
  type RawItemResult,
  type SessionItemSummary,
  type SessionMetaSummary,
  type SessionPreview,
  type TreeNode,
  type TreeResponse,
} from './shared/sessions'

const timelineRef = ref<InstanceType<typeof SessionVirtualList> | null>(null)
const tree = ref<TreeNode[]>([])
const rootPath = ref('')
const rootAvailable = ref(false)
const lastUpdatedAt = ref<string | null>(null)
const selectedFilePath = ref<string | null>(null)
const selectedPreview = ref<SessionPreview | null>(null)
const selectedMeta = ref<SessionMetaSummary | null>(null)
const totalCount = ref(0)
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

const loadedPages = new Set<number>()
const loadingPages = new Set<number>()
let currentOpenToken = 0
let stopTreeChanged: (() => void) | null = null
let stopFilePatched: (() => void) | null = null

const hasSelection = computed(() => Boolean(selectedFilePath.value))
const loadedCount = computed(() => items.value.filter(Boolean).length)
const timelineItems = computed(() =>
  isDescending.value ? items.value.slice().reverse() : items.value,
)

onMounted(() => {
  if (!window.sessionsApi) {
    fatalError.value = '桌面应用预加载桥接不可用，请通过应用入口启动。'
    return
  }

  stopTreeChanged = window.sessionsApi.onTreeChanged(() => {
    void refreshTree(true)
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
  await refreshTree(false)
}

async function refreshTree(preserveSelection: boolean) {
  isLoadingTree.value = true

  try {
    const response = await window.sessionsApi.listTree()
    applyTreeResponse(response)

    if (!preserveSelection || !selectedFilePath.value || !containsPath(tree.value, selectedFilePath.value)) {
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
  await refreshTree(false)
}

async function handleDeleteFile(payload: { path: string; label: string }) {
  if (deletingPath.value) {
    return
  }

  const confirmed = window.confirm(
    `确认删除这个本机会话文件吗？\n\n${payload.label}\n${payload.path}\n\n删除后无法恢复。`,
  )

  if (!confirmed) {
    return
  }

  deletingPath.value = payload.path

  try {
    await window.sessionsApi.deleteFile(payload.path)
    await refreshTree(selectedFilePath.value !== payload.path)
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
  selectedFilePath.value = null
  selectedPreview.value = null
  selectedMeta.value = null
  totalCount.value = 0
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

async function ensureRangeLoaded(payload: { start: number; end: number }) {
  if (!selectedFilePath.value || totalCount.value === 0) {
    return
  }

  const targetPath = selectedFilePath.value
  const firstPage = Math.floor(payload.start / ITEM_PAGE_SIZE)
  const lastPage = Math.floor(Math.max(payload.end - 1, 0) / ITEM_PAGE_SIZE)

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
  if (!isDescending.value) {
    return index
  }

  return totalCount.value - 1 - index
}

function mapDisplayRangeToActual(payload: { start: number; end: number }): { start: number; end: number } {
  if (!isDescending.value) {
    return payload
  }

  return {
    start: Math.max(0, totalCount.value - payload.end),
    end: Math.max(0, totalCount.value - payload.start),
  }
}

async function handleRequestRange(payload: { start: number; end: number }) {
  await ensureRangeLoaded(mapDisplayRangeToActual(payload))
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
      await refreshTree(true)
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
  mergeItems(payload.startIndex, payload.items)
  rememberPages(payload.startIndex, payload.items.length)

  if (isAtLatestEdge.value) {
    pendingNewCount.value = 0
    await nextTick()
    if (isDescending.value) {
      timelineRef.value?.scrollToIndex(0)
    } else {
      timelineRef.value?.scrollToBottom()
    }
    return
  }

  pendingNewCount.value += payload.items.length
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
          <code>{{ rootPath }}</code>
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
            <h1>{{ selectedPreview?.displayTitle }}</h1>
            <div class="session-stats">
              <span v-if="selectedPreview?.subtitle">{{ selectedPreview.subtitle }}</span>
              <span>{{ totalCount }} 条记录</span>
              <span>{{ loadedCount }} 条已加载到前端</span>
              <span v-if="selectedMeta?.timestamp">开始于 {{ formatDate(selectedMeta.timestamp) }}</span>
            </div>
            <div v-if="selectedPreview?.rawName" class="session-raw-name" :title="selectedPreview.rawName">
              {{ selectedPreview.rawName }}
            </div>
          </div>

          <dl class="meta-grid">
            <div>
              <dt>工作目录</dt>
              <dd>{{ selectedMeta?.cwd ?? '暂无' }}</dd>
            </div>
            <div>
              <dt>发起端</dt>
              <dd>{{ selectedMeta?.originator ?? '暂无' }}</dd>
            </div>
            <div>
              <dt>模型提供方</dt>
              <dd>{{ selectedMeta?.modelProvider ?? '暂无' }}</dd>
            </div>
            <div>
              <dt>来源</dt>
              <dd>{{ selectedMeta?.source ?? '暂无' }}</dd>
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
        <pre>{{ rawDetail.formattedJson }}</pre>
      </div>

      <div v-else class="raw-panel-body raw-panel-body--empty">
        点击任意记录卡片，在这里查看格式化后的 JSON。
      </div>
    </aside>
  </div>
</template>
