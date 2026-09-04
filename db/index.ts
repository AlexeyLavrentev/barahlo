import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { normalizeNumber } from '@/lib/normalize'

type DrizzleDb = ReturnType<typeof drizzle>

let _db: DrizzleDb | null = null

function openDb(): DrizzleDb {
  const file = process.env.DATABASE_PATH ?? './data/app.db'
  // Каталог может не существовать (первый запуск, build-контейнер) — создаём.
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL') // persistent per-DB file; README-recommended
  sqlite.pragma('foreign_keys = ON') // SQLite default is OFF — per connection!
  sqlite.pragma('busy_timeout = 5000') // host-side migrate can briefly overlap a running container
  // FIND-01: the query-side fold IS the write-side fold — normalizeNumber is
  // registered as a deterministic UDF so SQL can fold the model column
  // (serial/inventory compare their stored *_normalized twins directly).
  // SQLite's native upper()/LIKE fold ASCII only, so a Cyrillic model would
  // never match through SQL folding (05-RESEARCH Pattern 1, probe-verified
  // against better-sqlite3 13).
  sqlite.function('norm', { deterministic: true }, normalizeNumber)
  return drizzle(sqlite)
}

export function getDb(): DrizzleDb {
  if (!_db) _db = openDb()
  return _db
}

// Lazy singleton: импорт модулей не должен открывать базу — Next собирает
// page data в Docker-билдере, где каталога данных нет (Ponytail: Proxy
// сохраняет все существующие вызовы `db.*` без правки импортёров).
export const db = new Proxy({} as DrizzleDb, {
  get(_t, prop) {
    const value = Reflect.get(getDb(), prop)
    return typeof value === 'function' ? value.bind(getDb()) : value
  },
})
