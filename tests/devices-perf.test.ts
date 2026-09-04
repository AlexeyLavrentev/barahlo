import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import { applyMigrations } from './helpers'
import type { DeviceListFilters } from '@/db/queries/devices'

// UI-03 perf regression gate («сотни устройств — мгновенно»): the FULL
// combined filtered query (q + type + status + department + warranty + RAM
// over the joined tables) at ≥500 seeded rows must stay in milliseconds.
// The assertion is a TRIPWIRE against accidental N+1s / dropped indexes
// (05-RESEARCH A6), not a benchmark: the ceiling stays generous (200 ms
// average vs a measured ~0.9 ms single run) so CI noise can never train
// people to ignore a red run.
//
// Harness discipline (tests/devices-queries.test.ts lines 1–25): DATABASE_PATH
// is set BEFORE the first @/db import (the module-level db opens the file at
// import time), the real migrations ride the same connection via db.$client.
// Fully deterministic — the loop is index arithmetic, no clock or PRNG input
// except the warranty anchors, which are pinned to the app's own
// displayTodayUtc() so the warn band matches warrantyPredicate exactly.
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-perf-'))
process.env.DATABASE_PATH = join(tmpDir, 'perf.db')

const { db } = await import('@/db')
applyMigrations(db.$client)
const { listDevices } = await import('@/db/queries/devices')
const { displayTodayUtc, addDaysUtc } = await import('@/lib/warranty')
const { normalizeInventory } = await import('@/lib/normalize')

afterAll(() => {
  db.$client.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

const DEVICE_TOTAL = 600 // ≥500 per plan — page payload must stay ≤ pageSize regardless
const PAGE_SIZE = 20

const TYPE_KEYS = ['laptop', 'monitor', 'dock', 'peripheral'] as const
const STATUS_KEYS = ['in_stock', 'assigned', 'repair', 'disposed'] as const
const RAM_UPGRADED = [null, 0, 1] as const

// Full-combination rows: every dimension of the measured filter lines up —
// laptop + assigned + holder in department A + warranty inside the ≤60 warn
// window + RAM not upgraded + serial containing the q needle. 600 / 24 = 25
// of them: enough for total > pageSize, so the pagination math is exercised
// at scale, not just a single-page edge.
function isFullMatch(i: number): boolean {
  return i % 24 === 0
}

// --- Bulk seed (raw parameterized inserts, mirroring helpers.insertDevice) ---

const today = displayTodayUtc()
const toUnix = (d: Date) => Math.floor(d.getTime() / 1000)
const pastWarranty = addDaysUtc(today, -30)
const warnWarranty = addDaysUtc(today, 30)
const okWarranty = addDaysUtc(today, 400)
const warrantyVariants = [null, pastWarranty, warnWarranty, okWarranty] as const

const sqlite = db.$client
sqlite.transaction(() => {
  const insertDepartment = sqlite.prepare(
    'INSERT INTO departments (name, created_at) VALUES (?, unixepoch())',
  )
  const deptA = Number(insertDepartment.run('Перф Отдел А').lastInsertRowid)
  const deptB = Number(insertDepartment.run('Перф Отдел Б').lastInsertRowid)

  const insertEmployee = sqlite.prepare(
    'INSERT INTO employees (name, department_id, is_active, created_at) VALUES (?, ?, 1, unixepoch())',
  )
  // Employees 0–1 hold department A (the measured departmentId), 2–3 hold B.
  const employeeIds = ['Перф Сотрудник А1', 'Перф Сотрудник А2', 'Перф Сотрудник Б1', 'Перф Сотрудник Б2'].map(
    (name, n) => Number(insertEmployee.run(name, n < 2 ? deptA : deptB).lastInsertRowid),
  )

  const insertDevice = sqlite.prepare(
    `INSERT INTO devices (
       type_key, model, serial_number, serial_normalized,
       inventory_number, inventory_normalized,
       status, current_employee_id,
       purchase_date, warranty_until, ram_upgraded,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())`,
  )
  for (let i = 0; i < DEVICE_TOTAL; i++) {
    const full = isFullMatch(i)
    const typeKey = full ? 'laptop' : TYPE_KEYS[i % 4]
    // Status offset by one against the type modulus so laptops also spread
    // across in_stock/assigned/repair/disposed beyond the full-match rows.
    const status = full ? 'assigned' : STATUS_KEYS[(i + 1) % 4]
    const warranty = full
      ? addDaysUtc(today, 1 + (Math.floor(i / 24) % 30)) // strictly inside the warn band
      : warrantyVariants[i % 4]
    const ramUpgraded = full
      ? i % 48 === 0
        ? 0
        : null // both shapes match the NULL-safe «без апгрейда» predicate
      : typeKey === 'laptop'
        ? RAM_UPGRADED[i % 3]
        : null
    // Assigned devices carry a holder (the department filter joins on it);
    // full-match holders stay in department A, the rest rotate through all.
    const holder =
      status === 'assigned' ? employeeIds[full ? i % 2 : i % 4] : null
    const inventory = i % 3 === 0 ? `ИБ-${String(7000 + i).padStart(7, '0')}` : null
    const serial = `PERF-${i}-AB`
    const model = i % 2 === 0 ? `Тестовая модель ${i}` : `Test Model ${i}`
    insertDevice.run(
      typeKey,
      model,
      serial,
      serial.toUpperCase(), // write-side normalization (D-17)
      inventory,
      inventory ? normalizeInventory(inventory) : null,
      status,
      holder,
      toUnix(addDaysUtc(today, -365)),
      warranty === null ? null : toUnix(warranty),
      ramUpgraded,
    )
  }
})()

// The measured combination — every filter dimension ACTIVE at once
// (plan 02 predicates composed over the employees join).
const filters: DeviceListFilters = {
  q: 'PERF',
  status: 'assigned',
  departmentId: (
    sqlite.prepare("SELECT id FROM departments WHERE name = 'Перф Отдел А'").get() as {
      id: number
    }
  ).id,
  warranty: 'w60',
  ramNoUpgrade: true,
}

// Primary wording (wave 3: plan 04's exportDevices does not exist yet) — a
// full unpaged count over the SAME where composition, hand-written against
// the raw connection. Mirrors listDevices term for term: the search OR-fold
// (through the same norm() UDF openDb registers), the status/department
// terms on the employees join, the inclusive w60 window as unix seconds,
// and the NULL-safe D-07 RAM predicate.
const rawFilteredCount = (): number => {
  const from = toUnix(today)
  const to = toUnix(addDaysUtc(today, 60))
  return (
    sqlite
      .prepare(
        `SELECT count(*) AS c
         FROM devices
         LEFT JOIN employees ON devices.current_employee_id = employees.id
         WHERE devices.type_key = 'laptop'
           AND (devices.serial_normalized LIKE '%PERF%' ESCAPE '\\'
             OR devices.inventory_normalized LIKE '%PERF%' ESCAPE '\\'
             OR norm(devices.model) LIKE '%PERF%' ESCAPE '\\')
           AND devices.status = 'assigned'
           AND employees.department_id = ?
           AND devices.warranty_until IS NOT NULL
           AND devices.warranty_until >= ?
           AND devices.warranty_until <= ?
           AND (devices.ram_upgraded IS NULL OR devices.ram_upgraded != 1)`,
      )
      .get(filters.departmentId, from, to) as { c: number }
  ).c
}

describe('listDevices perf — full combined filter at ≥500 rows (UI-03)', () => {
  it('total equals a raw SQL count over the same WHERE; pagination stays server-side', { timeout: 20_000 }, () => {
    const result = listDevices({ type: 'laptop', page: 1, pageSize: PAGE_SIZE, filters })

    // The timing must be honest: the measured query actually matches rows.
    expect(result.total).toBeGreaterThan(0)
    expect(rawFilteredCount()).toBe(result.total)

    // Server-side pagination semantics: payload ≤ pageSize REGARDLESS of the
    // total, and the page/pages math is consistent with the count.
    expect(result.rows.length).toBeLessThanOrEqual(PAGE_SIZE)
    expect(result.page).toBe(1)
    expect(result.pages).toBe(Math.ceil(result.total / PAGE_SIZE))

    // A full paged walk yields exactly total rows, each page ≤ pageSize —
    // count and rows share one where (Pitfall 5 property, at scale).
    let walked = 0
    for (let p = 1; p <= result.pages; p++) {
      const page = listDevices({ type: 'laptop', page: p, pageSize: PAGE_SIZE, filters })
      expect(page.page).toBe(p)
      expect(page.rows.length).toBeLessThanOrEqual(PAGE_SIZE)
      walked += page.rows.length
    }
    expect(walked).toBe(result.total)
  })

  it('averages well under the 200 ms ceiling with a 1 s outlier guard', { timeout: 20_000 }, () => {
    // Warm-up (JIT + SQLite page cache) — measure steady state, not cold start.
    for (let w = 0; w < 3; w++) {
      listDevices({ type: 'laptop', page: 1, pageSize: PAGE_SIZE, filters })
    }

    const RUNS = 200
    let totalMs = 0
    let worstMs = 0
    for (let r = 0; r < RUNS; r++) {
      const t0 = performance.now()
      listDevices({ type: 'laptop', page: 1, pageSize: PAGE_SIZE, filters })
      const ms = performance.now() - t0
      totalMs += ms
      worstMs = Math.max(worstMs, ms)
    }
    const avgMs = totalMs / RUNS

    // Visible in the runner output so drift is trackable run-over-run —
    // the gate itself stays the generous assertion below.
    console.info(`perf: ${RUNS} full-filter runs — avg ${avgMs.toFixed(3)} ms, worst ${worstMs.toFixed(3)} ms`)

    // Generous by design (A6: measured headroom ~200×) — this fails loudly
    // only on a real regression (N+1 introduced, index dropped).
    expect(avgMs).toBeLessThan(200)
    expect(worstMs).toBeLessThan(1000)
  })
})
