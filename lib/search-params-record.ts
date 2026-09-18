// D-08 fix #1 (phase 11; the WR-01 of phase 8): the ONE URLSearchParams →
// Record shaping shared by route handlers. Next hands page components a
// Record<string, string | string[]> where duplicated params survive as
// arrays; a naive Object.fromEntries(searchParams) keeps only the LAST
// value — the page/export drift on malformed URLs (?type=laptop&type=monitor)
// that 08-REVIEW proved. Shaping through this helper before the shared
// parser lets the parser's own array-degradation path (T-03-04) decide, so
// the CSV export equals the page for every URL, well-formed or not.
//
// Pure and immutable: no framework imports, no module-level mutable state —
// safe to import from route handlers, RSC and vitest alike (the
// query-params.ts module discipline; routes themselves are NOT
// vitest-importable, which is why this loop lives here and not inline).
export function searchParamsRecord(
  sp: URLSearchParams,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const [k, v] of sp) {
    const prev = out[k]
    out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v]
  }
  return out
}
