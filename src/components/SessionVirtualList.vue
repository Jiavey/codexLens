<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { AppLocale } from '../shared/i18n'
import { getIntlLocale, getMessages } from '../shared/i18n'
import type { SessionItemSummary } from '../shared/sessions'
import { maskDisplayText } from '../utils/display'

const props = withDefaults(
  defineProps<{
    items: Array<SessionItemSummary | null>
    locale: AppLocale
    itemHeight?: number
  }>(),
  {
    itemHeight: 196,
  },
)

const emit = defineEmits<{
  requestRange: [payload: { start: number; end: number }]
  openRaw: [index: number]
  scrollState: [payload: { atTop: boolean; atBottom: boolean }]
}>()

const scrollerRef = ref<HTMLElement | null>(null)
const viewportHeight = ref(640)
const scrollTop = ref(0)
let resizeObserver: ResizeObserver | null = null

const totalHeight = computed(() => props.items.length * props.itemHeight)
const startIndex = computed(() => Math.max(0, Math.floor(scrollTop.value / props.itemHeight) - 5))
const endIndex = computed(() => {
  const visibleCount = Math.ceil(viewportHeight.value / props.itemHeight) + 10
  return Math.min(props.items.length, startIndex.value + visibleCount)
})
const offsetY = computed(() => startIndex.value * props.itemHeight)
const visibleRows = computed(() =>
  props.items.slice(startIndex.value, endIndex.value).map((item, offset) => ({
    index: startIndex.value + offset,
    item,
  })),
)

watch(
  () => [startIndex.value, endIndex.value, props.items.length] as const,
  ([start, end]) => {
    emit('requestRange', { start, end })
  },
  { immediate: true },
)

watch(
  totalHeight,
  () => {
    nextTick(() => emitScrollState())
  },
  { flush: 'post' },
)

onMounted(() => {
  if (!scrollerRef.value) {
    return
  }

  viewportHeight.value = scrollerRef.value.clientHeight
  resizeObserver = new ResizeObserver(([entry]) => {
    viewportHeight.value = entry.contentRect.height
    emitScrollState()
  })
  resizeObserver.observe(scrollerRef.value)
  emitScrollState()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

function onScroll(event: Event) {
  scrollTop.value = (event.target as HTMLElement).scrollTop
  emitScrollState()
}

function emitScrollState() {
  if (!scrollerRef.value) {
    return
  }

  const atTop = scrollTop.value <= props.itemHeight * 0.5
  const atBottom =
    scrollTop.value + scrollerRef.value.clientHeight >= totalHeight.value - props.itemHeight
  emit('scrollState', { atTop, atBottom })
}

function scrollToBottom() {
  if (!scrollerRef.value) {
    return
  }

  scrollerRef.value.scrollTop = Math.max(0, totalHeight.value - scrollerRef.value.clientHeight)
  scrollTop.value = scrollerRef.value.scrollTop
  emitScrollState()
}

function scrollToIndex(index: number) {
  if (!scrollerRef.value) {
    return
  }

  scrollerRef.value.scrollTop = Math.max(0, index * props.itemHeight)
  scrollTop.value = scrollerRef.value.scrollTop
  emitScrollState()
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return getMessages(props.locale).common.noTime
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return getMessages(props.locale).common.noTime
  }

  return date.toLocaleString(getIntlLocale(props.locale), {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function initials(label: string): string {
  return label
    .split(/[\s/]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

defineExpose({
  scrollToBottom,
  scrollToIndex,
})
</script>

<template>
  <div ref="scrollerRef" class="timeline-scroller" @scroll="onScroll">
    <div class="timeline-spacer" :style="{ height: `${totalHeight}px` }">
      <div class="timeline-stack" :style="{ transform: `translateY(${offsetY}px)` }">
        <article
          v-for="row in visibleRows"
          :key="row.index"
          class="timeline-row"
          :style="{ height: `${itemHeight}px` }"
        >
          <button
            v-if="row.item"
            class="session-card"
            :class="`session-card--${row.item.bucket}`"
            type="button"
            @click="emit('openRaw', row.index)"
          >
            <span class="session-avatar" :style="{ backgroundColor: row.item.avatarColor }">
              {{ initials(row.item.speakerLabel) }}
            </span>

            <div class="session-copy">
              <div class="session-copy-top">
                <div class="session-heading">
                  <strong class="session-speaker">{{ row.item.speakerLabel }}</strong>
                  <span class="session-title" :title="maskDisplayText(row.item.title)">{{ maskDisplayText(row.item.title) }}</span>
                </div>

                <time>{{ formatTimestamp(row.item.timestamp) }}</time>
              </div>

              <div class="session-role">{{ row.item.role }}</div>
              <p>{{ maskDisplayText(row.item.textPreview) }}</p>
            </div>
          </button>

          <div v-else class="session-card session-card--placeholder">
            <span class="session-avatar session-avatar--placeholder" />
            <div class="session-copy session-copy--placeholder">
              <span />
              <span />
              <span />
            </div>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>
