import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'

import { deleteThreadRecordsForRolloutPath } from './thread-store.js'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createTempDatabase(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'codex-thread-store-'))
  tempDirs.push(dir)
  const dbPath = join(dir, 'state_5.sqlite')
  const db = new DatabaseSync(dbPath)

  try {
    db.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        rollout_path TEXT NOT NULL
      );

      CREATE TABLE logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT
      );

      CREATE TABLE thread_spawn_edges (
        parent_thread_id TEXT NOT NULL,
        child_thread_id TEXT NOT NULL PRIMARY KEY,
        status TEXT NOT NULL
      );

      CREATE TABLE agent_job_items (
        job_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        assigned_thread_id TEXT,
        PRIMARY KEY (job_id, item_id)
      );

      CREATE TABLE stage1_outputs (
        thread_id TEXT PRIMARY KEY
      );

      CREATE TABLE thread_dynamic_tools (
        thread_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY(thread_id, position)
      );
    `)

    db.prepare('INSERT INTO threads (id, rollout_path) VALUES (?, ?)').run(
      'thread-1',
      '/tmp/session-1.jsonl',
    )
    db.prepare('INSERT INTO threads (id, rollout_path) VALUES (?, ?)').run(
      'thread-2',
      '/tmp/other-session.jsonl',
    )
    db.prepare('INSERT INTO logs (thread_id) VALUES (?)').run('thread-1')
    db.prepare('INSERT INTO logs (thread_id) VALUES (?)').run('thread-2')
    db.prepare(
      'INSERT INTO thread_spawn_edges (parent_thread_id, child_thread_id, status) VALUES (?, ?, ?)',
    ).run('thread-1', 'thread-child', 'completed')
    db.prepare(
      'INSERT INTO thread_spawn_edges (parent_thread_id, child_thread_id, status) VALUES (?, ?, ?)',
    ).run('thread-parent', 'thread-1', 'completed')
    db.prepare(
      'INSERT INTO agent_job_items (job_id, item_id, assigned_thread_id) VALUES (?, ?, ?)',
    ).run('job-1', 'item-1', 'thread-1')
    db.prepare('INSERT INTO stage1_outputs (thread_id) VALUES (?)').run('thread-1')
    db.prepare('INSERT INTO thread_dynamic_tools (thread_id, position) VALUES (?, ?)').run(
      'thread-1',
      0,
    )
  } finally {
    db.close()
  }

  return dbPath
}

describe('thread-store', () => {
  it('deletes the matching thread and related records by rollout path', async () => {
    const dbPath = await createTempDatabase()

    const result = deleteThreadRecordsForRolloutPath('/tmp/session-1.jsonl', dbPath)

    expect(result).toEqual({
      matchedThreadIds: ['thread-1'],
      deletedThreadCount: 1,
    })

    const db = new DatabaseSync(dbPath)

    try {
      expect(db.prepare('SELECT COUNT(*) AS count FROM threads WHERE id = ?').get('thread-1')).toMatchObject({
        count: 0,
      })
      expect(db.prepare('SELECT COUNT(*) AS count FROM threads WHERE id = ?').get('thread-2')).toMatchObject({
        count: 1,
      })
      expect(db.prepare('SELECT COUNT(*) AS count FROM logs WHERE thread_id = ?').get('thread-1')).toMatchObject({
        count: 0,
      })
      expect(
        db.prepare(
          'SELECT COUNT(*) AS count FROM thread_spawn_edges WHERE parent_thread_id = ? OR child_thread_id = ?',
        ).get('thread-1', 'thread-1'),
      ).toMatchObject({
        count: 0,
      })
      expect(
        db.prepare('SELECT assigned_thread_id FROM agent_job_items WHERE job_id = ? AND item_id = ?').get(
          'job-1',
          'item-1',
        ),
      ).toMatchObject({
        assigned_thread_id: null,
      })
      expect(db.prepare('SELECT COUNT(*) AS count FROM stage1_outputs WHERE thread_id = ?').get('thread-1')).toMatchObject({
        count: 0,
      })
      expect(
        db.prepare('SELECT COUNT(*) AS count FROM thread_dynamic_tools WHERE thread_id = ?').get('thread-1'),
      ).toMatchObject({
        count: 0,
      })
    } finally {
      db.close()
    }
  })

  it('returns no-op when the database file does not exist', () => {
    expect(deleteThreadRecordsForRolloutPath('/tmp/session-1.jsonl', '/tmp/does-not-exist.sqlite')).toEqual({
      matchedThreadIds: [],
      deletedThreadCount: 0,
    })
  })
})
