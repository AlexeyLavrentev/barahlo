// Fixed-window brute-force guard for the login form (D-03).
// Counters live in process memory: they reset on restart — a documented,
// accepted trade-off (single process, single user, trusted LAN; T-01-07).
export const MAX_FAILURES = 5
export const WINDOW_MS = 15 * 60 * 1000

const failures: number[] = []

export function recordFailure(nowMs: number = Date.now()): void {
  failures.push(nowMs)
}

export function checkRateLimit(nowMs: number = Date.now()): boolean {
  let count = 0
  for (const ts of failures) {
    if (ts > nowMs - WINDOW_MS) count++
  }
  return count >= MAX_FAILURES
}

export function resetFailures(): void {
  failures.length = 0
}
