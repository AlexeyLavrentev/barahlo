#!/usr/bin/env node
// End-to-end smoke for the employees tracer slice (02-01 Task 3).
// Proves the auth perimeter AND the render path on a production build:
//   1. temp SQLite DB ← full migration 0000 ← probe (department + employee)
//   2. `next start` on :3117 with DATABASE_PATH + AUTH_SECRET
//   3. GET /employees WITHOUT cookie  → 307, Location /login  (perimeter)
//   4. mint a session cookie (same jose HS256 scheme as lib/session.ts)
//   5. GET /employees WITH cookie     → 200, HTML contains the probe name
// Any assertion failure exits 1 with a readable message; the server process
// and the temp directory are always cleaned up.

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { SignJWT } from 'jose'

const PORT = 3117
const BASE = `http://127.0.0.1:${PORT}`
const READY_TIMEOUT_MS = 30_000

function fail(message) {
  console.error(`SMOKE FAIL: ${message}`)
}

function applyMigrations(sqlite, dir) {
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.sql'))
    .map((e) => e.name)
    .sort()
  for (const name of files) {
    const sql = readFileSync(join(dir, name), 'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) {
      // Segments may open with comment lines (hand-added triggers/seeds do)
      // followed by the real statement — strip comments, keep the rest.
      const executable = statement
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim()
      if (executable) sqlite.exec(executable)
    }
  }
}

const dir = mkdtempSync(join(tmpdir(), 'barahlo-smoke-'))
const dbPath = join(dir, 'smoke.db')
let server = null

try {
  // 1. Temp database: migrations + probe rows.
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  applyMigrations(sqlite, join(process.cwd(), 'drizzle'))

  const dept = sqlite
    .prepare("INSERT INTO departments (name, created_at) VALUES ('Отдел дыма', unixepoch()) RETURNING id")
    .get()
  const probe = sqlite
    .prepare(
      "INSERT INTO employees (name, department_id, is_active, created_at) VALUES ('Смок Сотрудник', ?, 1, unixepoch()) RETURNING id",
    )
    .get(dept.id)
  const probeId = probe.id
  sqlite.close()

  // 2. One-shot AUTH_SECRET (same ≥32-char rule as lib/session.ts).
  const authSecret = process.env.AUTH_SECRET || randomBytes(32).toString('base64')

  // 3. Production server on the temp database.
  if (!existsSync(join(process.cwd(), '.next'))) {
    throw new Error('.next не найден — сначала выполните npm run build')
  }
  server = spawn(
    process.execPath,
    [join('node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(PORT)],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_PATH: dbPath, AUTH_SECRET: authSecret },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let serverLog = ''
  server.stdout.on('data', (c) => (serverLog += c))
  server.stderr.on('data', (c) => (serverLog += c))

  // 4. Wait for readiness by polling /login.
  const startedAt = Date.now()
  let ready = false
  while (Date.now() - startedAt < READY_TIMEOUT_MS) {
    try {
      const res = await fetch(`${BASE}/login`, { redirect: 'manual' })
      if (res.status === 200) {
        ready = true
        break
      }
    } catch {
      // server not accepting yet
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  if (!ready) {
    throw new Error(`сервер не поднялся за 30с\n--- лог сервера ---\n${serverLog}`)
  }

  // 5. Perimeter: no cookie → 307 to /login.
  const noCookie = await fetch(`${BASE}/employees`, { redirect: 'manual' })
  if (noCookie.status !== 307) {
    throw new Error(`/employees без cookie: ожидался 307, получен ${noCookie.status}`)
  }
  const location = noCookie.headers.get('location') || ''
  if (!location.includes('/login')) {
    throw new Error(`/employees без cookie: Location «${location}» не ведёт на /login`)
  }

  // 6. Mint the session cookie exactly like lib/session.ts does.
  const key = new TextEncoder().encode(authSecret)
  const token = await new SignJWT({ userId: 1 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(key)

  // 7. Render: with cookie → 200 and the probe employee is on the page.
  const withCookie = await fetch(`${BASE}/employees`, {
    headers: { cookie: `session=${token}` },
    redirect: 'manual',
  })
  if (withCookie.status !== 200) {
    throw new Error(`/employees с cookie: ожидался 200, получен ${withCookie.status}`)
  }
  const html = await withCookie.text()
  if (!html.includes('Смок Сотрудник')) {
    throw new Error('/employees с cookie: зонда «Смок Сотрудник» нет в HTML')
  }
  if (!html.includes('Сотрудники')) {
    throw new Error('/employees с cookie: заголовка «Сотрудники» нет в HTML')
  }

  // 8. Card route: the probe's card renders 200 with its name and the
  //    «Техника» empty section (EMP-02 lands in Phase 4).
  const card = await fetch(`${BASE}/employees/${probeId}`, {
    headers: { cookie: `session=${token}` },
    redirect: 'manual',
  })
  if (card.status !== 200) {
    throw new Error(`/employees/${probeId} с cookie: ожидался 200, получен ${card.status}`)
  }
  const cardHtml = await card.text()
  if (!cardHtml.includes('Смок Сотрудник')) {
    throw new Error(`/employees/${probeId}: имени зонда нет в HTML карточки`)
  }
  if (!cardHtml.includes('Пока ничего не выдано')) {
    throw new Error(`/employees/${probeId}: секции «Техника» («Пока ничего не выдано») нет в HTML`)
  }

  // 9. 404 matrix: unknown and garbage ids answer 404 through notFound(),
  //    never 500 (V4/V5 — validation before any database access).
  for (const bad of ['99999', 'abc']) {
    const res = await fetch(`${BASE}/employees/${bad}`, {
      headers: { cookie: `session=${token}` },
      redirect: 'manual',
    })
    if (res.status !== 404) {
      throw new Error(`/employees/${bad}: ожидался 404, получен ${res.status}`)
    }
  }

  console.log(
    'SMOKE OK: 307 → /login без cookie; 200 + «Смок Сотрудник» с cookie; карточка 200 + «Пока ничего не выдано»; 404 на 99999/abc',
  )
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
  if (server && serverLog) console.error(`--- лог сервера ---\n${serverLog}`)
  process.exitCode = 1
} finally {
  if (server) {
    server.kill('SIGTERM')
    await new Promise((resolve) => {
      const t = setTimeout(() => {
        server.kill('SIGKILL')
        resolve()
      }, 3000)
      server.on('exit', () => {
        clearTimeout(t)
        resolve()
      })
    })
  }
  rmSync(dir, { recursive: true, force: true })
}
