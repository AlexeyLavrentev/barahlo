import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acceptSchema,
  assignSchema,
  bulkAcceptSchema,
  bulkAssignSchema,
  isNotFutureDate,
  occurredAtDateIso,
  occurredAtFromDate,
} from '@/lib/movement-schema'
import { occurredAtFormat } from '@/lib/ru'

// CR-01 regression: the not-future boundary and the stored instant run on the
// OFFICE wall clock (DISPLAY_TZ = Europe/Moscow), never the server clock —
// the container is UTC, so during MSK 00:00–03:00 the server still lived on
// the previous day and rejected the dialogs' prefilled «today» as «tomorrow».
// Every case below freezes the clock inside (or around) that window; the
// pre-fix server-local implementation fails the 00:30/01:00 MSK cases.

// 2026-09-03 00:30 MSK == 2026-09-02 21:30 UTC — the review's exact example.
const MSK_0030 = new Date('2026-09-02T21:30:00.000Z')
// 2026-09-03 01:00 MSK == 2026-09-02 22:00 UTC — mid-nightly-window probe.
const MSK_0100 = new Date('2026-09-02T22:00:00.000Z')
// 2026-09-03 15:00 MSK == 2026-09-03 12:00 UTC — daytime sanity, both days
// agree, so the pre-fix code passed this one too.
const MSK_1500 = new Date('2026-09-03T12:00:00.000Z')

// Moscow wall clock of an instant, «yyyy-mm-ddThh:mm» (h23).
function mskWall(instant: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('isNotFutureDate — day boundary in Europe/Moscow (CR-01)', () => {
  it('MSK 00:30: the prefilled Moscow «today» passes (the nightly rejection)', () => {
    expect(isNotFutureDate('2026-09-03', MSK_0030)).toBe(true)
  })

  it('MSK 01:00: «today» passes, «tomorrow» is rejected at the same instant', () => {
    expect(isNotFutureDate('2026-09-03', MSK_0100)).toBe(true)
    expect(isNotFutureDate('2026-09-04', MSK_0100)).toBe(false)
  })

  it('MSK 15:00: «today» passes, «tomorrow» is rejected (daytime sanity)', () => {
    expect(isNotFutureDate('2026-09-03', MSK_1500)).toBe(true)
    expect(isNotFutureDate('2026-09-04', MSK_1500)).toBe(false)
  })

  it('backdating is always legal', () => {
    expect(isNotFutureDate('2026-08-28', MSK_0100)).toBe(true)
  })

  it('full schema path with vi.setSystemTime frozen at 01:00 MSK: «today» parses', () => {
    vi.useFakeTimers()
    vi.setSystemTime(MSK_0100)
    const parsed = assignSchema.safeParse({
      deviceId: '1',
      employeeId: '2',
      occurredAt: '2026-09-03',
    })
    expect(parsed.success).toBe(true)
  })

  it('full schema path: «tomorrow» still fails with the «не в будущем» issue', () => {
    vi.useFakeTimers()
    vi.setSystemTime(MSK_0100)
    const parsed = acceptSchema.safeParse({
      deviceId: '1',
      occurredAt: '2026-09-04',
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      const occurredAt = parsed.error.issues.find((i) =>
        i.path.includes('occurredAt'),
      )
      expect(occurredAt?.message).toBe('Дата не может быть в будущем')
    }
  })
})

describe('occurredAtFromDate — stored instant keeps the submitted Moscow day (CR-01)', () => {
  it('MSK 01:00: submitted «today» stores Moscow 01:00 of that same day', () => {
    const instant = occurredAtFromDate('2026-09-03', MSK_0100)
    // 2026-09-03 01:00 MSK == 2026-09-02 22:00 UTC (pre-fix UTC construction
    // stored Moscow 09-04 01:00 — a day ahead of the user's choice).
    expect(instant.toISOString()).toBe('2026-09-02T22:00:00.000Z')
    expect(mskWall(instant)).toBe('2026-09-03 01:00')
  })

  it('backdated day keeps the DISPLAY_TZ time-of-day', () => {
    const instant = occurredAtFromDate('2026-09-01', MSK_0100)
    expect(instant.toISOString()).toBe('2026-08-31T22:00:00.000Z')
    expect(mskWall(instant)).toBe('2026-09-01 01:00')
  })

  it('daytime instant is untouched: MSK 15:00 stays 15:00', () => {
    const instant = occurredAtFromDate('2026-09-03', MSK_1500)
    expect(instant.toISOString()).toBe('2026-09-03T12:00:00.000Z')
  })

  it('no date at all = the passed now', () => {
    expect(occurredAtFromDate(undefined, MSK_0100)).toBe(MSK_0100)
  })
})

// Phase 12 (Pitfall 4): the ONE day-of-instant helper for the edit dialog
// prefill and the island serializer. toISOString().slice would drift at the
// MSK 00:00–03:00 window (CR-01 class) — occurredAtDateIso reads the OFFICE
// wall clock, parity with occurredAtFormat's day.
describe('occurredAtDateIso — day of instant in Europe/Moscow (phase 12)', () => {
  it('MSK 00:30: the Moscow day is 09-03, never the UTC-drifted 09-02', () => {
    // 2026-09-03 00:30 MSK == 2026-09-02 21:30 UTC — a toISOString() slice
    // would report 2026-09-02 here.
    expect(occurredAtDateIso(MSK_0030)).toBe('2026-09-03')
  })

  it('the last instant of a Moscow day still formats as that day', () => {
    // 2026-09-03 23:59:59.999 MSK == 2026-09-03 20:59:59.999 UTC.
    const lastInstant = new Date('2026-09-03T20:59:59.999Z')
    expect(occurredAtDateIso(lastInstant)).toBe('2026-09-03')
  })

  it('agrees with occurredAtFormat on the shown day (parity)', () => {
    const shown = occurredAtFormat.format(MSK_0030).slice(0, 2) // «03»
    expect(occurredAtDateIso(MSK_0030).slice(8, 10)).toBe(shown)
  })
})

// Партийные схемы (MOVE-06): границы deviceIds и strictObject-белые списки.
// Дубли внутри массива проходят zod намеренно — дедупликация забота экшена
// (Set до парсинга); guard-UPDATE страхует серверно.
describe('bulk schemas — deviceIds bounds + whitelist (MOVE-06)', () => {
  it('valid payloads pass for both schemas (coerced stringy ids)', () => {
    expect(
      bulkAssignSchema.safeParse({ deviceIds: ['1', '2'], employeeId: '3' })
        .success,
    ).toBe(true)
    expect(bulkAcceptSchema.safeParse({ deviceIds: ['1', '2'] }).success).toBe(
      true,
    )
  })

  it('deviceIds: empty, zero, negative, fractional and garbage are rejected', () => {
    expect(bulkAssignSchema.safeParse({ deviceIds: [], employeeId: '1' }).success).toBe(false)
    expect(bulkAcceptSchema.safeParse({ deviceIds: [] }).success).toBe(false)
    expect(bulkAssignSchema.safeParse({ deviceIds: [0], employeeId: '1' }).success).toBe(false)
    expect(bulkAssignSchema.safeParse({ deviceIds: [-1], employeeId: '1' }).success).toBe(false)
    expect(bulkAssignSchema.safeParse({ deviceIds: [1.5], employeeId: '1' }).success).toBe(false)
    expect(bulkAssignSchema.safeParse({ deviceIds: ['abc'], employeeId: '1' }).success).toBe(false)
  })

  it('deviceIds: 20 passes (cap = PAGE_SIZE), 21 is rejected (Pitfall 6)', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => i + 1)
    const twentyOne = [...twenty, 21]
    expect(
      bulkAssignSchema.safeParse({ deviceIds: twenty, employeeId: '1' })
        .success,
    ).toBe(true)
    expect(
      bulkAssignSchema.safeParse({ deviceIds: twentyOne, employeeId: '1' })
        .success,
    ).toBe(false)
    expect(bulkAcceptSchema.safeParse({ deviceIds: twentyOne }).success).toBe(
      false,
    )
  })

  it('deviceIds: duplicates pass through zod (dedup is the action\'s job)', () => {
    expect(
      bulkAssignSchema.safeParse({ deviceIds: [5, 5], employeeId: '1' })
        .success,
    ).toBe(true)
    expect(bulkAcceptSchema.safeParse({ deviceIds: [5, 5] }).success).toBe(true)
  })

  it('bulkAccept rejects an injected employeeId (strictObject tamper gate, V5)', () => {
    const parsed = bulkAcceptSchema.safeParse({
      deviceIds: ['1'],
      employeeId: '2',
    })
    expect(parsed.success).toBe(false)
  })

  it('a future occurredAt is rejected with the «не в будущем» copy (D-04)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(MSK_0100)
    const parsed = bulkAssignSchema.safeParse({
      deviceIds: ['1'],
      employeeId: '2',
      occurredAt: '2026-09-04',
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      const occurredAt = parsed.error.issues.find((i) =>
        i.path.includes('occurredAt'),
      )
      expect(occurredAt?.message).toBe('Дата не может быть в будущем')
    }
    expect(
      bulkAcceptSchema.safeParse({ deviceIds: ['1'], occurredAt: '2026-09-04' })
        .success,
    ).toBe(false)
  })
})
