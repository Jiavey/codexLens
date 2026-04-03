import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'

import { readThreadAccountInfo } from './thread-account-store.js'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createTempLogsDatabase(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'codex-thread-account-'))
  tempDirs.push(dir)
  const dbPath = join(dir, 'logs_1.sqlite')
  const db = new DatabaseSync(dbPath)

  try {
    db.exec(`
      CREATE TABLE logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        ts_nanos INTEGER NOT NULL,
        level TEXT NOT NULL,
        target TEXT NOT NULL,
        feedback_log_body TEXT,
        thread_id TEXT
      );
    `)

    db.prepare(`
      INSERT INTO logs (ts, ts_nanos, level, target, feedback_log_body, thread_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      100,
      1,
      'INFO',
      'codex_otel.log_only',
      'event.name="codex.sse_event" conversation.id=thread-1 auth_mode="ApiKey" originator=Codex_Desktop',
      null,
    )
    db.prepare(`
      INSERT INTO logs (ts, ts_nanos, level, target, feedback_log_body, thread_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      200,
      1,
      'INFO',
      'log',
      'session_loop{thread_id=thread-2}:run_turn auth_mode="Chatgpt" model=gpt-5.4',
      'thread-2',
    )
    db.prepare(`
      INSERT INTO logs (ts, ts_nanos, level, target, feedback_log_body, thread_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      300,
      1,
      'INFO',
      'test',
      'event.name="codex.user_prompt" user.account_id="acc-456" user.email="user@example.com"',
      'thread-3',
    )
  } finally {
    db.close()
  }

  return dbPath
}

describe('thread-account-store', () => {
  it('reads auth mode from codex telemetry rows matched by conversation id', async () => {
    const dbPath = await createTempLogsDatabase()

    expect(readThreadAccountInfo('thread-1', dbPath)).toEqual({
      authMode: 'ApiKey',
    })
  })

  it('falls back to thread_id rows when telemetry stores the thread directly', async () => {
    const dbPath = await createTempLogsDatabase()

    expect(readThreadAccountInfo('thread-2', dbPath)).toEqual({
      authMode: 'Chatgpt',
    })
  })

  it('ignores noisy account fields without a stable auth mode', async () => {
    const dbPath = await createTempLogsDatabase()

    expect(readThreadAccountInfo('thread-3', dbPath)).toBeNull()
  })

  it('returns null when the log database does not exist', () => {
    expect(readThreadAccountInfo('thread-1', '/tmp/does-not-exist.sqlite')).toBeNull()
  })
})
