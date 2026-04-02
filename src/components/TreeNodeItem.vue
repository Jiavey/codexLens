<script setup lang="ts">
import { computed, ref } from 'vue'

import type { TreeNode } from '../shared/sessions'

defineOptions({
  name: 'TreeNodeItem',
})

const props = defineProps<{
  node: TreeNode
  depth?: number
  deletingPath: string | null
  selectedPath: string | null
}>()

const emit = defineEmits<{
  select: [path: string]
  delete: [payload: { path: string; label: string }]
}>()

const expanded = ref((props.depth ?? 0) < 2)

const isDirectory = computed(() => props.node.kind === 'directory')
const isDeleting = computed(() => !isDirectory.value && props.deletingPath === props.node.path)
const rowClass = computed(() => ({
  'tree-row--active': props.selectedPath === props.node.path,
  'tree-row--directory': isDirectory.value,
}))

function toggleOrSelect() {
  if (isDirectory.value) {
    expanded.value = !expanded.value
    return
  }

  emit('select', props.node.path)
}

function emitFromChild(path: string) {
  emit('select', path)
}

function emitDeleteFromChild(payload: { path: string; label: string }) {
  emit('delete', payload)
}

function requestDelete(): void {
  if (isDirectory.value) {
    return
  }

  emit('delete', {
    path: props.node.path,
    label: props.node.preview?.displayTitle ?? props.node.name,
  })
}

function rowTitle(): string {
  if (isDirectory.value) {
    return props.node.name
  }

  const rawName = props.node.preview?.rawName ?? props.node.name
  return `${rawName}\n${props.node.path}`
}

function formatSize(size?: number): string {
  if (!size) {
    return ''
  }

  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

</script>

<template>
  <div class="tree-node">
    <div
      class="tree-row-shell"
      :class="rowClass"
      :style="{ paddingLeft: `${((depth ?? 0) * 16) + 14}px` }"
    >
      <button
        class="tree-row"
        :title="rowTitle()"
        type="button"
        @click="toggleOrSelect"
      >
      <span class="tree-chevron">
        {{ isDirectory ? (expanded ? '▾' : '▸') : '·' }}
      </span>

      <span class="tree-content">
        <span class="tree-name">
          {{ isDirectory ? node.name : (node.preview?.displayTitle ?? node.name) }}
        </span>
        <span v-if="!isDirectory && node.preview?.subtitle" class="tree-subtitle">
          {{ node.preview.subtitle }}
        </span>
      </span>

      <span v-if="!isDirectory" class="tree-meta">
        <span>{{ formatSize(node.size) }}</span>
      </span>
      </button>

      <button
        v-if="!isDirectory"
        class="tree-delete-button"
        :disabled="isDeleting"
        :title="isDeleting ? '正在删除...' : '删除本地会话文件'"
        type="button"
        @click.stop="requestDelete"
      >
        {{ isDeleting ? '...' : '删' }}
      </button>
    </div>

    <div v-if="isDirectory && expanded && node.children?.length" class="tree-children">
      <TreeNodeItem
        v-for="child in node.children"
        :key="child.id"
        :depth="(depth ?? 0) + 1"
        :deleting-path="deletingPath"
        :node="child"
        :selected-path="selectedPath"
        @delete="emitDeleteFromChild"
        @select="emitFromChild"
      />
    </div>
  </div>
</template>
