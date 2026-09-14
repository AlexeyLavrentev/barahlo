#!/usr/bin/env node
// End-to-end smoke for the full dashboard screen (phase 6, plan 06-02).
// Proves the / perimeter AND the render/deep-link path on a production
// build over a FRESH temp database (Pitfall 8: an empty feed and zero
// counters are the honest fresh-install norm, never seeded rows):
//   1. temp SQLite DB ← full migration 0000 (seeds the 4 device_types);
//      deliberately NO probe device — every counter reads 0
//   2. `next start` on :3119 with DATABASE_PATH + AUTH_SECRET
//   3. GET / WITHOUT cookie               → 307, Location /login (perimeter)
//   4. mint a session cookie (same jose HS256 scheme as lib/session.ts)
//   5. GET / WITH cookie                  → 200, «Дашборд» + active nav item,
//                                           «Всего:», the three warranty
//                                           counter labels, «Ближайшие сроки»,
//                                           «Последние перемещения»
//   6. deep-link href families in the HTML: ?type= (type tiles), ?status=
//      (status tiles), ?warranty=w30/w60 and ?warranty=expired (counters) —
//      all built by buildDevicesQuery (D-03/D-04, never hand-concatenated)
//   7. fresh-DB truth: counters render «: 0», the warranty block shows its
//      empty copy, the feed shows «Перемещений пока нет»
// The script complements — does not replace — smoke-devices.mjs step 8
// (updated in 06-01): that one asserts the dashboard root from the devices
// smoke; this one is the dedicated full-screen check. Any assertion failure
// exits 1 with a readable message; the server process and the temp
// directory are always cleaned up.

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { SignJWT } from 'jose'

const PORT = 3119
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

const dir = mkdtempSync(join(tmpdir(), 'barahlo-smoke-dashboard-'))
const dbPath = join(dir, 'smoke.db')
let server = null
// Module scope so the failure path (catch) can print it.
let serverLog = ''

try {
  // 1. Temp database: migrations only — a FRESH install. createDevice writes
  //    no movement event and seeds no devices, so zero counters + honest
  //    empty states are the expected render (Pitfall 8).
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  applyMigrations(sqlite, join(process.cwd(), 'drizzle'))
  sqlite.close()

  // 2. One-shot AUTH_SECRET (same ≥32-char rule as lib/session.ts).
  const authSecret = process.env.AUTH_SECRET || randomBytes(32).toString('base64')

  // 3. Production server on the temp database, its own :31xx port.
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

  // 5. Perimeter: no cookie → 307 to /login (T-06-01: proxy default-deny +
  //    requireSession; the dashboard is never a 200 for the anonymous).
  const noCookie = await fetch(`${BASE}/`, { redirect: 'manual' })
  if (noCookie.status !== 307) {
    throw new Error(`/ без cookie: ожидался 307, получен ${noCookie.status}`)
  }
  const location = noCookie.headers.get('location') || ''
  if (!location.includes('/login')) {
    throw new Error(`/ без cookie: Location «${location}» не ведёт на /login`)
  }

  // 6. Mint the session cookie exactly like lib/session.ts does.
  const key = new TextEncoder().encode(authSecret)
  const token = await new SignJWT({ userId: 1 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(key)
  const cookieHeaders = { cookie: `session=${token}`, redirect: 'manual' }

  // 7. Render: with cookie → 200 with the full dashboard anatomy. React
  //    splits interpolated text with <!-- --> markers in SSR HTML, so the
  //    needles are the static words and the counter rows' template-literal
  //    text (label + colon + count is ONE text node per row).
  const withCookie = await fetch(`${BASE}/`, { headers: cookieHeaders })
  if (withCookie.status !== 200) {
    throw new Error(`/ с cookie: ожидался 200 (дашборд), получен ${withCookie.status}`)
  }
  const html = await withCookie.text()
  const needles = [
    'Дашборд',
    // D-03: the total is a quiet non-link headline; «Всего: 0 устройств» is
    // the valid fresh-install value on this empty database.
    'Всего:',
    // The nav island renders «Дашборд» as the active page on /.
    'aria-current="page"',
    // DASH-02: the three counter labels (D-04's locked order is their
    // source order in the HTML), the sub-header and the feed header.
    'Истекает ≤ 30 дней:',
    'Истекает ≤ 60 дней:',
    'Истекла:',
    'Ближайшие сроки',
    'Последние перемещения',
    // Deep-link href families (step 8): one marker per family, built by
    // buildDevicesQuery — type tiles, status tiles, warranty presets.
    '/devices?type=',
    '/devices?status=',
    '/devices?warranty=w30',
    '/devices?warranty=w60',
    '/devices?warranty=expired',
  ]
  for (const needle of needles) {
    if (!html.includes(needle)) {
      throw new Error(`/ с cookie: «${needle}» нет в HTML дашборда`)
    }
  }

  // 8. Fresh-DB truth (Pitfall 8): the empty install renders honest zeros
  //    and empty states — never a hidden block. The counter rows render
  //    «: 0» and stay clickable (the target list has its own empty state),
  //    the top-5 carries its empty copy, the feed its own.
  for (const zeroRow of [
    'Истекает ≤ 30 дней: 0',
    'Истекает ≤ 60 дней: 0',
    'Истекла: 0',
  ]) {
    if (!html.includes(zeroRow)) {
      throw new Error(`/ с cookie: счётчик «${zeroRow}» не отрендерился на свежей базе`)
    }
  }
  if (!html.includes('Нет техники с истекающей гарантией')) {
    throw new Error('/ с cookie: пустого топ-5 («Нет техники с истекающей гарантией») нет в HTML')
  }
  if (!html.includes('Перемещений пока нет')) {
    throw new Error('/ с cookie: пустой ленты («Перемещений пока нет») нет в HTML — на свежей temp-БД лента обязана быть пустой')
  }

  console.log(
    'SMOKE OK: / без cookie → 307 /login; с cookie → 200 дашборд («Дашборд» + активный nav + «Всего:» + три гарантийных счётчика + «Ближайшие сроки» + «Последние перемещения»); deep-link семейства ?type= / ?status= / ?warranty=w30|w60|expired; свежая база: счётчики «: 0», «Нет техники с истекающей гарантией», «Перемещений пока нет»',
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
