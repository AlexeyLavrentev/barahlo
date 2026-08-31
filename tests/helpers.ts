import Database from 'better-sqlite3'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Temp SQLite database with the same pragmas as every production connection
// (Pitfall 6: journal_mode WAL, foreign_keys ON, busy_timeout).
export function createTempDb(): Database.Database {
  const path = join(
    tmpdir(),
    `barahlo-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  )
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  return sqlite
}

// Applies drizzle migrations in lexical order, bypassing the drizzle migrator
// in tests (documented assumption A1). Supports both layouts drizzle-kit
// produces: flat `drizzle/0000_name.sql` files (sqlite) and
// `drizzle/0000_name/migration.sql` folders. Splits on the drizzle
// `--> statement-breakpoint` marker; triggers arrive as a single statement
// per segment, so sqlite executes them fine.
export function applyMigrations(sqlite: Database.Database): void {
  const dir = join(process.cwd(), 'drizzle')
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (entry.isFile() && entry.name.endsWith('.sql')) {
      files.push(join(dir, entry.name))
    } else if (entry.isDirectory()) {
      const f = join(dir, entry.name, 'migration.sql')
      if (existsSync(f)) files.push(f)
    }
  }
  for (const file of files) {
    const sql = readFileSync(file, 'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim()
      if (trimmed) sqlite.exec(trimmed)
    }
  }
}

export function insertDevice(
  sqlite: Database.Database,
  overrides: Partial<{ serial: string; serialNormalized: string; inventoryNormalized: string | null; status: string }> = {},
): void {
  sqlite
    .prepare(
      `INSERT INTO devices (type_key, model, serial_number, serial_normalized, inventory_normalized, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`,
    )
    .run(
      'laptop',
      'MacBook Air M1',
      overrides.serial ?? 'abc-123',
      overrides.serialNormalized ?? 'ABC-123',
      overrides.inventoryNormalized ?? null,
      overrides.status ?? 'in_stock',
    )
}
