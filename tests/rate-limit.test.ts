import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit, recordFailure, resetFailures } from '@/lib/rate-limit'

const MIN = 60_000

beforeEach(() => {
  resetFailures()
})

describe('fixed-window rate limit (5 failures / 15 min, D-03)', () => {
  it('clean state: checkRateLimit() === false', () => {
    expect(checkRateLimit()).toBe(false)
  })

  it('4 failures in the window → false; the 5th failure trips the block', () => {
    const T = 1_000_000
    for (let i = 0; i < 4; i++) recordFailure(T)
    expect(checkRateLimit(T)).toBe(false)
    recordFailure(T)
    expect(checkRateLimit(T)).toBe(true)
  })

  it('resetFailures() lifts the block', () => {
    const T = 2_000_000
    for (let i = 0; i < 5; i++) recordFailure(T)
    expect(checkRateLimit(T)).toBe(true)
    resetFailures()
    expect(checkRateLimit(T)).toBe(false)
  })

  it('block expires with the window: T+14min → true, T+16min → false', () => {
    const T = 3_000_000
    for (let i = 0; i < 5; i++) recordFailure(T)
    expect(checkRateLimit(T + 14 * MIN)).toBe(true)
    expect(checkRateLimit(T + 16 * MIN)).toBe(false)
  })
})
