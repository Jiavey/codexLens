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
    const schema = readSchema(db)

    if (!tableHasColumns(schema, 'threads', ['id', 'rollout_path'])) {
      return {
        matchedThreadIds: [],
        deletedThreadCount: 0,
      }
    }

    const selectThreadIds = db.prepare('SELECT id FROM threads WHERE rollout_path = ?')
    const threadRows = selectThreadIds.all(rolloutPath) as Array<{ id: string }>
    const matchedThreadIds = threadRows.map((row) => row.id).filter(Boolean)

    if (matchedThreadIds.length === 0) {
      return {
        matchedThreadIds: [],
        deletedThreadCount: 0,
      }
    }

    const deleteLogs = tableHasColumns(schema, 'logs', ['thread_id'])
      ? db.prepare('DELETE FROM logs WHERE thread_id = ?')
      : null
    const deleteSpawnEdges = tableHasColumns(schema, 'thread_spawn_edges', [
      'parent_thread_id',
      'child_thread_id',
    ])
      ? db.prepare('DELETE FROM thread_spawn_edges WHERE parent_thread_id = ? OR child_thread_id = ?')
      : null
    const clearAssignedThread = tableHasColumns(schema, 'agent_job_items', ['assigned_thread_id'])
      ? db.prepare('UPDATE agent_job_items SET assigned_thread_id = NULL WHERE assigned_thread_id = ?')
      : null
    const deleteStage1Outputs = tableHasColumns(schema, 'stage1_outputs', ['thread_id'])
      ? db.prepare('DELETE FROM stage1_outputs WHERE thread_id = ?')
      : null
    const deleteDynamicTools = tableHasColumns(schema, 'thread_dynamic_tools', ['thread_id'])
      ? db.prepare('DELETE FROM thread_dynamic_tools WHERE thread_id = ?')
      : null
    const deleteThread = db.prepare('DELETE FROM threads WHERE id = ?')

    db.exec('BEGIN IMMEDIATE')

    try {
      for (const threadId of matchedThreadIds) {
        deleteLogs?.run(threadId)
        deleteSpawnEdges?.run(threadId, threadId)
        clearAssignedThread?.run(threadId)
        deleteStage1Outputs?.run(threadId)
        deleteDynamicTools?.run(threadId)
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

function readSchema(db: DatabaseSync): Map<string, Set<string>> {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
    name: string
  }>
  const schema = new Map<string, Set<string>>()

  for (const table of tables) {
    const escapedTableName = table.name.replaceAll('"', '""')
    const columns = db.prepare(`PRAGMA table_info("${escapedTableName}")`).all() as Array<{
      name: string
    }>
    schema.set(
      table.name,
      new Set(columns.map((column) => column.name)),
    )
  }

  return schema
}

function tableHasColumns(
  schema: Map<string, Set<string>>,
  tableName: string,
  requiredColumns: string[],
): boolean {
  const columns = schema.get(tableName)

  if (!columns) {
    return false
  }

  return requiredColumns.every((column) => columns.has(column))
}
