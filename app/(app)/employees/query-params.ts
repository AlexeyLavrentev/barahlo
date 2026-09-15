// The ONE params module of /employees (phase 7, FIND-05): the single source
// of the URL filter vocabulary, of the server-side parse and of the
// query-string builder. The segment nav, pagination links and the
// EmployeeSearchBox island all call buildEmployeesQuery /
// parseEmployeesSearchParams — no second parse or strip path can drift.
//
// Pure and immutable: no framework imports, no module-level mutable state
// (vercel server-no-shared-module-state) — safe to import from RSC, client
// islands and vitest alike. Islands receive flat validated values as props
// (server-serialization — never functions across the RSC boundary) and
// import this module's builder themselves.

// URL-layer filter state. filter has NO inactive sentinel — it is always a
// concrete segment (D-02 of phase 2: the default «Активные»), so the builder
// emits it on every link; q is '' when absent.
export type EmployeeFilters = {
  filter: 'active' | 'archive'
  q: string
}

// Param-name convention (single source): filter, q, page. page is pagination
// state, not a filter — the list page parses it locally; buildEmployeesQuery
// takes it as an argument.
//
// searchParams is untyped user input — validate, never trust: every param
// degrades to its inactive sentinel, never a 500 (T-03-04 discipline).
export function parseEmployeesSearchParams(
  sp: Record<string, string | string[] | undefined>,
): EmployeeFilters {
  const filter = sp.filter === 'archive' ? 'archive' : 'active'
  const rawQ = typeof sp.q === 'string' ? sp.q : ''
  const q = rawQ.trim().slice(0, 100)
  return { filter, q }
}

// The ONE builder the segment nav, pagination links and the search island
// all call: FULL query string, page omitted when 1. D-05: switching the
// segment carries q; a fresh search push omits page, so pagination resets
// to page 1 (a stale ?page= is clamped server-side anyway — listEmployees).
export function buildEmployeesQuery(f: EmployeeFilters, page = 1): string {
  const params = new URLSearchParams()
  params.set('filter', f.filter)
  if (f.q !== '') params.set('q', f.q)
  if (page !== 1) params.set('page', String(page))
  return `?${params.toString()}`
}
