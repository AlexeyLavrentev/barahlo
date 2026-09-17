import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import type Database from 'better-sqlite3'
import { createTempDb, insertDevice } from './helpers'
import { runMigrations } from '@/scripts/migrate.mjs'

// The runner (scripts/migrate.mjs) is the PRODUCTION migration path since
// migration 0001 (RESEARCH Pattern 2): `drizzle-kit migrate` silently fails on
// a filled database — its explicit BEGIN makes the file's PRAGMA
// foreign_keys=OFF a no-op, better-sqlite3 13 has FK ON by default, and the
// recreation's DROP TABLE devices trips the immediate RESTRICT from the child
// movements/attachments rows (Pitfall 1). These tests reproduce exactly that
// hardest case — a FILLED base with child rows — plus the CLI-compatible
// tracking row (Pitfall 3: green tests must not hide an unapplied prod base).

const DRIZZLE_DIR = join(process.cwd(), 'drizzle')

// Applies ONE journal entry statement-at-a-time (applyMigrations recipe) —
// the runner test needs a base with ONLY 0000 so that the runner itself
// performs the 0001 step under test.
function applyJournalEntry(sqlite: Database.Database, idx: number): void {
  const journal = JSON.parse(
    readFileSync(join(DRIZZLE_DIR, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: { idx: number; tag: string; when: number }[] }
  const entry = journal.entries.find((e) => e.idx === idx)!
  const sql = readFileSync(join(DRIZZLE_DIR, `${entry.tag}.sql`), 'utf8')
  for (const statement of sql.split('--> statement-breakpoint')) {
    const trimmed = statement.trim()
    if (trimmed) sqlite.exec(trimmed)
  }
}

function journalEntry(idx: number): { tag: string; when: number } {
  const journal = JSON.parse(
    readFileSync(join(DRIZZLE_DIR, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: { idx: number; tag: string; when: number }[] }
  return journal.entries.find((e) => e.idx === idx)!
}

// Simulates the state the CLI leaves behind after applying a migration: the
// tracking row in __drizzle_migrations (hash = sha256 of the file,
// created_at = journal.when). Without it the runner would see EVERY entry as
// pending — correct semantics for a fresh database, wrong fixture here.
function trackJournalEntry(sqlite: Database.Database, idx: number): void {
  const entry = journalEntry(idx)
  const query = readFileSync(join(DRIZZLE_DIR, `${entry.tag}.sql`), 'utf8')
  sqlite
    .prepare(
      'INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)',
    )
    .run(createHash('sha256').update(query).digest('hex'), entry.when)
}

// Filled base: 0000 only + one device with a child movement AND a child
// attachment — the RESTRICT rows that kill the CLI path.
const sqlite = createTempDb()
sqlite.exec(`CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric
		)`)
applyJournalEntry(sqlite, 0)
trackJournalEntry(sqlite, 0)
insertDevice(sqlite, { serialNormalized: 'RUNNER-1' })
const source = sqlite
  .prepare('SELECT id FROM devices WHERE serial_normalized = ?')
  .get('RUNNER-1') as { id: number }
sqlite
  .prepare(
    "INSERT INTO movements (device_id, event_type, occurred_at, created_at) VALUES (?, 'received', unixepoch(), unixepoch())",
  )
  .run(source.id)
sqlite
  .prepare(
    "INSERT INTO attachments (device_id, file_name, storage_key, created_at) VALUES (?, 'p.jpg', 'uploads/p.jpg', unixepoch())",
  )
  .run(source.id)

afterAll(() => {
  sqlite.close()
})

describe('scripts/migrate.mjs — host-side runner (Pattern 2)', () => {
  it('applies 0001 to a filled base and preserves data, children, triggers and CHECK', () => {
    expect(runMigrations(sqlite).applied).toBe(1)

    // Pragma acceptance (Pitfall 1): both serial columns really nullable.
    const byName = Object.fromEntries(
      (
        sqlite
          .prepare(
            'SELECT name, "notnull" FROM pragma_table_info(\'devices\') WHERE name LIKE \'serial%\'',
          )
          .all() as { name: string; notnull: number }[]
      ).map((r) => [r.name, r.notnull]),
    )
    expect(byName).toEqual({ serial_number: 0, serial_normalized: 0 })

    // The device row survived the recreation as-is.
    expect(
      sqlite
        .prepare(
          'SELECT serial_number, serial_normalized, inventory_number, inventory_normalized, status FROM devices WHERE id = ?',
        )
        .get(source.id),
    ).toEqual({
      serial_number: 'abc-123',
      serial_normalized: 'RUNNER-1',
      inventory_number: null,
      inventory_normalized: null,
      status: 'in_stock',
    })

    // Child rows intact — they were the RESTRICT threat.
    expect(
      (
        sqlite
          .prepare('SELECT count(*) AS n FROM movements WHERE device_id = ?')
          .get(source.id) as { n: number }
      ).n,
    ).toBe(1)
    expect(
      (
        sqlite
          .prepare('SELECT count(*) AS n FROM attachments WHERE device_id = ?')
          .get(source.id) as { n: number }
      ).n,
    ).toBe(1)

    // Append-only triggers and the status CHECK survived the recreation.
    const triggers = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
      .all()
      .map((r) => (r as { name: string }).name)
    expect(triggers).toContain('movements_no_update')
    expect(triggers).toContain('movements_no_delete')
    expect(() =>
      insertDevice(sqlite, { serialNormalized: 'RUNNER-CHECK', status: 'bogus' }),
    ).toThrow(/devices_status_ck|CHECK constraint failed/)
  })

  it('records a CLI-compatible tracking row and restores foreign_keys=ON', () => {
    const entry = journalEntry(1)
    const query = readFileSync(join(DRIZZLE_DIR, `${entry.tag}.sql`), 'utf8')
    const row = sqlite
      .prepare(
        'SELECT hash, created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1',
      )
      .get() as { hash: string; created_at: number }
    // Exactly what drizzle-orm migrator.js would have written.
    expect(row.hash).toBe(createHash('sha256').update(query).digest('hex'))
    expect(Number(row.created_at)).toBe(entry.when)
    // CLI-compatibility: drizzle's pending rule (created_at < folderMillis)
    // no longer selects 0001.
    expect(Number(row.created_at) < entry.when).toBe(false)
    // Runner contract: FK is back ON after COMMIT.
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('is a no-op on re-run (idempotency)', () => {
    expect(runMigrations(sqlite).applied).toBe(0)
  })
})
