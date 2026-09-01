// Fixed-window brute-force guard for the login form (D-03).
// Counters live in process memory: they reset on restart — a documented,
// accepted trade-off (single process, single user, trusted LAN; T-01-07).
export const MAX_FAILURES = 5
export const WINDOW_MS = 15 * 60 * 1000

const failures: number[] = []

export function recordFailure(nowMs: number = Date.now()): void {
  failures.push(nowMs)
}

// Вход неаутентифицирован, поэтому без обрезки массив рос бы без ограничений
// (скриптовый хост раздувает память и удлиняет каждый скан). Срезаем
// устаревшие записи при каждой проверке: метки приходят от Date.now() по
// неубыванию, поэтому достаточно сдвига с головы.
export function checkRateLimit(nowMs: number = Date.now()): boolean {
  const cutoff = nowMs - WINDOW_MS
  while (failures.length > 0 && failures[0] <= cutoff) failures.shift()
  return failures.length >= MAX_FAILURES
}

// Сколько записей сейчас в памяти (диагностика и тесты обрезки).
export function failureCount(): number {
  return failures.length
}

export function resetFailures(): void {
  failures.length = 0
}
