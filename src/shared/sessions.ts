import type { AppLocale } from './i18n.js'

export const ITEM_PAGE_SIZE = 120

export type TreeNodeKind = 'directory' | 'file'
export type SessionBucket = 'user' | 'codex' | 'developer' | 'system'

export interface SessionPreview {
  rawName: string
  projectName: string
  displayTitle: string
  subtitle: string
  startedAt: string | null
}

export interface TreeNode {
  id: string
  name: string
  path: string
  kind: TreeNodeKind
  preview?: SessionPreview
  children?: TreeNode[]
  size?: number
  mtime?: number
}

export interface RootInfo {
  rootPath: string
  available: boolean
}

export interface TreeResponse extends RootInfo {
  tree: TreeNode[]
  lastUpdatedAt: string | null
}

export interface SessionMetaSummary {
  id?: string
  timestamp?: string
  cwd?: string
  originator?: string
  cliVersion?: string
  source?: string
  modelProvider?: string
  authMode?: string
}

export interface SessionItemSummary {
  index: number
  timestamp: string | null
  bucket: SessionBucket
  role: string
  speakerLabel: string
  avatarColor: string
  title: string
  textPreview: string
  rawByteStart: number
  rawByteEnd: number
}

export interface OpenFileResult {
  path: string
  name: string
  preview: SessionPreview
  totalCount: number
  conversationCount: number
  initialStart: number
  initialItems: SessionItemSummary[]
  meta: SessionMetaSummary | null
  mtime: number
}

export interface GetItemsRequest {
  path: string
  start: number
  limit: number
}

export interface RawItemRequest {
  path: string
  index: number
}

export interface RawItemResult {
  path: string
  index: number
  rawText: string
  formattedJson: string
  parseError?: string
}

export interface ConversationItemDetail {
  index: number
  timestamp: string | null
  bucket: Extract<SessionBucket, 'user' | 'codex'>
  role: string
  speakerLabel: string
  avatarColor: string
  markdown: string
}

export interface ConversationItemsResult {
  path: string
  items: ConversationItemDetail[]
}

export interface TreeChangedPayload {
  rootPath: string
  available: boolean
  at: string
}

export interface FilePatchedPayload {
  path: string
  mode: 'append' | 'reset'
  totalCount: number
  conversationCount?: number
  startIndex?: number
  items?: SessionItemSummary[]
}

export type Unsubscribe = () => void

export interface SessionsApi {
  setLocale: (locale: AppLocale) => Promise<void>
  getRoot: () => Promise<RootInfo>
  pickRoot: () => Promise<RootInfo>
  listTree: () => Promise<TreeResponse>
  deleteFile: (path: string) => Promise<void>
  openFile: (path: string) => Promise<OpenFileResult>
  getItems: (request: GetItemsRequest) => Promise<SessionItemSummary[]>
  getRawItem: (request: RawItemRequest) => Promise<RawItemResult>
  getConversationItems: (path: string) => Promise<ConversationItemsResult>
  onTreeChanged: (listener: (payload: TreeChangedPayload) => void) => Unsubscribe
  onFilePatched: (listener: (payload: FilePatchedPayload) => void) => Unsubscribe
}
