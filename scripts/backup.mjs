// Ночной бэкап: консистентный снимок живой БД через online backup API
// (better-sqlite3 db.backup() — безопасен под WAL, без остановки записи),
// PRAGMA integrity_check по КОПИИ с exit 1 при браке (D-14), копия uploads/,
// ротация до 30 самых свежих дневных папок (D-06). D-05/07: копии живут
// рядом с данными на том же сервере, раз в сутки.
// Папка дня — ЛОКАЛЬНАЯ дата сервера (не UTC): имя папки совпадает с
// календарной датой на машине (конвенция зафиксирована в README — Pitfall 9).
import Database from 'better-sqlite3'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const KEEP_DAYS = 30 // D-06: хранить ровно 30 дневных копий
const DAY_NAME = /^\d{4}-\d{2}-\d{2}$/ // ротация трогает только папки-даты (T-03-02)

export function formatLocalDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// D-14: дешёвая страховка от битых бэкапов — integrity_check выполняется по
// КОПИИ. Любой результат кроме 'ok' (или нечитаемый файл) — ошибка; CLI-хвост
// превращает её в stderr + exit 1 (видимость для cron / docker logs, ASVS V7).
export function checkIntegrity(dbPath) {
  let copy
  let result
  try {
    copy = new Database(dbPath, { readonly: true })
    result = copy.pragma('integrity_check', { simple: true })
  } catch (err) {
    // Нечитаемая копия («file is not a database», отсутствие файла и т.п.)
    // — тот же брак, что и явный отказ integrity_check: не молчим.
    throw new Error(`integrity_check failed: копия не читается (${dbPath}): ${err.message}`)
  } finally {
    copy?.close()
  }
  if (result !== 'ok') {
    throw new Error(`integrity_check failed: ${result} (${dbPath})`)
  }
}

// Возвращает { dest, skipped }. skipped=true — папка дня уже существует
// (идемпотентность перезапуска cron), ничего не пересоздаётся.
export async function runBackup({ dataDir = process.env.DATA_DIR ?? './data', now = new Date() } = {}) {
  const backupsDir = join(dataDir, 'backups')
  const day = formatLocalDate(now)
  const dest = join(backupsDir, day)

  // 1. Идемпотентность: сегодняшняя копия уже есть — выходим без изменений.
  if (existsSync(dest)) return { dest, skipped: true }

  mkdirSync(dest, { recursive: true })

  // Шаги 2–5 под защитой: любой сбой посреди прогона убирает недоделанную
  // папку дня (CR-02). Иначе идемпотентность примет фантомную папку за готовую
  // копию — тот же день навсегда останется без бэкапа («уже есть» при retry),
  // а ротация потеряет на неё слот.
  try {
    // 2. Консистентный снимок живой БД. Только online backup API: сырая копия
    // файлов app.db/-wal под WAL тихо теряет недавние коммиты (Pitfall 2, T-03-01).
    const db = new Database(join(dataDir, 'app.db'))
    db.pragma('busy_timeout = 5000') // ночная запись маловероятна, но прагма дешёвая
    try {
      await db.backup(join(dest, 'app.db'))
    } finally {
      db.close()
    }

    // 3. Проверка целостности КОПИИ — битая копия не становится «новым оригиналом» молча.
    checkIntegrity(join(dest, 'app.db'))

    // 4. uploads/ едёт в комплекте; в фазе 1 его может не быть — тогда создаём
    // пустой в копии, чтобы структура восстанавливалась единообразно.
    const uploadsSrc = join(dataDir, 'uploads')
    const uploadsDest = join(dest, 'uploads')
    if (existsSync(uploadsSrc)) {
      cpSync(uploadsSrc, uploadsDest, { recursive: true })
    } else {
      mkdirSync(uploadsDest, { recursive: true })
    }

    // 5. Ротация: сортировка по имени-дате, всё старше 30 самых свежих — удалить.
    const dayDirs = readdirSync(backupsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && DAY_NAME.test(e.name))
      .map((e) => e.name)
      .sort()
    for (const name of dayDirs.slice(0, -KEEP_DAYS)) {
      rmSync(join(backupsDir, name), { recursive: true, force: true })
    }
  } catch (err) {
    try {
      rmSync(dest, { recursive: true, force: true }) // никогда не оставляем частичную папку дня
    } catch {
      // чистка не должна затирать исходную ошибку
    }
    throw err
  }

  return { dest, skipped: false }
}

// CLI-хвост: импорт из тестов не запускает бэкап, прямой запуск — запускает.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBackup().then(
    (r) => console.log(r.skipped ? `уже есть: ${r.dest}` : `backup ok: ${r.dest}`),
    (err) => {
      console.error(err?.message ?? String(err))
      process.exit(1)
    },
  )
}
