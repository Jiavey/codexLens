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

export interface TreeChangedPayload {
  rootPath: string
  available: boolean
  at: string
}

export interface FilePatchedPayload {
  path: string
  mode: 'append' | 'reset'
  totalCount: number
  startIndex?: number
  items?: SessionItemSummary[]
}

export type Unsubscribe = () => void

export interface SessionsApi {
  getRoot: () => Promise<RootInfo>
  pickRoot: () => Promise<RootInfo>
  listTree: () => Promise<TreeResponse>
  deleteFile: (path: string) => Promise<void>
  openFile: (path: string) => Promise<OpenFileResult>
  getItems: (request: GetItemsRequest) => Promise<SessionItemSummary[]>
  getRawItem: (request: RawItemRequest) => Promise<RawItemResult>
  onTreeChanged: (listener: (payload: TreeChangedPayload) => void) => Unsubscribe
  onFilePatched: (listener: (payload: FilePatchedPayload) => void) => Unsubscribe
}

export const BUCKET_UI = {
  user: {
    label: '用户',
    color: '#0f9e8c',
  },
  codex: {
    label: 'Codex',
    color: '#dd5e3f',
  },
  developer: {
    label: '开发者',
    color: '#445fc6',
  },
  system: {
    label: '系统 / 工具',
    color: '#6d7481',
  },
} satisfies Record<SessionBucket, { label: string; color: string }>
