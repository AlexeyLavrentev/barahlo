#!/usr/bin/env node
// End-to-end smoke for the custody tracer slice (04-01).
// Proves the auth perimeter AND the custody render path on a production build:
//   1. temp SQLite DB ← full migration 0000 ← probe employees + devices:
//      in_stock device (empty timeline), assigned device (one seeded
//      «Выдача» event), a second empty employee (empty «Техника»)
//   2. `next start` on :3116 with DATABASE_PATH + AUTH_SECRET
//   3. GET /devices/{id} WITHOUT cookie → 307, Location /login (perimeter)
//   4. mint a session cookie (same jose HS256 scheme as lib/session.ts)
//   5. in_stock card  → 200: «Выдать» + data-device-assign-id; NO «Принять»/
//      «Передать»; timeline empty state (04-UI-SPEC copy)
//   6. assigned card  → 200: «Принять»/«Передать» + data-attrs; «Выдать»
//      ABSENT (D-08); timeline renders «Выдача» with the holder's name
//   7. employee cards → issued list (model, mono serial, «выдано», count,
//      «Вернуть всю технику») and the empty variant («Пока ничего не выдано»,
//      no return-all button)
//   8. 404 matrix on garbage device ids (unchanged (card) contract)
// Custody state transitions themselves are covered by the vitest suite
// (tests/movements-queries.test.ts: guards, atomicity, timeline order) and by
// UAT (interactive dialogs); the smoke pins the rendered matrix and routes.
// Any assertion failure exits 1 with a readable message; the server process
// and the temp directory are always cleaned up.

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { SignJWT } from 'jose'

const PORT = 3116
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

const dir = mkdtempSync(join(tmpdir(), 'barahlo-smoke-custody-'))
const dbPath = join(dir, 'smoke.db')
let server = null
// Module scope so the failure path (catch) can print it.
let serverLog = ''

try {
  // 1. Temp database: migrations + probe rows (migration seeds device_types).
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  applyMigrations(sqlite, join(process.cwd(), 'drizzle'))

  const dept = sqlite
    .prepare(
      "INSERT INTO departments (name, created_at) VALUES ('Отдел custody', unixepoch()) RETURNING id",
    )
    .get()

  const insertEmployee = sqlite.prepare(
    "INSERT INTO employees (name, department_id, is_active, created_at) VALUES (?, ?, 1, unixepoch()) RETURNING id",
  )
  // Names avoid the substrings the card asserts on («Выдать», «Принять», …).
  const holder = insertEmployee.get('Смок Хранитель', dept.id)
  const empty = insertEmployee.get('Смок Пустой', dept.id)

  const insertDevice = sqlite.prepare(
    `INSERT INTO devices (type_key, model, serial_number, serial_normalized, status, current_employee_id, created_at, updated_at)
     VALUES ('laptop', ?, ?, ?, 'in_stock', NULL, unixepoch(), unixepoch())`,
  )
  const stockId = Number(
    insertDevice.run('Смок Ноут Склад', 'SMOKE-CUST-1', 'SMOKE-CUST-1').lastInsertRowid,
  )
  const heldId = Number(
    insertDevice.run('Смок Ноут Рука', 'SMOKE-CUST-2', 'SMOKE-CUST-2').lastInsertRowid,
  )

  // Assign the second device to the holder the way the assign action's
  // transaction would: projection + one «Выдача» event, backdated a day.
  sqlite
    .prepare(
      "UPDATE devices SET status = 'assigned', current_employee_id = ? WHERE id = ?",
    )
    .run(holder.id, heldId)
  sqlite
    .prepare(
      `INSERT INTO movements (device_id, event_type, from_employee_id, to_employee_id, comment, occurred_at, created_at)
       VALUES (?, 'assigned', NULL, ?, 'Смок акт', unixepoch() - 86400, unixepoch())`,
    )
    .run(heldId, holder.id)
  sqlite.close()

  const holderId = Number(holder.id)
  const emptyId = Number(empty.id)

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

  // 5. Perimeter: no cookie → 307 to /login (device card route).
  const noCookie = await fetch(`${BASE}/devices/${stockId}`, { redirect: 'manual' })
  if (noCookie.status !== 307) {
    throw new Error(`/devices/${stockId} без cookie: ожидался 307, получен ${noCookie.status}`)
  }
  const location = noCookie.headers.get('location') || ''
  if (!location.includes('/login')) {
    throw new Error(`/devices/${stockId} без cookie: Location «${location}» не ведёт на /login`)
  }

  // 6. Mint the session cookie exactly like lib/session.ts does.
  const key = new TextEncoder().encode(authSecret)
  const token = await new SignJWT({ userId: 1 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(key)
  const cookieHeaders = { cookie: `session=${token}`, redirect: 'manual' }

  // 7. in_stock card: «Выдать» present, assigned-only buttons absent,
  //    empty-timeline copy of the UI-SPEC.
  const stockCard = await fetch(`${BASE}/devices/${stockId}`, { headers: cookieHeaders })
  if (stockCard.status !== 200) {
    throw new Error(`/devices/${stockId} с cookie: ожидался 200, получен ${stockCard.status}`)
  }
  const stockHtml = await stockCard.text()
  const stockNeedles = [
    'Смок Ноут Склад',
    'История перемещений',
    'История появится после первого действия с устройством.',
    'Выдать',
    'data-device-assign-id=',
  ]
  for (const needle of stockNeedles) {
    if (!stockHtml.includes(needle)) {
      throw new Error(`/devices/${stockId} (in_stock): «${needle}» нет в HTML`)
    }
  }
  if (stockHtml.includes('Принять') || stockHtml.includes('Передать')) {
    throw new Error(`/devices/${stockId} (in_stock): лишние «Принять»/«Передать» в HTML`)
  }
  if (stockHtml.includes('Вернуть всю технику')) {
    throw new Error(`/devices/${stockId} (in_stock): кнопка «Вернуть всю технику» не на карточке сотрудника`)
  }

  // 8. assigned card (D-08): «Принять»/«Передать» present, «Выдать» ABSENT,
  //    the seeded «Выдача» event renders with the holder's name.
  const heldCard = await fetch(`${BASE}/devices/${heldId}`, { headers: cookieHeaders })
  if (heldCard.status !== 200) {
    throw new Error(`/devices/${heldId} с cookie: ожидался 200, получен ${heldCard.status}`)
  }
  const heldHtml = await heldCard.text()
  const heldNeedles = [
    'Смок Ноут Рука',
    'data-device-accept-id=',
    'data-device-transfer-id=',
    'История перемещений',
    'Выдача',
    'Смок Хранитель',
    'Смок акт',
  ]
  for (const needle of heldNeedles) {
    if (!heldHtml.includes(needle)) {
      throw new Error(`/devices/${heldId} (assigned): «${needle}» нет в HTML`)
    }
  }
  if (heldHtml.includes('Выдать') || heldHtml.includes('data-device-assign-id=')) {
    throw new Error(`/devices/${heldId} (assigned): D-08 нарушен — «Выдать» присутствует в HTML`)
  }

  // 9. Employee cards: holder sees the issued list + return-all; the empty
  //    employee sees the phase 2 copy and no return-all.
  const holderCard = await fetch(`${BASE}/employees/${holderId}`, { headers: cookieHeaders })
  if (holderCard.status !== 200) {
    throw new Error(`/employees/${holderId} с cookie: ожидался 200, получен ${holderCard.status}`)
  }
  const holderHtml = await holderCard.text()
  const holderNeedles = [
    'Смок Хранитель',
    'Техника',
    'Смок Ноут Рука',
    'SMOKE-CUST-2',
    'выдано ',
    '1 устройство',
    'Вернуть всю технику',
    'data-return-all-id=',
  ]
  for (const needle of holderNeedles) {
    if (!holderHtml.includes(needle)) {
      throw new Error(`/employees/${holderId}: «${needle}» нет в HTML`)
    }
  }

  const emptyCard = await fetch(`${BASE}/employees/${emptyId}`, { headers: cookieHeaders })
  if (emptyCard.status !== 200) {
    throw new Error(`/employees/${emptyId} с cookie: ожидался 200, получен ${emptyCard.status}`)
  }
  const emptyHtml = await emptyCard.text()
  if (!emptyHtml.includes('Пока ничего не выдано')) {
    throw new Error(`/employees/${emptyId}: «Пока ничего не выдано» нет в HTML`)
  }
  if (emptyHtml.includes('Вернуть всю технику') || emptyHtml.includes('data-return-all-id=')) {
    throw new Error(`/employees/${emptyId}: кнопка «Вернуть всю технику» видна при нуле выданного`)
  }

  // 10. 404 invariant: garbage device id answers through notFound() with the
  //     Russian boundary (the (card) contract is untouched by this plan).
  const bad = await fetch(`${BASE}/devices/abc`, { headers: cookieHeaders, redirect: 'manual' })
  if (bad.status !== 404) {
    throw new Error(`/devices/abc: ожидался 404, получен ${bad.status}`)
  }

  console.log(
    'SMOKE OK: 307 → /login без cookie; in_stock-карточка: «Выдать» + пустой таймлайн, без «Принять»/«Передать»; assigned-карточка: «Принять»/«Передать» + событие «Выдача», D-08 («Выдать» нет); карточка сотрудника: выданный список + «выдано» + «1 устройство» + «Вернуть всю технику»; пустая карточка: «Пока ничего не выдано» без кнопки; 404 на /devices/abc',
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
