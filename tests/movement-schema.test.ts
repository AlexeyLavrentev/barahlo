import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acceptSchema,
  assignSchema,
  isNotFutureDate,
  occurredAtFromDate,
} from '@/lib/movement-schema'

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
