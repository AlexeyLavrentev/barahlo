import { describe, expect, it } from 'vitest'
import {
  addDaysUtc,
  displayTodayUtc,
  warrantyState,
  WARRANTY_WARN_DAYS,
} from '@/lib/warranty'

// Warranty boundary regression (WAR-01, edge 8/9): frozen clocks pin every
// boundary — the MSK 00:30 pair (an instant whose UTC date is the PRIOR day
// must yield the NEXT MSK «today»), and the inclusive 60-day warn band
// (day 0 and day 60 warn, day 61 ok, yesterday expired, null «none»). The
// pre-fix server-local implementation (CR-01 bug class) fails the 00:30 case.
const MSK_0030 = new Date('2026-09-03T21:30:00.000Z') // 2026-09-04 00:30 MSK
const MSK_1500 = new Date('2026-09-03T12:00:00.000Z') // 2026-09-03 15:00 MSK

describe('displayTodayUtc — DISPLAY_TZ wall clock (CR-01 recipe)', () => {
  it('an instant whose UTC date is the prior day yields the NEXT MSK day', () => {
    // 2026-09-03 21:30 UTC is already 2026-09-04 00:30 in Moscow.
    expect(displayTodayUtc(MSK_0030).getTime()).toBe(Date.UTC(2026, 8, 4))
  })

  it('a daytime instant keeps the same calendar day on both clocks', () => {
    expect(displayTodayUtc(MSK_1500).getTime()).toBe(Date.UTC(2026, 8, 3))
  })

  it('the last pre-midnight MSK minute still belongs to the prior day', () => {
    // 2026-09-03 23:59:59 MSK == 2026-09-03 20:59:59 UTC.
    const justBefore = new Date('2026-09-03T20:59:59.000Z')
    expect(displayTodayUtc(justBefore).getTime()).toBe(Date.UTC(2026, 8, 3))
  })

  it('returns a UTC-midnight instant (hour/min/sec all zero)', () => {
    const today = displayTodayUtc(MSK_0030)
    expect(today.toISOString()).toBe('2026-09-04T00:00:00.000Z')
  })
})

describe('addDaysUtc — fixed 86_400_000 steps on UTC midnight', () => {
  it('stays inside one month', () => {
    expect(addDaysUtc(new Date(Date.UTC(2026, 8, 4)), 30).getTime()).toBe(
      Date.UTC(2026, 9, 4),
    )
  })

  it('crosses month and DST-free boundaries exactly', () => {
    // Sep 4 + 60 days = Nov 3, 2026 (no DST on UTC operands, ever).
    expect(addDaysUtc(new Date(Date.UTC(2026, 8, 4)), 60).getTime()).toBe(
      Date.UTC(2026, 10, 3),
    )
  })
})

describe('warrantyState — the ONE inclusive boundary (edge 8/9)', () => {
  const today = new Date(Date.UTC(2026, 8, 4))

  it('keeps the ONE warn constant at 60 (filter and color share it)', () => {
    expect(WARRANTY_WARN_DAYS).toBe(60)
  })

  it('wu == today is warn (expiring today never reads green)', () => {
    expect(warrantyState(today, today)).toBe('warn')
  })

  it('wu == today + 59 is warn', () => {
    expect(warrantyState(addDaysUtc(today, 59), today)).toBe('warn')
  })

  it('wu == today + 60 is warn — the inclusive boundary (edge 8)', () => {
    expect(warrantyState(addDaysUtc(today, 60), today)).toBe('warn')
  })

  it('wu == today + 61 is ok', () => {
    expect(warrantyState(addDaysUtc(today, 61), today)).toBe('ok')
  })

  it('wu == today - 1 is expired', () => {
    expect(warrantyState(addDaysUtc(today, -1), today)).toBe('expired')
  })

  it('wu far in the future is ok', () => {
    expect(warrantyState(addDaysUtc(today, 365), today)).toBe('ok')
  })

  it('null warranty is none — never colored, never «expired»', () => {
    expect(warrantyState(null, today)).toBe('none')
  })
})
