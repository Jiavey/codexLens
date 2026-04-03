import { afterEach, describe, expect, it } from 'vitest'
import { appendFile, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  extractConversationMarkdown,
  parseSessionFile,
  parseSessionFileTail,
  readRawRange,
  readSessionPreview,
} from './sessions-parser.js'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createJsonl(lines: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'codex-sessions-view-'))
  tempDirs.push(dir)
  const filePath = join(dir, 'session.jsonl')
  await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8')
  return filePath
}

describe('sessions-parser', () => {
  it('normalizes user, codex, developer and event roles', async () => {
    const filePath = await createJsonl([
      JSON.stringify({
        timestamp: '2026-04-01T10:00:57.860Z',
        type: 'session_meta',
        payload: {
          id: 'session-1',
          timestamp: '2026-04-01T10:00:57.860Z',
          cwd: '/tmp/workspace',
          originator: 'Codex Desktop',
          model_provider: 'pospal',
        },
      }),
      JSON.stringify({
        timestamp: '2026-04-01T10:02:23.938Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'hello world' }],
        },
      }),
      JSON.stringify({
        timestamp: '2026-04-01T10:02:24.938Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'assistant reply' }],
        },
      }),
      JSON.stringify({
        timestamp: '2026-04-01T10:02:25.938Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'developer',
          content: [{ type: 'input_text', text: 'follow the rules' }],
        },
      }),
      JSON.stringify({
        timestamp: '2026-04-01T10:02:26.938Z',
        type: 'event_msg',
        payload: {
          type: 'user_message',
          message: 'event user',
        },
      }),
      JSON.stringify({
        timestamp: '2026-04-01T10:02:27.938Z',
        type: 'event_msg',
        payload: {
          type: 'agent_message',
          message: 'event codex',
        },
      }),
      JSON.stringify({
        timestamp: '2026-04-01T10:02:28.938Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          message: 'usage update',
        },
      }),
      'not valid json',
    ])

    const result = await parseSessionFile(filePath)

    expect(result.meta?.cwd).toBe('/tmp/workspace')
    expect(result.meta?.modelProvider).toBe('pospal')
    expect(result.preview).toMatchObject({
      projectName: 'workspace',
      displayTitle: 'hello world',
    })
    expect(result.preview.subtitle.startsWith('workspace · 04/01')).toBe(true)
    expect(result.items[1]).toMatchObject({ bucket: 'user', title: '用户消息' })
    expect(result.items[2]).toMatchObject({ bucket: 'codex', title: 'Codex 回复' })
    expect(result.items[3]).toMatchObject({ bucket: 'developer', title: '开发者指令' })
    expect(result.items[4]).toMatchObject({ bucket: 'user', role: 'user_message' })
    expect(result.items[5]).toMatchObject({ bucket: 'codex', role: 'agent_message' })
    expect(result.items[6]).toMatchObject({ bucket: 'system', role: 'token_count' })
    expect(result.items[7]).toMatchObject({ bucket: 'system', title: 'JSON 格式错误' })
  })

  it('extracts image placeholders and supports tail parsing', async () => {
    const filePath = await createJsonl([
      JSON.stringify({
        timestamp: '2026-04-01T10:00:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'first line' }],
        },
      }),
      JSON.stringify({
        timestamp: '2026-04-01T10:00:01.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          message: 'usage update',
        },
      }),
    ])

    const initialStat = await stat(filePath)

    await appendFile(
      filePath,
      [
        JSON.stringify({
          timestamp: '2026-04-01T10:00:02.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_image', image_url: 'file:///tmp/a.png' }],
          },
        }),
        JSON.stringify({
          timestamp: '2026-04-01T10:00:03.000Z',
          type: 'response_item',
          payload: {
            type: 'function_call',
            name: 'exec_command',
            arguments: '{"cmd":"ls"}',
          },
        }),
      ].join('\n') + '\n',
      'utf8',
    )

    const tail = await parseSessionFileTail(filePath, initialStat.size, 2)

    expect(tail.items).toHaveLength(2)
    expect(tail.items[0]).toMatchObject({
      bucket: 'user',
      textPreview: '[图片输入]',
    })
    expect(tail.items[1]).toMatchObject({
      bucket: 'system',
      title: '工具调用 · exec_command',
    })
  })

  it('skips incomplete trailing json until the line is fully written', async () => {
    const filePath = await createJsonl([
      JSON.stringify({
        timestamp: '2026-04-01T10:00:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'first line' }],
        },
      }),
    ])

    const initial = await parseSessionFile(filePath)

    const completeLine = JSON.stringify({
      timestamp: '2026-04-01T10:00:01.000Z',
      type: 'event_msg',
      payload: {
        type: 'user_message',
        message: 'second line',
      },
    })
    const assistantLine = JSON.stringify({
      timestamp: '2026-04-01T10:00:02.000Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'third line' }],
      },
    })
    const splitAt = Math.max(1, assistantLine.length - 12)
    const partialLineStart = assistantLine.slice(0, splitAt)
    const partialLineEnd = `${assistantLine.slice(splitAt)}\n`

    await appendFile(filePath, `${completeLine}\n${partialLineStart}`, 'utf8')

    const firstTail = await parseSessionFileTail(filePath, initial.fileSize, initial.items.length)

    expect(firstTail.items).toHaveLength(1)
    expect(firstTail.items[0]).toMatchObject({
      bucket: 'user',
      role: 'user_message',
      textPreview: 'second line',
    })

    await appendFile(filePath, partialLineEnd, 'utf8')

    const secondTail = await parseSessionFileTail(
      filePath,
      firstTail.fileSize,
      initial.items.length + firstTail.items.length,
    )

    expect(secondTail.items).toHaveLength(1)
    expect(secondTail.items[0]).toMatchObject({
      bucket: 'codex',
      title: 'Codex 回复',
      textPreview: 'third line',
    })
  })

  it('normalizes multiline preview text into a single paragraph summary', async () => {
    const filePath = await createJsonl([
      JSON.stringify({
        timestamp: '2026-04-01T10:00:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'output_text', text: '第一行\n\n第二行' },
            { type: 'output_text', text: '第三行' },
          ],
        },
      }),
    ])

    const result = await parseSessionFile(filePath)

    expect(result.items[0]).toMatchObject({
      bucket: 'codex',
      textPreview: '第一行 第二行 第三行',
    })
  })

  it('reads raw byte ranges without trailing newline bytes', async () => {
    const line = JSON.stringify({
      timestamp: '2026-04-01T10:00:00.000Z',
      type: 'event_msg',
      payload: {
        type: 'agent_message',
        message: 'hello raw',
      },
    })
    const filePath = await createJsonl([line])
    const result = await parseSessionFile(filePath)
    const raw = await readRawRange(
      filePath,
      result.items[0].rawByteStart,
      result.items[0].rawByteEnd,
    )

    expect(raw).toBe(line)
  })

  it('builds preview from the first effective user message and truncates it', async () => {
    const filePath = await createJsonl([
      JSON.stringify({
        timestamp: '2026-04-01T10:00:57.860Z',
        type: 'session_meta',
        payload: {
          timestamp: '2026-04-01T10:00:57.860Z',
          cwd: '~/project/codex-sessions-view',
        },
      }),
      JSON.stringify({
        timestamp: '2026-04-01T10:01:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '# AGENTS.md instructions for ~/project/codex-sessions-view',
            },
          ],
        },
      }),
      JSON.stringify({
        timestamp: '2026-04-01T10:02:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '帮我把目录树里的 jsonl 文件标题改成真正的会话标题，并且不要换行展示，长度超过就截断。',
            },
          ],
        },
      }),
    ])

    const preview = await readSessionPreview(filePath)

    expect(preview).toMatchObject({
      projectName: 'codex-sessions-view',
    })
    expect(preview.subtitle.startsWith('codex-sessions-view · 04/01')).toBe(true)
    expect(preview.displayTitle.startsWith('帮我把目录树里的 jsonl 文件标题')).toBe(true)
    expect(preview.displayTitle.endsWith('…')).toBe(true)
    expect(preview.displayTitle.length).toBeLessThanOrEqual(32)
  })

  it('extracts full markdown for conversation items', () => {
    const userMarkdown = extractConversationMarkdown(
      JSON.stringify({
        timestamp: '2026-04-01T10:01:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: '# 标题\n\n- 第一项\n- 第二项' },
            { type: 'input_image', image_url: 'file:///tmp/a.png' },
          ],
        },
      }),
    )
    const codexMarkdown = extractConversationMarkdown(
      JSON.stringify({
        timestamp: '2026-04-01T10:02:00.000Z',
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'output_text', text: '```ts\nconsole.log(\"ok\")\n```' },
          ],
        },
      }),
    )
    const streamedMarkdown = extractConversationMarkdown(
      JSON.stringify({
        timestamp: '2026-04-01T10:03:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'agent_message',
          message: 'streaming...',
        },
      }),
    )

    expect(userMarkdown).toBe('# 标题\n\n- 第一项\n- 第二项\n\n> [图片输入]')
    expect(codexMarkdown).toBe('```ts\nconsole.log(\"ok\")\n```')
    expect(streamedMarkdown).toBeNull()
  })
})
