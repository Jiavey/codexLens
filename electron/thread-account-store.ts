import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type { SessionMetaSummary } from '../src/shared/sessions.js'

const DEFAULT_LOG_DB_PATH = join(homedir(), '.codex', 'logs_1.sqlite')

const AUTH_MODE_PATTERN = /auth_mode="([^"]+)"/

export function readThreadAccountInfo(
  threadId: string | null | undefined,
  databasePath = DEFAULT_LOG_DB_PATH,
): Pick<SessionMetaSummary, 'authMode'> | null {
  if (!threadId) {
    return null
  }

  const resolvedDatabasePath = resolve(databasePath)

  if (!existsSync(resolvedDatabasePath)) {
    return null
  }

  const db = new DatabaseSync(resolvedDatabasePath, {
    readOnly: true,
  })

  try {
    const rows = db.prepare(`
      SELECT feedback_log_body
      FROM logs
      WHERE feedback_log_body IS NOT NULL
        AND feedback_log_body LIKE '%auth_mode=%'
        AND (
          (target = 'codex_otel.log_only' AND feedback_log_body LIKE ?)
          OR thread_id = ?
        )
      ORDER BY ts DESC, ts_nanos DESC, id DESC
      LIMIT 40
    `).all(`%conversation.id=${threadId}%`, threadId) as Array<{ feedback_log_body: string | null }>

    for (const row of rows) {
      const body = row.feedback_log_body ?? ''
      const authMode = body.match(AUTH_MODE_PATTERN)?.[1]

      if (!authMode) {
        continue
      }

      return {
        authMode,
      }
    }

    return null
  } finally {
    db.close()
  }
}
