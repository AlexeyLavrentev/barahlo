// Применение drizzle-миграций к живой базе — host-side раннер, постоянный
// способ миграций проекта (замена `npx drizzle-kit migrate` в README/deploy).
//
// Почему не drizzle-kit migrate (RESEARCH 09, Pitfall 1/2, probe-верифицировано
// против better-sqlite3 13.0.3 / drizzle-orm 0.45.2): SQLiteSyncDialect.migrate
// оборачивает ВСЕ стейтменты в явный BEGIN — `PRAGMA foreign_keys=OFF` из
// сгенерированного файла внутри транзакции — no-op; better-sqlite3 13 включает
// foreign_keys=ON на новых соединениях по умолчанию, поэтому recreation-миграция
// (DROP TABLE devices из 0001) на заполненной базе натыкается на немедленный
// RESTRICT от дочерних movements/attachments, а CLI молча глотает ошибку
// (exit 1 без сообщения). defer_foreign_keys тоже не спасает — RESTRICT
// иммедиен. Единственный рычаг: PRAGMA foreign_keys=OFF на соединении
// СТРОГО ДО BEGIN — единственное место, где PRAGMA работает.
//
// Трекинг CLI-совместим (Pattern 2): hash = sha256 файла миграции,
// created_at = journal.when (мс) — ровно то, что пишет drizzle-orm
// (migrator.js readMigrationFiles + dialect.js migrate), поэтому состояние
// __drizzle_migrations после этого раннера легально и для последующего
// `npx drizzle-kit migrate`: он решает «применять ли» сравнением
// created_at < folderMillis (hash не сравнивается). pending = journal-entries
// с when > MAX(created_at) в __drizzle_migrations — повторный запуск no-op.
//
// Прикладной контракт: DATABASE_PATH (по умолчанию ./data/app.db, как в
// drizzle.config.ts и db/index.ts). Pragmas живого соединения — те же, что в
// openDb (journal_mode=WAL, busy_timeout=5000), но foreign_keys=OFF до BEGIN
// и обратно ON после COMMIT. Импорт из тестов ничего не исполняет — запуск
// только через CLI-хвост (конвенция scripts/backup.mjs).
import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

// DDL байт-в-байт как у drizzle-orm SQLiteSyncDialect (sqlite-core/dialect.js):
// CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id SERIAL PRIMARY KEY,
// hash text NOT NULL, created_at numeric).
const MIGRATIONS_TABLE_DDL = `CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric
		)`

// Применяет незанесённые миграции из папки drizzle/ к открытому соединению.
// Возвращает { applied: number } — число применённых файлов (0 = no-op).
// Вся пачка — одна транзакция: сбой любого стейтмента откатывает файл целиком.
export function runMigrations(
  sqlite,
  { dir = join(process.cwd(), 'drizzle') } = {},
) {
  const journal = JSON.parse(
    readFileSync(join(dir, 'meta', '_journal.json'), 'utf8'),
  )
  sqlite.exec(MIGRATIONS_TABLE_DDL)
  // Тот же SELECT, что у dialect.js migrate: последняя по created_at запись.
  const last = sqlite
    .prepare(
      'SELECT id, hash, created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1',
    )
    .get()
  const lastCreatedAt = last ? Number(last.created_at) : -1
  const pending = journal.entries.filter(
    (entry) => Number(entry.when) > lastCreatedAt,
  )
  if (pending.length === 0) return { applied: 0 }

  // FK OFF на соединении ДО BEGIN — внутри транзакции PRAGMA уже не работает
  // (Pitfall 1); восстанавливаем ON после COMMIT/ROLLBACK в любом исходе.
  sqlite.pragma('foreign_keys = OFF')
  sqlite.exec('BEGIN')
  try {
    for (const entry of pending) {
      const query = readFileSync(join(dir, `${entry.tag}.sql`), 'utf8')
      // hash — sha256 исходного файла, ровно как drizzle-orm migrator.js.
      const hash = createHash('sha256').update(query).digest('hex')
      // Стейтмент-за-стейтментом по конвенции drizzle (tests/helpers.ts);
      // PRAGMA-строки из файла внутри транзакции — no-op, FK держит раннер.
      for (const statement of query.split('--> statement-breakpoint')) {
        const trimmed = statement.trim()
        if (trimmed) sqlite.exec(trimmed)
      }
      sqlite
        .prepare(
          'INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)',
        )
        .run(hash, entry.when)
    }
    sqlite.exec('COMMIT')
  } catch (err) {
    sqlite.exec('ROLLBACK')
    throw err
  } finally {
    sqlite.pragma('foreign_keys = ON')
  }
  return { applied: pending.length }
}

// CLI-хвост: импорт из тестов не запускает миграции, прямой запуск — запускает.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.env.DATABASE_PATH ?? './data/app.db'
  // Каталог может не существовать (первый запуск) — создаём, как openDb.
  mkdirSync(dirname(file), { recursive: true })
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('busy_timeout = 5000')
  let applied
  try {
    applied = runMigrations(sqlite).applied
  } catch (err) {
    console.error(err?.message ?? String(err))
    sqlite.close()
    process.exit(1)
  }
  sqlite.close()
  console.log(
    applied === 0
      ? `миграции применены ранее — новых нет (${file})`
      : `применено миграций: ${applied} (${file})`,
  )
}
