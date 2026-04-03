import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DEFAULT_STATE_DB_PATH = join(homedir(), '.codex', 'state_5.sqlite')

export interface DeleteThreadRecordsResult {
  matchedThreadIds: string[]
  deletedThreadCount: number
}

export function deleteThreadRecordsForRolloutPath(
  rolloutPath: string,
  databasePath = DEFAULT_STATE_DB_PATH,
): DeleteThreadRecordsResult {
  const resolvedDatabasePath = resolve(databasePath)

  if (!existsSync(resolvedDatabasePath)) {
    return {
      matchedThreadIds: [],
      deletedThreadCount: 0,
    }
  }

  const db = new DatabaseSync(resolvedDatabasePath)

  try {
    db.exec('PRAGMA foreign_keys = ON')

    const selectThreadIds = db.prepare('SELECT id FROM threads WHERE rollout_path = ?')
    const threadRows = selectThreadIds.all(rolloutPath) as Array<{ id: string }>
    const matchedThreadIds = threadRows.map((row) => row.id).filter(Boolean)

    if (matchedThreadIds.length === 0) {
      return {
        matchedThreadIds: [],
        deletedThreadCount: 0,
      }
    }

    const deleteLogs = db.prepare('DELETE FROM logs WHERE thread_id = ?')
    const deleteSpawnEdges = db.prepare(
      'DELETE FROM thread_spawn_edges WHERE parent_thread_id = ? OR child_thread_id = ?',
    )
    const clearAssignedThread = db.prepare(
      'UPDATE agent_job_items SET assigned_thread_id = NULL WHERE assigned_thread_id = ?',
    )
    const deleteStage1Outputs = db.prepare('DELETE FROM stage1_outputs WHERE thread_id = ?')
    const deleteDynamicTools = db.prepare('DELETE FROM thread_dynamic_tools WHERE thread_id = ?')
    const deleteThread = db.prepare('DELETE FROM threads WHERE id = ?')

    db.exec('BEGIN IMMEDIATE')

    try {
      for (const threadId of matchedThreadIds) {
        deleteLogs.run(threadId)
        deleteSpawnEdges.run(threadId, threadId)
        clearAssignedThread.run(threadId)
        deleteStage1Outputs.run(threadId)
        deleteDynamicTools.run(threadId)
        deleteThread.run(threadId)
      }

      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }

    return {
      matchedThreadIds,
      deletedThreadCount: matchedThreadIds.length,
    }
  } finally {
    db.close()
  }
}
