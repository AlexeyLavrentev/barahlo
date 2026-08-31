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

  it('allows INSERT into movements but aborts UPDATE and DELETE (append-only)', () => {
    const d = db()
    insertDevice(d, { serialNormalized: 'MOV-APPEND-1' })
    const deviceId = d.prepare('SELECT id FROM devices WHERE serial_normalized = ?').get('MOV-APPEND-1') as { id: number }
    expect(() =>
      d
        .prepare(
          'INSERT INTO movements (device_id, event_type, occurred_at, created_at) VALUES (?, ?, unixepoch(), unixepoch())',
        )
        .run(deviceId.id, 'received'),
    ).not.toThrow()

    expect(() => d.prepare('UPDATE movements SET comment = ?').run('x')).toThrow(
      /append-only: UPDATE denied/,
    )
    expect(() => d.prepare('DELETE FROM movements').run()).toThrow(
      /append-only: DELETE denied/,
    )
  })

  it('defines the two append-only triggers', () => {
    const triggers = db()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
      .all()
      .map((r) => (r as { name: string }).name)
    expect(triggers).toContain('movements_no_update')
    expect(triggers).toContain('movements_no_delete')
  })
})
