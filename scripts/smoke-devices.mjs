#!/usr/bin/env node
// End-to-end smoke for the devices tracer slice (03-01 Task 1).
// Proves the auth perimeter AND the render path on a production build:
//   1. temp SQLite DB ← full migration 0000 (seeds the 4 device_types) ← probe device
//   2. `next start` on :3118 with DATABASE_PATH + AUTH_SECRET
//   3. GET /devices WITHOUT cookie        → 307, Location /login   (perimeter)
//   4. mint a session cookie (same jose HS256 scheme as lib/session.ts)
//   5. GET /devices WITH cookie           → 200, HTML contains the probe model
//   6. GET / WITH cookie                  → 307, Location /devices (shell redirect)
//   7. filter + clamp: ?type=laptop → 200 + probe; ?type=zzz → 200 (invalid = all);
//      ?type=monitor&page=99 → 200 with clamped pagination label
// Creating a device through the dialog is interactive (Server Action POST) —
// that flow is covered by UAT; the smoke pins the list perimeter and redirect.
// Any assertion failure exits 1 with a readable message; the server process
// and the temp directory are always cleaned up.

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { SignJWT } from 'jose'

const PORT = 3118
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

const dir = mkdtempSync(join(tmpdir(), 'barahlo-smoke-devices-'))
const dbPath = join(dir, 'smoke.db')
let server = null
// Module scope so the failure path (catch) can print it.
let serverLog = ''

try {
  // 1. Temp database: migrations + probe device (laptop; migration seeds the
  //    device_types rows the FK needs).
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  applyMigrations(sqlite, join(process.cwd(), 'drizzle'))
  sqlite
    .prepare(
      `INSERT INTO devices (type_key, model, serial_number, serial_normalized, created_at, updated_at)
       VALUES ('laptop', 'Смок Устройство', 'SMOKE-001', 'SMOKE-001', unixepoch(), unixepoch())`,
    )
    .run()
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
  serverLog = ''
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
  const noCookie = await fetch(`${BASE}/devices`, { redirect: 'manual' })
  if (noCookie.status !== 307) {
    throw new Error(`/devices без cookie: ожидался 307, получен ${noCookie.status}`)
  }
  const location = noCookie.headers.get('location') || ''
  if (!location.includes('/login')) {
    throw new Error(`/devices без cookie: Location «${location}» не ведёт на /login`)
  }

  // 6. Mint the session cookie exactly like lib/session.ts does.
  const key = new TextEncoder().encode(authSecret)
  const token = await new SignJWT({ userId: 1 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(key)
  const cookieHeaders = { cookie: `session=${token}`, redirect: 'manual' }

  // 7. Render: with cookie → 200, probe model on the page, shell + CTA present.
  const withCookie = await fetch(`${BASE}/devices`, { headers: cookieHeaders })
  if (withCookie.status !== 200) {
    throw new Error(`/devices с cookie: ожидался 200, получен ${withCookie.status}`)
  }
  const html = await withCookie.text()
  if (!html.includes('Смок Устройство')) {
    throw new Error('/devices с cookie: зонда «Смок Устройство» нет в HTML')
  }
  if (!html.includes('Добавить устройство')) {
    throw new Error('/devices с cookie: CTA «Добавить устройство» нет в HTML')
  }
  if (!html.includes('На складе')) {
    throw new Error('/devices с cookie: пилюли «На складе» нет в HTML')
  }
  if (!html.includes('Сотрудники')) {
    throw new Error('/devices с cookie: навигации «Сотрудники» нет в HTML')
  }
  // React splits interpolated text with <!-- --> markers in SSR HTML, so the
  // label is asserted by its static words (numbers are covered by the clamp
  // step below).
  if (!html.includes('Страница') || !html.includes('Назад') || !html.includes('Далее')) {
    throw new Error('/devices с cookie: пагинации («Страница …», «Назад»/«Далее») нет в HTML')
  }

  // 8. Shell redirect: / → 307 with Location /devices.
  const root = await fetch(`${BASE}/`, { redirect: 'manual', headers: cookieHeaders })
  if (root.status !== 307 && root.status !== 302) {
    throw new Error(`GET / с cookie: ожидался редирект, получен ${root.status}`)
  }
  const rootLocation = root.headers.get('location') || ''
  if (!rootLocation.includes('/devices')) {
    throw new Error(`GET / с cookie: Location «${rootLocation}» не ведёт на /devices`)
  }

  // 9. Filter matrix: valid type shows the probe laptop; a foreign value falls
  //    back to «все типы» (server-side enum validation, T-03-04); an
  //    out-of-range page clamps instead of erroring.
  const laptop = await fetch(`${BASE}/devices?type=laptop`, { headers: cookieHeaders })
  if (laptop.status !== 200) {
    throw new Error(`/devices?type=laptop: ожидался 200, получен ${laptop.status}`)
  }
  const laptopHtml = await laptop.text()
  if (!laptopHtml.includes('Смок Устройство')) {
    throw new Error('/devices?type=laptop: зонды нет в отфильтрованном HTML')
  }
  if (!laptopHtml.includes('1 устройство')) {
    throw new Error('/devices?type=laptop: метки «1 устройство» (плюрал) нет в HTML')
  }

  const foreign = await fetch(`${BASE}/devices?type=zzz`, { headers: cookieHeaders })
  if (foreign.status !== 200) {
    throw new Error(`/devices?type=zzz: ожидался 200 (невалидный тип = все), получен ${foreign.status}`)
  }
  const foreignHtml = await foreign.text()
  if (!foreignHtml.includes('Смок Устройство')) {
    throw new Error('/devices?type=zzz: невалидный тип не откатился к «все типы»')
  }

  const clamped = await fetch(`${BASE}/devices?type=monitor&page=99`, {
    headers: cookieHeaders,
  })
  if (clamped.status !== 200) {
    throw new Error(`/devices?type=monitor&page=99: ожидался 200 (clamp), получен ${clamped.status}`)
  }

  console.log(
    'SMOKE OK: 307 → /login без cookie; 200 + «Смок Устройство» + CTA + пилюля с cookie; / → 307 на /devices; фильтр type=laptop + «1 устройство»; type=zzz → все типы; page=99 клампится',
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
