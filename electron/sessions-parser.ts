import { basename } from 'node:path'
import { createReadStream, promises as fs } from 'node:fs'
import { createInterface } from 'node:readline'

import {
  type SessionItemSummary,
  type SessionBucket,
  type SessionMetaSummary,
  type SessionPreview,
} from '../src/shared/sessions.js'
import {
  type AppLocale,
  DEFAULT_APP_LOCALE,
  getBucketUi,
  getIntlLocale,
  getMessages,
} from '../src/shared/i18n.js'

export interface ParsedFileContext {
  path: string
  name: string
  preview: SessionPreview
  items: SessionItemSummary[]
  meta: SessionMetaSummary | null
  fileSize: number
  mtime: number
}

interface ParsedLine {
  summary: SessionItemSummary
  meta: SessionMetaSummary | null
}

type JsonObject = Record<string, unknown>

interface StreamJsonlOptions {
  emitTrailingPartial?: boolean
}

interface StreamJsonlResult {
  nextOffset: number
}

interface PreviewState {
  meta: SessionMetaSummary | null
  firstTimestamp: string | null
  firstEffectiveUser: string | null
  firstAssistant: string | null
}

export async function parseSessionFile(
  filePath: string,
  locale: AppLocale = DEFAULT_APP_LOCALE,
): Promise<ParsedFileContext> {
  const items: SessionItemSummary[] = []
  const previewState: PreviewState = createPreviewState()
  const streamResult = await streamJsonl(filePath, 0, (rawLine, rawByteStart, rawByteEnd) => {
    const parsedLine = parseLine(rawLine, rawByteStart, rawByteEnd, items.length, locale)
    items.push(parsedLine.summary)

    collectPreviewFromRawLine(rawLine, previewState, locale, parsedLine.meta)
  })
  const stat = await fs.stat(filePath)

  return {
    path: filePath,
    name: basename(filePath),
    preview: buildSessionPreview(basename(filePath), previewState, locale),
    items,
    meta: previewState.meta,
    fileSize: streamResult.nextOffset,
    mtime: stat.mtimeMs,
  }
}

export async function readSessionPreview(
  filePath: string,
  locale: AppLocale = DEFAULT_APP_LOCALE,
): Promise<SessionPreview> {
  const stream = createReadStream(filePath, { encoding: 'utf8' })
  const reader = createInterface({
    input: stream,
    crlfDelay: Infinity,
  })
  const previewState = createPreviewState()
  let lineCount = 0

  try {
    for await (const rawLine of reader) {
      lineCount += 1
      collectPreviewFromRawLine(rawLine, previewState, locale)

      if (hasEnoughPreviewData(previewState) || lineCount >= 80) {
        reader.close()
        stream.destroy()
        break
      }
    }
  } finally {
    reader.close()
    stream.destroy()
  }

  return buildSessionPreview(basename(filePath), previewState, locale)
}

export async function parseSessionFileTail(
  filePath: string,
  fromByte: number,
  startIndex: number,
  locale: AppLocale = DEFAULT_APP_LOCALE,
): Promise<{ items: SessionItemSummary[]; fileSize: number; mtime: number }> {
  const items: SessionItemSummary[] = []
  const streamResult = await streamJsonl(
    filePath,
    fromByte,
    (rawLine, rawByteStart, rawByteEnd) => {
      const parsedLine = parseLine(rawLine, rawByteStart, rawByteEnd, startIndex + items.length, locale)
      items.push(parsedLine.summary)
    },
    { emitTrailingPartial: false },
  )
  const stat = await fs.stat(filePath)

  return {
    items,
    fileSize: streamResult.nextOffset,
    mtime: stat.mtimeMs,
  }
}

export async function readRawRange(filePath: string, start: number, end: number): Promise<string> {
  if (end <= start) {
    return ''
  }

  const stream = createReadStream(filePath, {
    start,
    end: end - 1,
  })

  const chunks: Buffer[] = []

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks).toString('utf8')
}

export function extractConversationMarkdown(
  rawLine: string,
  locale: AppLocale = DEFAULT_APP_LOCALE,
): string | null {
  const messages = getMessages(locale)

  if (!rawLine.trim()) {
    return null
  }

  try {
    const record = JSON.parse(rawLine) as JsonObject
    const type = readString(record.type)
    const payload = readObject(record.payload)
    const payloadType = payload ? readString(payload.type) : null

    if (type === 'response_item' && payloadType === 'message' && payload) {
      const responseRole = readString(payload.role)

      if (responseRole === 'user' || responseRole === 'assistant') {
        return extractContentMarkdown(payload, locale)
      }
    }

    if (type === 'event_msg' && payload && payloadType === 'user_message') {
      return normalizeMarkdownText(readString(payload.message) ?? messages.parser.userMessageEvent)
    }
  } catch {
    return null
  }

  return null
}

async function streamJsonl(
  filePath: string,
  startByte: number,
  onLine: (rawLine: string, rawByteStart: number, rawByteEnd: number) => void,
  options: StreamJsonlOptions = {},
): Promise<StreamJsonlResult> {
  const stream = createReadStream(filePath, {
    start: startByte,
  })

  let pending = Buffer.alloc(0)
  let cursor = startByte
  let nextOffset = startByte

  for await (const chunk of stream) {
    const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    const buffer = pending.length > 0 ? Buffer.concat([pending, chunkBuffer]) : chunkBuffer
    const chunkStart = cursor - pending.length
    let searchStart = 0

    for (;;) {
      const newlineIndex = buffer.indexOf(0x0a, searchStart)

      if (newlineIndex === -1) {
        break
      }

      const lineBuffer = buffer.subarray(searchStart, newlineIndex)
      const rawByteStart = chunkStart + searchStart
      const rawByteEnd = normalizeRawLineEnd(lineBuffer, chunkStart + newlineIndex)

      onLine(lineBuffer.toString('utf8').replace(/\r$/, ''), rawByteStart, rawByteEnd)
      nextOffset = chunkStart + newlineIndex + 1
      searchStart = newlineIndex + 1
    }

    pending = Buffer.from(buffer.subarray(searchStart))
    cursor += chunkBuffer.length
  }

  if (pending.length > 0 && options.emitTrailingPartial !== false) {
    const rawByteStart = cursor - pending.length
    const rawByteEnd = normalizeRawLineEnd(pending, cursor)
    onLine(pending.toString('utf8').replace(/\r$/, ''), rawByteStart, rawByteEnd)
    nextOffset = cursor
  }

  return { nextOffset }
}

function normalizeRawLineEnd(buffer: Buffer, fallbackEnd: number): number {
  return buffer.at(-1) === 0x0d ? fallbackEnd - 1 : fallbackEnd
}

function parseLine(
  rawLine: string,
  rawByteStart: number,
  rawByteEnd: number,
  index: number,
  locale: AppLocale,
): ParsedLine {
  const messages = getMessages(locale)

  if (!rawLine.trim()) {
    return {
      summary: createSummary({
        index,
        bucket: 'system',
        role: 'blank_line',
        timestamp: null,
        title: messages.parser.blankLine,
        textPreview: messages.parser.emptyJsonlLine,
        rawByteStart,
        rawByteEnd,
      }, locale),
      meta: null,
    }
  }

  try {
    const parsed = JSON.parse(rawLine) as JsonObject
    const meta = extractMeta(parsed)

    return {
      summary: summarizeParsedLine(parsed, rawByteStart, rawByteEnd, index, locale),
      meta,
    }
  } catch {
    return {
      summary: createSummary({
        index,
        bucket: 'system',
        role: 'parse_error',
        timestamp: null,
        title: messages.parser.invalidJson,
        textPreview: truncate(rawLine, 240),
        rawByteStart,
        rawByteEnd,
      }, locale),
      meta: null,
    }
  }
}

function createPreviewState(): PreviewState {
  return {
    meta: null,
    firstTimestamp: null,
    firstEffectiveUser: null,
    firstAssistant: null,
  }
}

function collectPreviewFromRawLine(
  rawLine: string,
  previewState: PreviewState,
  locale: AppLocale,
  parsedMeta?: SessionMetaSummary | null,
): void {
  if (!rawLine.trim()) {
    return
  }

  try {
    const parsed = JSON.parse(rawLine) as JsonObject
    collectPreviewFromRecord(parsed, previewState, locale, parsedMeta)
  } catch {
    // Ignore malformed lines for title generation.
  }
}

function collectPreviewFromRecord(
  record: JsonObject,
  previewState: PreviewState,
  locale: AppLocale,
  parsedMeta?: SessionMetaSummary | null,
): void {
  if (!previewState.firstTimestamp) {
    previewState.firstTimestamp = readString(record.timestamp)
  }

  if (!previewState.meta) {
    previewState.meta = parsedMeta ?? extractMeta(record)
  }

  const type = readString(record.type)
  const payload = readObject(record.payload)

  if (!payload) {
    return
  }

  if (
    !previewState.firstEffectiveUser &&
    type === 'response_item' &&
    readString(payload.type) === 'message' &&
    readString(payload.role) === 'user'
  ) {
    const candidate = normalizeInlineText(extractContentPreview(payload, locale))

    if (candidate && !isInjectedInstruction(candidate)) {
      previewState.firstEffectiveUser = candidate
    }
  }

  if (
    !previewState.firstAssistant &&
    type === 'response_item' &&
    readString(payload.type) === 'message' &&
    readString(payload.role) === 'assistant'
  ) {
    const candidate = normalizeInlineText(extractContentPreview(payload, locale))

    if (candidate) {
      previewState.firstAssistant = candidate
    }
  }
}

function hasEnoughPreviewData(previewState: PreviewState): boolean {
  return Boolean(previewState.meta && (previewState.firstEffectiveUser || previewState.firstAssistant))
}

function buildSessionPreview(
  fileName: string,
  previewState: PreviewState,
  locale: AppLocale,
): SessionPreview {
  const messages = getMessages(locale)
  const projectName =
    normalizeInlineText(previewState.meta?.cwd?.split(/[\\/]/).pop() ?? '') ||
    messages.parser.unknownProject
  const rawTitle =
    previewState.firstEffectiveUser ??
    previewState.firstAssistant ??
    `${projectName} ${messages.parser.sessionSuffix}`
  const timeLabel = formatPreviewTimestamp(
    previewState.meta?.timestamp ?? previewState.firstTimestamp,
    locale,
  )

  return {
    rawName: fileName,
    projectName,
    displayTitle: truncate(normalizeInlineText(rawTitle) || fileName, 32),
    subtitle: truncate(
      [projectName, timeLabel].filter((part): part is string => Boolean(part)).join(' · '),
      48,
    ),
    startedAt: previewState.meta?.timestamp ?? previewState.firstTimestamp,
  }
}

function summarizeParsedLine(
  record: JsonObject,
  rawByteStart: number,
  rawByteEnd: number,
  index: number,
  locale: AppLocale,
): SessionItemSummary {
  const messages = getMessages(locale)
  const timestamp = readString(record.timestamp)
  const type = readString(record.type) ?? 'unknown'
  const payload = readObject(record.payload)
  const payloadType = payload ? readString(payload.type) : null

  if (type === 'response_item' && payloadType === 'message' && payload) {
    const responseRole = readString(payload.role)

    if (responseRole === 'user') {
      return createSummary({
        index,
        bucket: 'user',
        role: responseRole,
        timestamp,
        title: messages.parser.userMessage,
        textPreview: extractContentPreview(payload, locale),
        rawByteStart,
        rawByteEnd,
      }, locale)
    }

    if (responseRole === 'assistant') {
      return createSummary({
        index,
        bucket: 'codex',
        role: responseRole,
        timestamp,
        title: messages.parser.codexReply,
        textPreview: extractContentPreview(payload, locale),
        rawByteStart,
        rawByteEnd,
      }, locale)
    }

    if (responseRole === 'developer') {
      return createSummary({
        index,
        bucket: 'developer',
        role: responseRole,
        timestamp,
        title: messages.parser.developerInstruction,
        textPreview: extractContentPreview(payload, locale),
        rawByteStart,
        rawByteEnd,
      }, locale)
    }
  }

  if (type === 'event_msg' && payload) {
    if (payloadType === 'user_message') {
      return createSummary({
        index,
        bucket: 'user',
        role: payloadType,
        timestamp,
        title: messages.parser.userMessage,
        textPreview: readString(payload.message) ?? messages.parser.userMessageEvent,
        rawByteStart,
        rawByteEnd,
      }, locale)
    }

    if (payloadType === 'agent_message') {
      return createSummary({
        index,
        bucket: 'codex',
        role: payloadType,
        timestamp,
        title: messages.parser.codexStreamingUpdate,
        textPreview: readString(payload.message) ?? messages.parser.assistantMessageEvent,
        rawByteStart,
        rawByteEnd,
      }, locale)
    }

    return createSummary({
      index,
      bucket: 'system',
        role: payloadType ?? type,
        timestamp,
        title: humanize(payloadType ?? type),
        textPreview: truncate(readString(payload.message) ?? stringifyPreview(payload), 240),
        rawByteStart,
        rawByteEnd,
    }, locale)
  }

  if (type === 'session_meta') {
    const cwd = payload ? readString(payload.cwd) : null
    const modelProvider = payload ? readString(payload.model_provider) : null
    const preview = [cwd, modelProvider].filter(Boolean).join(' · ')

    return createSummary({
      index,
      bucket: 'system',
      role: type,
      timestamp,
      title: messages.parser.sessionMetadata,
      textPreview: preview || messages.parser.sessionMetadataSnapshot,
      rawByteStart,
      rawByteEnd,
    }, locale)
  }

  if (type === 'turn_context') {
    return createSummary({
      index,
      bucket: 'system',
      role: type,
      timestamp,
      title: messages.parser.turnContext,
      textPreview: messages.parser.turnContextCheckpoint,
      rawByteStart,
      rawByteEnd,
    }, locale)
  }

  if (type === 'response_item' && payload) {
    if (payloadType === 'reasoning') {
      return createSummary({
        index,
        bucket: 'system',
        role: payloadType,
        timestamp,
        title: messages.parser.reasoning,
        textPreview: messages.parser.reasoningSummary,
        rawByteStart,
        rawByteEnd,
      }, locale)
    }

    if (payloadType === 'function_call') {
      const fnName = readString(payload.name) ?? 'tool_call'
      const preview = truncate(readString(payload.arguments) ?? stringifyPreview(payload), 220)

      return createSummary({
        index,
        bucket: 'system',
        role: payloadType,
        timestamp,
        title: `${messages.parser.toolCall} · ${fnName}`,
        textPreview: preview,
        rawByteStart,
        rawByteEnd,
      }, locale)
    }

    if (payloadType === 'function_call_output') {
      return createSummary({
        index,
        bucket: 'system',
        role: payloadType,
        timestamp,
        title: messages.parser.toolOutput,
        textPreview: truncate(readString(payload.output) ?? stringifyPreview(payload), 220),
        rawByteStart,
        rawByteEnd,
      }, locale)
    }
  }

  return createSummary({
    index,
    bucket: 'system',
    role: payloadType ?? type,
    timestamp,
    title: humanize(payloadType ?? type),
    textPreview: truncate(stringifyPreview(payload ?? record), 220),
    rawByteStart,
    rawByteEnd,
  }, locale)
}

function extractMeta(record: JsonObject): SessionMetaSummary | null {
  const type = readString(record.type)

  if (type !== 'session_meta') {
    return null
  }

  const payload = readObject(record.payload)

  if (!payload) {
    return null
  }

  return {
    id: readString(payload.id) ?? undefined,
    timestamp: readString(payload.timestamp) ?? undefined,
    cwd: readString(payload.cwd) ?? undefined,
    originator: readString(payload.originator) ?? undefined,
    cliVersion: readString(payload.cli_version) ?? undefined,
    source: readString(payload.source) ?? undefined,
    modelProvider: readString(payload.model_provider) ?? undefined,
  }
}

function extractContentPreview(payload: JsonObject, locale: AppLocale): string {
  const messages = getMessages(locale)
  const content = Array.isArray(payload.content) ? payload.content : []
  const parts: string[] = []

  for (const part of content) {
    const item = readObject(part)

    if (!item) {
      continue
    }

    const type = readString(item.type)

    if (type === 'input_text' || type === 'output_text') {
      parts.push(readString(item.text) ?? readString(item.input_text) ?? `[${type}]`)
      continue
    }

    if (type === 'input_image') {
      parts.push(`[${messages.parser.imageInput}]`)
      continue
    }

    parts.push(`[${type ?? 'unknown'}]`)
  }

  return truncate(normalizeInlineText(parts.filter(Boolean).join(' ')) || messages.parser.noTextContent, 280)
}

function extractContentMarkdown(payload: JsonObject, locale: AppLocale): string {
  const messages = getMessages(locale)
  const content = Array.isArray(payload.content) ? payload.content : []
  const parts: string[] = []

  for (const part of content) {
    const item = readObject(part)

    if (!item) {
      continue
    }

    const type = readString(item.type)

    if (type === 'input_text' || type === 'output_text') {
      parts.push(normalizeMarkdownText(readString(item.text) ?? readString(item.input_text) ?? `[${type}]`))
      continue
    }

    if (type === 'input_image') {
      parts.push(`> [${messages.parser.imageInput}]`)
      continue
    }

    parts.push(`> [${type ?? 'unknown'}]`)
  }

  return parts.filter(Boolean).join('\n\n').trim() || messages.parser.noTextContent
}

function normalizeMarkdownText(value: string): string {
  return value.replace(/\r\n/g, '\n').trim()
}

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function isInjectedInstruction(value: string): boolean {
  return value.includes('AGENTS.md instructions')
}

function formatPreviewTimestamp(value: string | null | undefined, locale: AppLocale): string {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleString(getIntlLocale(locale), {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function createSummary(input: {
  index: number
  bucket: SessionBucket
  role: string
  timestamp: string | null
  title: string
  textPreview: string
  rawByteStart: number
  rawByteEnd: number
}, locale: AppLocale): SessionItemSummary {
  const messages = getMessages(locale)
  const bucketUi = getBucketUi(locale)

  return {
    index: input.index,
    timestamp: input.timestamp,
    bucket: input.bucket,
    role: input.role,
    speakerLabel: bucketUi[input.bucket].label,
    avatarColor: bucketUi[input.bucket].color,
    title: input.title,
    textPreview: normalizeInlineText(input.textPreview) || messages.parser.noTextContent,
    rawByteStart: input.rawByteStart,
    rawByteEnd: input.rawByteEnd,
  }
}

function readObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function humanize(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function stringifyPreview(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 1)}…`
}
