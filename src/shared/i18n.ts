import type { SessionBucket } from './sessions.js'

export type AppLocale = 'zh-CN' | 'en'

export const DEFAULT_APP_LOCALE: AppLocale = 'zh-CN'

const BUCKET_COLORS: Record<SessionBucket, string> = {
  user: '#0f9e8c',
  codex: '#dd5e3f',
  developer: '#445fc6',
  system: '#6d7481',
}

const LOCALE_MESSAGES = {
  'zh-CN': {
    buckets: {
      user: '用户',
      codex: 'Codex',
      developer: '开发者',
      system: '系统 / 工具',
    },
    common: {
      close: '关闭',
      currentSession: '当前会话',
      noData: '暂无',
      noTime: '无时间',
      loading: '加载中...',
      onDemand: '按需查看',
      updatedAt: '更新于',
    },
    app: {
      sidebarTitle: 'Codex 会话',
      switchDirectory: '切换目录',
      languageLabel: '界面语言',
      openSettings: '打开设置',
      settingsTitle: '设置',
      settingsHint: '在这里切换目录和界面语言。',
      currentDirectory: '当前目录',
      connected: '已连接',
      directoryUnavailable: '目录不可用',
      syncingTree: '正在刷新目录...',
      treeSynced: '目录树已同步',
      rootMissing:
        '当前根目录不存在，请点击“切换目录”选择新的会话目录。',
      noSessionFiles: '目录里还没有 `.jsonl` 会话文件。',
      selectSessionPrompt: '从左侧选择一个 `.jsonl` 文件开始查看。',
      timelineEmpty:
        '目录树准备好后，右侧会展示当前会话的消息流和原始 JSON。',
      loadingSession: '正在加载会话...',
      loadMoreHistory: '滚动会按需加载更多历史记录',
      conversationOnly: '只显示对话',
      previewConversation: '预览完整对话',
      switchToChronological: '切到顺序',
      switchToReverse: '切到倒序',
      rawJson: '原始 JSON',
      loadingRaw: '正在读取原始 JSON...',
      rawHint: '点击任意记录卡片，在这里查看格式化后的 JSON。',
      fullConversationPreview: '完整对话预览',
      renderingConversation: '正在渲染完整对话...',
      noConversationPreview: '当前会话没有可预览的完整对话内容。',
      loadedRecords: (loaded: number, total: number) => `${loaded}/${total} 条记录已加载`,
      cachedRecords: (count: number) => `${count} 条已缓存`,
      startedAt: '开始于',
      lastConversationAt: '最后一次对话',
      ownership: '归属',
      workdir: '工作目录',
      originator: '发起端',
      modelProvider: '模型提供方',
      source: '来源',
      newRecords: (count: number) => `有 ${count} 条新记录`,
      confirmDelete: (label: string, path: string) =>
        `确认删除这个本机会话文件吗？\n\n${label}\n${path}\n\n删除后无法恢复。`,
      preloadUnavailable: '桌面应用预加载桥接不可用，请通过应用入口启动。',
      deleteFailed: '删除会话文件失败。',
      readRawFailed: '读取原始 JSON 失败。',
      loadConversationFailed: '加载完整对话失败。',
      deletingLocalSession: '正在删除...',
      deleteLocalSessionFile: '删除本地会话文件',
      localeZh: '中文',
      localeEn: 'English',
    },
    parser: {
      unknownProject: '未知项目',
      sessionSuffix: '会话',
      blankLine: '空行',
      emptyJsonlLine: '空 JSONL 行',
      invalidJson: 'JSON 格式错误',
      userMessage: '用户消息',
      codexReply: 'Codex 回复',
      developerInstruction: '开发者指令',
      userMessageEvent: '用户消息事件',
      codexStreamingUpdate: 'Codex 流式更新',
      assistantMessageEvent: '助手消息事件',
      sessionMetadata: '会话元数据',
      sessionMetadataSnapshot: '会话元数据快照',
      turnContext: '轮次上下文',
      turnContextCheckpoint: '会话上下文检查点',
      reasoning: '推理',
      reasoningSummary: '模型推理摘要',
      toolCall: '工具调用',
      toolOutput: '工具输出',
      imageInput: '图片输入',
      noTextContent: '无文本内容',
    },
    service: {
      pickRootTitle: '选择 Codex 会话目录',
      deleteManagedOnly: '只能删除当前会话目录中的 .jsonl 文件。',
      deleteMissingFile: (name: string) => `会话文件不存在：${name}`,
      deleteFileOnly: '只能删除文件，不能删除目录。',
      recordNotFound: (index: number, name: string) => `记录 ${index} 在 ${name} 中不存在`,
      invalidJsonLine: '这一行不是合法的 JSON。',
    },
    enums: {
      authModeApiKey: 'API 密钥',
      authModeChatgpt: 'ChatGPT 登录',
      originatorDesktop: '桌面端',
      originatorExec: '执行器',
      originatorCli: 'CLI',
      sourceVscode: 'VS Code',
      sourceExec: '执行任务',
      sourceCli: 'CLI',
    },
  },
  en: {
    buckets: {
      user: 'User',
      codex: 'Codex',
      developer: 'Developer',
      system: 'System / Tool',
    },
    common: {
      close: 'Close',
      currentSession: 'Current session',
      noData: 'None',
      noTime: 'No timestamp',
      loading: 'Loading...',
      onDemand: 'On demand',
      updatedAt: 'Updated',
    },
    app: {
      sidebarTitle: 'Codex Sessions',
      switchDirectory: 'Change folder',
      languageLabel: 'Language',
      openSettings: 'Open settings',
      settingsTitle: 'Settings',
      settingsHint: 'Change the sessions folder and interface language here.',
      currentDirectory: 'Current folder',
      connected: 'Connected',
      directoryUnavailable: 'Folder unavailable',
      syncingTree: 'Refreshing folder...',
      treeSynced: 'Tree synced',
      rootMissing:
        'The current root folder does not exist. Click "Change folder" to select a new sessions folder.',
      noSessionFiles: 'There are no `.jsonl` session files in this folder yet.',
      selectSessionPrompt: 'Choose a `.jsonl` file from the left to start browsing.',
      timelineEmpty:
        'Once the tree is ready, the current session timeline and raw JSON will appear on the right.',
      loadingSession: 'Loading session...',
      loadMoreHistory: 'Scroll to load more history on demand',
      conversationOnly: 'Conversation only',
      previewConversation: 'Preview full conversation',
      switchToChronological: 'Chronological',
      switchToReverse: 'Reverse order',
      rawJson: 'Raw JSON',
      loadingRaw: 'Loading raw JSON...',
      rawHint: 'Click any timeline card to inspect formatted JSON here.',
      fullConversationPreview: 'Full conversation preview',
      renderingConversation: 'Rendering full conversation...',
      noConversationPreview: 'There is no full conversation content to preview for this session.',
      loadedRecords: (loaded: number, total: number) => `${loaded}/${total} records loaded`,
      cachedRecords: (count: number) => `${count} cached`,
      startedAt: 'Started',
      lastConversationAt: 'Last conversation',
      ownership: 'Ownership',
      workdir: 'Working directory',
      originator: 'Originator',
      modelProvider: 'Model provider',
      source: 'Source',
      newRecords: (count: number) => `${count} new records`,
      confirmDelete: (label: string, path: string) =>
        `Delete this local session file?\n\n${label}\n${path}\n\nThis action cannot be undone.`,
      preloadUnavailable:
        'The desktop preload bridge is unavailable. Please launch the app from the desktop entry point.',
      deleteFailed: 'Failed to delete the session file.',
      readRawFailed: 'Failed to read raw JSON.',
      loadConversationFailed: 'Failed to load the full conversation.',
      deletingLocalSession: 'Deleting...',
      deleteLocalSessionFile: 'Delete local session file',
      localeZh: '中文',
      localeEn: 'English',
    },
    parser: {
      unknownProject: 'Unknown project',
      sessionSuffix: 'session',
      blankLine: 'Blank line',
      emptyJsonlLine: 'Empty JSONL line',
      invalidJson: 'Invalid JSON',
      userMessage: 'User message',
      codexReply: 'Codex reply',
      developerInstruction: 'Developer instruction',
      userMessageEvent: 'User message event',
      codexStreamingUpdate: 'Codex streaming update',
      assistantMessageEvent: 'Assistant message event',
      sessionMetadata: 'Session metadata',
      sessionMetadataSnapshot: 'Session metadata snapshot',
      turnContext: 'Turn context',
      turnContextCheckpoint: 'Conversation context checkpoint',
      reasoning: 'Reasoning',
      reasoningSummary: 'Model reasoning summary',
      toolCall: 'Tool call',
      toolOutput: 'Tool output',
      imageInput: 'Image input',
      noTextContent: 'No text content',
    },
    service: {
      pickRootTitle: 'Choose a Codex sessions folder',
      deleteManagedOnly: 'Only .jsonl files inside the current sessions folder can be deleted.',
      deleteMissingFile: (name: string) => `Session file not found: ${name}`,
      deleteFileOnly: 'Only files can be deleted, not directories.',
      recordNotFound: (index: number, name: string) => `Record ${index} was not found in ${name}`,
      invalidJsonLine: 'This line is not valid JSON.',
    },
    enums: {
      authModeApiKey: 'API key',
      authModeChatgpt: 'ChatGPT sign-in',
      originatorDesktop: 'Desktop',
      originatorExec: 'Executor',
      originatorCli: 'CLI',
      sourceVscode: 'VS Code',
      sourceExec: 'Exec task',
      sourceCli: 'CLI',
    },
  },
} as const

export type LocaleMessages = (typeof LOCALE_MESSAGES)[AppLocale]

export function normalizeAppLocale(value: unknown): AppLocale {
  if (typeof value === 'string' && value.toLowerCase().startsWith('en')) {
    return 'en'
  }

  return DEFAULT_APP_LOCALE
}

export function getMessages(locale: AppLocale): LocaleMessages {
  return LOCALE_MESSAGES[normalizeAppLocale(locale)]
}

export function getIntlLocale(locale: AppLocale): string {
  return locale === 'en' ? 'en-US' : 'zh-CN'
}

export function getBucketUi(locale: AppLocale): Record<SessionBucket, { label: string; color: string }> {
  const messages = getMessages(locale)

  return {
    user: {
      label: messages.buckets.user,
      color: BUCKET_COLORS.user,
    },
    codex: {
      label: messages.buckets.codex,
      color: BUCKET_COLORS.codex,
    },
    developer: {
      label: messages.buckets.developer,
      color: BUCKET_COLORS.developer,
    },
    system: {
      label: messages.buckets.system,
      color: BUCKET_COLORS.system,
    },
  }
}
