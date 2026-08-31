import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { checkIntegrity, runBackup } from '@/scripts/backup.mjs'

// Integration tests for the nightly backup job (D-05/06/07/14).
// Each test gets its own temp data dir; the "live" DB is a real WAL-mode
// SQLite database with a table and rows, exactly like the production shape.

const BACKUP_SCRIPT = join(process.cwd(), 'scripts', 'backup.mjs')

function makeDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'backup-test-'))
}

function makeLiveDb(dataDir: string): Database.Database {
  const db = new Database(join(dataDir, 'app.db'))
  db.pragma('journal_mode = WAL')
  db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT NOT NULL)')
  db.prepare("INSERT INTO items (label) VALUES ('первая')").run()
  return db
}

// Independent local-date formatting (does not reuse the script's helper —
// the rotation test would otherwise verify the helper against itself).
function localDay(base: Date, minusDays: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - minusDays)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('runBackup', () => {
  it('creates backups/<day>/app.db whose copy passes integrity_check readonly', async () => {
    const dataDir = makeDataDir()
    makeLiveDb(dataDir).close()

    const result = await runBackup({ dataDir })

    expect(result.skipped).toBe(false)
    expect(existsSync(join(result.dest, 'app.db'))).toBe(true)
    const copy = new Database(join(result.dest, 'app.db'), { readonly: true })
    const check = copy.pragma('integrity_check', { simple: true })
    copy.close()
    expect(check).toBe('ok')
  })

  it('captures commits still living in -wal (consistent snapshot, not a raw file copy)', async () => {
    const dataDir = makeDataDir()
    const live = makeLiveDb(dataDir)
    // The connection stays OPEN: the insert above is checkpointed nowhere —
    // it exists only in app.db-wal. A raw cp of app.db would lose it;
    // the online backup API must see through the WAL.
    expect(existsSync(join(dataDir, 'app.db-wal'))).toBe(true)

    const result = await runBackup({ dataDir })

    const copy = new Database(join(result.dest, 'app.db'), { readonly: true })
    const labels = copy.prepare('SELECT label FROM items ORDER BY id').all().map((r) => r.label)
    copy.close()
    live.close()
    expect(labels).toContain('первая')
  })

  it('copies uploads/ recursively into the day folder', async () => {
    const dataDir = makeDataDir()
    makeLiveDb(dataDir).close()
    mkdirSync(join(dataDir, 'uploads', 'sub'), { recursive: true })
    writeFileSync(join(dataDir, 'uploads', 'a.txt'), 'a')
    writeFileSync(join(dataDir, 'uploads', 'sub', 'b.txt'), 'bb')

    const result = await runBackup({ dataDir })

    expect(readFileSync(join(result.dest, 'uploads', 'a.txt'), 'utf8')).toBe('a')
    expect(readFileSync(join(result.dest, 'uploads', 'sub', 'b.txt'), 'utf8')).toBe('bb')
  })

  it('tolerates a missing uploads/ dir by creating an empty one in the copy', async () => {
    const dataDir = makeDataDir()
    makeLiveDb(dataDir).close()
    expect(existsSync(join(dataDir, 'uploads'))).toBe(false)

    const result = await runBackup({ dataDir })

    expect(existsSync(join(result.dest, 'uploads'))).toBe(true)
    expect(readdirSync(join(result.dest, 'uploads'))).toEqual([])
  })

  it('is idempotent within a day: second run skips and leaves the copy untouched', async () => {
    const dataDir = makeDataDir()
    makeLiveDb(dataDir).close()

    const first = await runBackup({ dataDir })
    const dbPath = join(first.dest, 'app.db')
    const mtimeBefore = statSync(dbPath).mtimeMs
    await sleep(30)

    const second = await runBackup({ dataDir })

    expect(second.skipped).toBe(true)
    expect(second.dest).toBe(first.dest)
    expect(existsSync(dbPath)).toBe(true)
    expect(statSync(dbPath).mtimeMs).toBe(mtimeBefore)
  })

  it('rotates to exactly 30 newest day folders, deleting the oldest (D-06)', async () => {
    const dataDir = makeDataDir()
    makeLiveDb(dataDir).close()
    const now = new Date(2026, 7, 31, 12, 0, 0) // local noon, 2026-08-31
    const backupsDir = join(dataDir, 'backups')
    for (let k = 32; k >= 1; k--) {
      const dir = join(backupsDir, localDay(now, k))
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'marker.txt'), String(k))
    }

    const result = await runBackup({ dataDir, now })

    const names = readdirSync(backupsDir).sort()
    expect(names).toHaveLength(30)
    expect(names[0]).toBe(localDay(now, 29))
    expect(names).toContain(localDay(now, 0))
    expect(names).not.toContain(localDay(now, 30))
    expect(names).not.toContain(localDay(now, 32))
    expect(existsSync(join(result.dest, 'app.db'))).toBe(true)
  })

  it('fails loudly on a corrupted copy: checkIntegrity throws; CLI exits 1 with stderr (D-14)', () => {
    const dataDir = makeDataDir()
    makeLiveDb(dataDir).close()
    // Garbage posing as today's backup copy.
    const fakeDest = join(dataDir, 'backups', '2000-01-01')
    mkdirSync(fakeDest, { recursive: true })
    const garbage = join(fakeDest, 'app.db')
    writeFileSync(garbage, Buffer.from('not a sqlite database at all. '.repeat(40), 'utf8'))

    expect(() => checkIntegrity(garbage)).toThrow(/integrity_check/i)

    // Full CLI path must never stay silent either: an unreadable live DB
    // ends the process with code 1 and a message on stderr (cron/docker logs).
    const badData = mkdtempSync(join(tmpdir(), 'backup-cli-bad-'))
    writeFileSync(join(badData, 'app.db'), Buffer.from('garbage'.repeat(200), 'utf8'))
    const cli = spawnSync(process.execPath, [BACKUP_SCRIPT], {
      env: { ...process.env, DATA_DIR: badData },
      encoding: 'utf8',
    })
    expect(cli.status).toBe(1)
    expect((cli.stderr ?? '').length).toBeGreaterThan(0)
  })
})
