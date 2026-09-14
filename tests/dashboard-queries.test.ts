import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { applyMigrations } from './helpers'

// db/queries/devices.ts and db/queries/movements.ts are bound to the
// module-level db from @/db, which opens DATABASE_PATH at import time. Point
// it at a temp database BEFORE the first @/db import (dynamic imports below
// keep that ordering), then apply the real migrations to the same connection
// via db.$client — the shared bootstrap of the queries test files
// (devices-queries.test.ts, movements-queries.test.ts).
//
// Wave-0 fixture set of phase 6 (06-VALIDATION): parity of every dashboard
// counter against the total of the matching listDevices filter (the D-04
// pin), the MSK boundary of the warranty presets on a frozen clock, the
// empty-DB zero-defaults, and the feed's ordering/limit/null-slot contract.
// Test order matters ON PURPOSE and is deterministic (vitest runs a file's
// tests in declaration order): the FIRST group runs on the still-empty
// database, every later group seeds its own fixtures in beforeAll.
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-dashboard-'))
process.env.DATABASE_PATH = join(tmpDir, 'dashboard.db')

const { db } = await import('@/db')
applyMigrations(db.$client)
const queries = await import('@/db/queries/devices')
const movementsQueries = await import('@/db/queries/movements')
const employeeQueries = await import('@/db/queries/employees')
const deviceSchema = await import('@/lib/device-schema')
const warrantyModule = await import('@/lib/warranty')
const movementSchema = await import('@/lib/movement-schema')

const {
  createDevice,
  listDevices,
  deviceCountByType,
  deviceCountByStatus,
  totalDeviceCount,
  warrantyPresetCounts,
  nearestExpiringWarranties,
} = queries
const { assignDevice, transferDevice, sendToRepair, returnFromRepair, disposeDevice, listRecentMovements } =
  movementsQueries
const { createEmployee } = employeeQueries
const { DEVICE_TYPES, DEVICE_STATUS_KEYS } = deviceSchema
const { addDaysUtc, displayTodayUtc } = warrantyModule
const { movementEventLabel } = movementSchema

afterAll(() => {
  db.$client.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

// Common input with only the mandatory fields — individual calls override.
const base = {
  model: 'Дашборд Модель',
  serialNumber: 'SN-DASH',
  inventoryNumber: null as string | null,
  purchaseDate: null as Date | null,
  purchasePrice: null as number | null,
  supplier: null as string | null,
  warrantyUntil: null as Date | null,
  notes: null as string | null,
}

function seedDevice(
  serial: string,
  overrides: Partial<{
    typeKey: 'laptop' | 'monitor' | 'dock' | 'peripheral'
    model: string
    warrantyUntil: Date | null
  }> = {},
): number {
  return createDevice({
    typeKey: overrides.typeKey ?? 'laptop',
    ...base,
    model: overrides.model ?? 'Дашборд Модель',
    serialNumber: serial,
    warrantyUntil: overrides.warrantyUntil ?? null,
  })
}

// The presets as a const tuple — the filter contract's exact vocabulary.
const PRESETS = ['w30', 'w60', 'expired'] as const

describe('zero-default — пустая база (Pitfall 3 / keystone fullness)', () => {
  // Runs FIRST, on the freshly migrated database — no fixtures exist yet.
  it('GROUP BY is silent, total is 0, and the eight keystone lookups all default to zero', () => {
    expect(deviceCountByType()).toEqual([])
    expect(deviceCountByStatus()).toEqual([])
    expect(totalDeviceCount()).toBe(0)
    const typeMap = new Map(deviceCountByType().map((r) => [r.typeKey, r.n]))
    const statusMap = new Map(deviceCountByStatus().map((r) => [r.status, r.n]))
    for (const t of DEVICE_TYPES) expect(typeMap.get(t.key) ?? 0).toBe(0)
    for (const s of DEVICE_STATUS_KEYS) expect(statusMap.get(s) ?? 0).toBe(0)
    // The warranty counters total over the same empty table — the honest
    // fresh-install zeros the page renders.
    expect(warrantyPresetCounts()).toEqual({ w30: 0, w60: 0, expired: 0 })
    expect(nearestExpiringWarranties(5)).toEqual([])
    expect(listRecentMovements(10)).toEqual([])
  })
})

describe('parity — счётчики == total ФИЛЬТРА через публичный API (D-04 pin)', () => {
  // Seeded AFTER the zero-default group (its beforeAll runs later), through
  // real createDevice + custody actions. Warranty dates are RELATIVE to the
  // same computed «today» the queries use, so the buckets are hand-known:
  //   dbx-l1 +10 → w30 И w60 · dbx-l2 +60 → только w60 (граница)
  //   dbx-m1 +45 → только w60    · dbx-m2 +200 → ни один
  //   dbx-d1 null → ни один      · dbx-p1 -5 → только expired
  let empAId = 0

  beforeAll(() => {
    const today = displayTodayUtc()
    const day = 86_400_000
    const at = (days: number) => new Date(today.getTime() + days * day)
    empAId = createEmployee({ name: 'Паритет Держатель', departmentName: 'Паритет-ИТ' }).id
    const l1 = seedDevice('dbx-l1', { warrantyUntil: at(10) })
    seedDevice('dbx-l2', { warrantyUntil: at(60) })
    const m1 = seedDevice('dbx-m1', { typeKey: 'monitor', warrantyUntil: at(45) })
    seedDevice('dbx-m2', { typeKey: 'monitor', warrantyUntil: at(200) })
    seedDevice('dbx-d1', { typeKey: 'dock' })
    const p1 = seedDevice('dbx-p1', { typeKey: 'peripheral', warrantyUntil: at(-5) })
    // Real custody actions put one device into each non-default status:
    // assigned (dbx-l1), repair (dbx-m1), disposed (dbx-p1); the rest stay
    // in_stock — all four status tiles get a nonzero, hand-known bucket.
    assignDevice(l1, empAId)
    sendToRepair(m1)
    disposeDevice(p1)
  })

  it('every type counter equals listDevices(type).total, and the tiles sum to «Всего»', () => {
    const counts = deviceCountByType()
    for (const t of DEVICE_TYPES) {
      expect(counts.find((r) => r.typeKey === t.key)?.n ?? 0).toBe(
        listDevices({ type: t.key, page: 1, pageSize: 1 }).total,
      )
    }
    const sum = counts.reduce((acc, r) => acc + r.n, 0)
    expect(sum).toBe(totalDeviceCount())
    expect(sum).toBe(listDevices({ type: 'all', page: 1, pageSize: 1 }).total)
  })

  it('every status counter equals listDevices(status filter).total', () => {
    const counts = deviceCountByStatus()
    for (const s of DEVICE_STATUS_KEYS) {
      expect(counts.find((r) => r.status === s)?.n ?? 0).toBe(
        listDevices({ type: 'all', page: 1, pageSize: 1, filters: { status: s } }).total,
      )
    }
  })

  it('every warranty preset counter equals listDevices(?warranty=…).total — the strongest drift guard', () => {
    for (const w of PRESETS) {
      expect(warrantyPresetCounts()[w]).toBe(
        listDevices({ type: 'all', page: 1, pageSize: 1, filters: { warranty: w } }).total,
      )
    }
  })

  it('the preset buckets hold the hand-known fixture membership (1 / 3 / 1)', () => {
    // Guards against a SHARED math error that parity alone cannot see (both
    // sides drifting together): day 0/30/60 inclusive, day 61 out, past expired.
    expect(warrantyPresetCounts()).toEqual({ w30: 1, w60: 3, expired: 1 })
    expect(totalDeviceCount()).toBe(6)
  })

  it('nearestExpiringWarranties mirrors the w60 window exactly (same length as the filter total)', () => {
    expect(nearestExpiringWarranties(1000)).toHaveLength(
      listDevices({ type: 'all', page: 1, pageSize: 1, filters: { warranty: 'w60' } }).total,
    )
    for (const row of nearestExpiringWarranties(1000)) {
      expect(row.warrantyUntil.getTime()).toBeGreaterThanOrEqual(displayTodayUtc().getTime())
    }
  })
})

describe('TZ-граница — frozen MSK 00:30 (CR-01 hazard instant)', () => {
  // 2026-09-03 21:30 UTC is already 2026-09-04 00:30 in Moscow — an instant
  // whose UTC date is the PRIOR day (the exact bug class displayTodayUtc
  // exists for). Absolute warranty dates, clock-independent seeding:
  //   tz-today → сегодня(04.09) · tz-in60 → +60(03.11) · tz-in61 → +61(04.11)
  //   tz-past → вчера(03.09)     · tz-none → NULL
  const MSK_0030 = new Date('2026-09-03T21:30:00.000Z')
  const FROZEN_TODAY = Date.UTC(2026, 8, 4)
  const day = 86_400_000
  const at = (days: number) => new Date(FROZEN_TODAY + days * day)

  beforeAll(() => {
    seedDevice('tz-today', { model: 'Граница Часов', warrantyUntil: at(0) })
    seedDevice('tz-in60', { model: 'Граница Часов', warrantyUntil: at(60) })
    seedDevice('tz-in61', { model: 'Граница Часов', warrantyUntil: at(61) })
    seedDevice('tz-past', { model: 'Граница Часов', warrantyUntil: at(-1) })
    seedDevice('tz-none', { model: 'Граница Часов' })
    seedDevice('tz-tie-a', { model: 'Граница Часов', warrantyUntil: at(16) })
    seedDevice('tz-tie-b', { model: 'Граница Часов', warrantyUntil: at(16) })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function frozenSerialsOf(warranty: (typeof PRESETS)[number]): string[] {
    return listDevices({
      type: 'all',
      page: 1,
      pageSize: 1000,
      filters: { warranty, q: 'tz-' },
    })
      .rows.map((r) => r.serialNumber)
      .sort()
  }

  it('гарантия до сегодня входит в w30 И w60 и не истекла (инклюзивная граница)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(MSK_0030)
    // The +16-day tie pair sits inside BOTH windows; «сегодня» (day 0) leads
    // the sorted membership of each.
    expect(frozenSerialsOf('w30')).toEqual(['tz-tie-a', 'tz-tie-b', 'tz-today'])
    expect(frozenSerialsOf('w60')).toEqual([
      'tz-in60',
      'tz-tie-a',
      'tz-tie-b',
      'tz-today',
    ])
    expect(frozenSerialsOf('expired')).toEqual(['tz-past'])
  })

  it('до сегодня+60 — в w60; до сегодня+61 — ни в одном пресете и не истекла', () => {
    vi.useFakeTimers()
    vi.setSystemTime(MSK_0030)
    expect(frozenSerialsOf('w60')).toContain('tz-in60')
    for (const w of PRESETS) {
      expect(frozenSerialsOf(w)).not.toContain('tz-in61')
      expect(frozenSerialsOf(w)).not.toContain('tz-none')
    }
    expect(frozenSerialsOf('expired')).toEqual(['tz-past'])
  })

  it('NULL-гарантия не матчится ни в одном пресете (edge 9)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(MSK_0030)
    for (const w of PRESETS) {
      expect(frozenSerialsOf(w)).not.toContain('tz-none')
    }
  })

  it('warrantyPresetCounts() under the frozen clock stays in parity with the filter totals', () => {
    vi.useFakeTimers()
    vi.setSystemTime(MSK_0030)
    const counts = warrantyPresetCounts()
    for (const w of PRESETS) {
      expect(counts[w]).toBe(
        listDevices({ type: 'all', page: 1, pageSize: 1, filters: { warranty: w } }).total,
      )
    }
  })

  it('nearestExpiringWarranties: скоро-первыми, id-tiebreaker при одной дате, истёкшие/NULL вне', () => {
    vi.useFakeTimers()
    vi.setSystemTime(MSK_0030)
    const serialById = new Map(
      (
        db.$client.prepare('SELECT id, serial_number FROM devices').all() as {
          id: number
          serial_number: string
        }[]
      ).map((r) => [r.id, r.serial_number]),
    )
    const top = nearestExpiringWarranties(5)
    // Soonest first — «сегодня» (04.09) leads the w60 window.
    expect(top[0].model).toBe('Граница Часов')
    expect(top[0].warrantyUntil).toEqual(at(0))
    // The two same-date devices (20.09) sit next to each other in id order —
    // the asc(id) tiebreaker keeps the pair stable.
    const serials = top.map((r) => serialById.get(r.id))
    const tieA = serials.indexOf('tz-tie-a')
    const tieB = serials.indexOf('tz-tie-b')
    expect(tieA).toBeGreaterThan(-1)
    expect(tieB).toBe(tieA + 1)
    // No expired (tz-past), no NULL (tz-none), no out-of-window (tz-in61).
    expect(serials).not.toContain('tz-past')
    expect(serials).not.toContain('tz-none')
    expect(serials).not.toContain('tz-in61')
  })

  it('limit усекает: 6+ в окне → ровно limit строк', () => {
    vi.useFakeTimers()
    vi.setSystemTime(MSK_0030)
    // The window already holds 5 fixtures (today, in60, tie-a, tie-b + the
    // real-clock parity rows relative to the frozen today) — a limit of 3
    // must truncate, a huge limit must not.
    expect(nearestExpiringWarranties(3).length).toBe(3)
    expect(nearestExpiringWarranties(100).length).toBe(
      listDevices({ type: 'all', page: 1, pageSize: 1, filters: { warranty: 'w60' } }).total,
    )
  })
})

describe('лента — listRecentMovements: tie, лимит, null-слоты, join (DASH-03)', () => {
  let feedSerial = 0
  function newFeedDevice(model: string): number {
    feedSerial += 1
    return createDevice({
      typeKey: 'laptop',
      ...base,
      model,
      serialNumber: `fd-${String(feedSerial).padStart(3, '0')}`,
    })
  }

  it('два события с одним occurredAt — выше большего id (устойчивость к tie)', () => {
    const emp = createEmployee({ name: 'Лента Свидетель', departmentName: 'Лента-ИТ' })
    const dev1 = newFeedDevice('Лента Тай А')
    const dev2 = newFeedDevice('Лента Тай Б')
    const sameInstant = new Date()
    assignDevice(dev1, emp.id, { occurredAt: sameInstant })
    assignDevice(dev2, emp.id, { occurredAt: sameInstant })
    const feed = listRecentMovements(10)
    expect(feed[0].deviceId).toBe(dev2)
    expect(feed[1].deviceId).toBe(dev1)
  })

  it('null-слоты выживают: from_repair и received несут null-имена и null-id', () => {
    const dev = newFeedDevice('Лента Из Ремонта')
    sendToRepair(dev)
    returnFromRepair(dev)
    db.$client
      .prepare(
        "INSERT INTO movements (device_id, event_type, occurred_at, created_at) VALUES (?, 'received', unixepoch(), unixepoch())",
      )
      .run(dev)
    const feed = listRecentMovements(10)
    const fromRepair = feed.find((e) => e.eventType === 'from_repair')
    expect(fromRepair).toBeDefined()
    expect(fromRepair!.fromId).toBeNull()
    expect(fromRepair!.toId).toBeNull()
    expect(fromRepair!.fromName).toBeNull()
    expect(fromRepair!.toName).toBeNull()
    expect(fromRepair!.deviceId).toBe(dev)
    const received = feed.find((e) => e.eventType === 'received')
    expect(received).toBeDefined()
    expect(received!.fromId).toBeNull()
    expect(received!.toId).toBeNull()
  })

  it('fromId/toId присутствуют и равны участникам; модель/серийник принадлежат устройству события', () => {
    const empA = createEmployee({ name: 'Лента Отдающий', departmentName: 'Лента-ИТ' })
    const empB = createEmployee({ name: 'Лента Принимающий', departmentName: 'Лента-ИТ' })
    const model = 'Лента Передача Модель'
    const dev = newFeedDevice(model)
    assignDevice(dev, empA.id)
    transferDevice(dev, empB.id)
    const row = listRecentMovements(10).find((e) => e.eventType === 'transferred')
    expect(row).toBeDefined()
    expect(row!.deviceId).toBe(dev)
    expect(row!.model).toBe(model)
    expect(row!.serialNumber).toBe(`fd-${String(feedSerial).padStart(3, '0')}`)
    expect(row!.fromId).toBe(empA.id)
    expect(row!.fromName).toBe(empA.name)
    expect(row!.toId).toBe(empB.id)
    expect(row!.toName).toBe(empB.name)
  })

  it('12 событий → ровно 10, только новейшие, порядок occurredAt DESC сохранён', () => {
    const dev = newFeedDevice('Лента Лимит')
    const baseMs = Date.now()
    const ids: number[] = []
    for (let i = 1; i <= 12; i++) {
      const res = db.$client
        .prepare(
          "INSERT INTO movements (device_id, event_type, occurred_at, created_at) VALUES (?, 'received', ?, unixepoch())",
        )
        .run(dev, Math.floor((baseMs + i * 1000) / 1000))
      ids.push(Number(res.lastInsertRowid))
    }
    const feed = listRecentMovements(10)
    expect(feed).toHaveLength(10)
    // Newest first: the i=12 insert leads, the i=3 insert closes the page;
    // the two oldest (i=1, i=2) stay outside the limit.
    expect(feed[0].id).toBe(ids[11])
    expect(feed[9].id).toBe(ids[2])
    const tailIds = feed.map((e) => e.id)
    expect(tailIds).not.toContain(ids[0])
    expect(tailIds).not.toContain(ids[1])
    for (let k = 1; k < feed.length; k++) {
      expect(feed[k].occurredAt.getTime()).toBeLessThanOrEqual(feed[k - 1].occurredAt.getTime())
    }
  })

  it('movementEventLabel покрывает все 7 типов и падает на raw-значение для неизвестного', () => {
    expect(movementEventLabel('received')).toBe('Поступление')
    expect(movementEventLabel('assigned')).toBe('Выдача')
    expect(movementEventLabel('transferred')).toBe('Передача')
    expect(movementEventLabel('returned')).toBe('Возврат')
    expect(movementEventLabel('to_repair')).toBe('В ремонт')
    expect(movementEventLabel('from_repair')).toBe('Из ремонта')
    expect(movementEventLabel('disposed')).toBe('Списание')
    // The event_type column is free text — an unknown value renders itself.
    expect(movementEventLabel('beamed_aboard')).toBe('beamed_aboard')
  })
})
