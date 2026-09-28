import { describe, it, expect, afterAll } from 'vitest'
import type Database from 'better-sqlite3'
import { applyMigrations, createTempDb, insertDevice } from './helpers'

let sqlite: Database.Database | undefined

function db(): Database.Database {
  if (!sqlite) {
    sqlite = createTempDb()
    applyMigrations(sqlite)
  }
  return sqlite
}

// insertDevice twin with explicit NULL control for the D-08 mirror tests: the
// helper's `overrides.serial ?? 'abc-123'` fallback cannot express NULL.
function insertRow(
  d: Database.Database,
  serial: string | null,
  serialNormalized: string | null,
  status = 'in_stock',
): void {
  d.prepare(
    `INSERT INTO devices (type_key, model, serial_number, serial_normalized, inventory_normalized, status, created_at, updated_at)
     VALUES ('laptop', 'MacBook Air M1', ?, ?, NULL, ?, unixepoch(), unixepoch())`,
  ).run(serial, serialNormalized, status)
}

afterAll(() => {
  sqlite?.close()
})

describe('migration 0000 — full schema v1', () => {
  it('creates all seven tables', () => {
    const tables = db()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      )
      .all()
      .map((r) => (r as { name: string }).name)
    for (const t of [
      'users',
      'departments',
      'device_types',
      'employees',
      'devices',
      'movements',
      'attachments',
    ]) {
      expect(tables).toContain(t)
    }
  })

  it('seeds exactly 4 device_types with the fixed keys', () => {
    const rows = db()
      .prepare('SELECT key FROM device_types ORDER BY key')
      .all()
      .map((r) => (r as { key: string }).key)
    expect(rows).toEqual(['dock', 'laptop', 'monitor', 'peripheral'])
  })

  it('rejects a duplicate serial_normalized (same normalized view ⇒ rejected, D-17)', () => {
    const d = db()
    insertDevice(d, { serial: 'abc-123', serialNormalized: 'ABC-123' })
    // Different display form (case/spaces typo), same normalized value — must collide
    expect(() =>
      insertDevice(d, { serial: 'ABC  123', serialNormalized: 'ABC-123' }),
    ).toThrow(/UNIQUE constraint failed/)
  })

  it('allows multiple NULL inventory_normalized but rejects a duplicate non-null one', () => {
    const d = db()
    insertDevice(d, { serialNormalized: 'NULL-INV-1', inventoryNormalized: null })
    insertDevice(d, { serialNormalized: 'NULL-INV-2', inventoryNormalized: null })
    expect(() =>
      insertDevice(d, {
        serialNormalized: 'INV-DUP-1',
        inventoryNormalized: 'ИБ-0000146',
      }),
    ).not.toThrow()
    expect(() =>
      insertDevice(d, {
        serialNormalized: 'INV-DUP-2',
        inventoryNormalized: 'ИБ-0000146',
      }),
    ).toThrow(/UNIQUE constraint failed/)
  })

  it('rejects an unknown status via devices_status_ck CHECK', () => {
    expect(() => insertDevice(db(), { status: 'bogus' })).toThrow(
      /devices_status_ck|CHECK constraint failed/,
    )
  })

  it('rejects a movement referencing a missing device (FK RESTRICT)', () => {
    expect(() =>
      db()
        .prepare(
          'INSERT INTO movements (device_id, event_type, occurred_at, created_at) VALUES (?, ?, unixepoch(), unixepoch())',
        )
        .run(999999, 'received'),
    ).toThrow(/FOREIGN KEY constraint failed/)
  })

  it('allows INSERT into movements — and raw UPDATE/DELETE now succeed (append-only lifted by migration 0002)', () => {
    const d = db()
    insertDevice(d, { serialNormalized: 'MOV-APPEND-1' })
    const deviceId = d.prepare('SELECT id FROM devices WHERE serial_normalized = ?').get('MOV-APPEND-1') as { id: number }
    d.prepare(
      'INSERT INTO movements (device_id, event_type, occurred_at, created_at) VALUES (?, ?, unixepoch(), unixepoch())',
    ).run(deviceId.id, 'received')

    // Phase 12 (SC5): the 0000 triggers are dropped by migration 0002 — raw
    // SQL mutation is now legal at the DB level; the app gates it server-side
    // (editMovement/deleteMovement with a compound WHERE).
    expect(() =>
      d.prepare('UPDATE movements SET comment = ?').run('x'),
    ).not.toThrow()
    expect(() => d.prepare('DELETE FROM movements').run()).not.toThrow()
  })

  it('drops the two append-only triggers (migration 0002)', () => {
    const triggers = db()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
      .all()
      .map((r) => (r as { name: string }).name)
    expect(triggers).not.toContain('movements_no_update')
    expect(triggers).not.toContain('movements_no_delete')
  })
})

// Migration 0001 (REG-06, D-08): serial → nullable. The suite above already
// runs against the post-0001 schema (applyMigrations applies every file), so
// the tests passing at all proves the recreation kept the 0000 semantics;
// this describe pins the D-08 specifics that migration exists for.
describe('migration 0001 — serial nullable (D-08, REG-06)', () => {
  it('leaves both serial columns nullable (pragma notnull=0 — Pitfall 1 acceptance)', () => {
    const rows = db()
      .prepare(
        'SELECT name, "notnull" FROM pragma_table_info(\'devices\') WHERE name LIKE \'serial%\'',
      )
      .all() as { name: string; notnull: number }[]
    const byName = Object.fromEntries(rows.map((r) => [r.name, r.notnull]))
    expect(byName).toEqual({ serial_number: 0, serial_normalized: 0 })
  })

  it('allows multiple NULL serial pairs but rejects a duplicate non-null one', () => {
    const d = db()
    // NULL/NULL pairs never collide — the plain UNIQUE index on a nullable
    // column constrains non-null values only (RESEARCH Pattern 1, probe).
    insertRow(d, null, null)
    insertRow(d, null, null)
    insertRow(d, 'SN-CLONE-A', 'SN-CLONE-A')
    // Different display form, same normalized value — still collides (D-17).
    expect(() => insertRow(d, 'sn clone a', 'SN-CLONE-A')).toThrow(
      /UNIQUE constraint failed/,
    )
  })

  it('keeps the status CHECK enforced and stays trigger-free after the recreation', () => {
    const d = db()
    const triggers = d
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
      .all()
      .map((r) => (r as { name: string }).name)
    // The 0001 recreation never re-created the append-only triggers (they
    // belonged to 0000 and 0002 drops them for the whole chain).
    expect(triggers).not.toContain('movements_no_update')
    expect(triggers).not.toContain('movements_no_delete')
    expect(() => insertRow(d, 'SN-BOGUS', 'SN-BOGUS', 'bogus')).toThrow(
      /devices_status_ck|CHECK constraint failed/,
    )
  })
})
