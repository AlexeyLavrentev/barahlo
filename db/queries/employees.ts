import { and, asc, count, eq, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { departments, employees } from '@/db/schema'
import { normalizeNumber } from '@/lib/normalize'

// Employee data-access (EMP-01/EMP-03). Pure sync functions over the
// module-level db — no framework imports at all (Pitfall 7): Server Actions
// add session + zod on top, vitest imports this module directly against a
// temp database.

export type EmployeeFilter = 'active' | 'archive'

export type EmployeeListItem = {
  id: number
  name: string
  department: string
  isActive: number
}

export type EmployeeRow = {
  id: number
  name: string
  department: string
  isActive: number
}

export type DepartmentRow = { id: number; name: string }

type DbHandle = typeof db
type Tx = Parameters<Parameters<DbHandle['transaction']>[0]>[0]

// Russian-correct sort key: SQLite binary UTF-8 order puts «Ё» before «А»
// and NOCASE folds ASCII only; better-sqlite3 v13 has no collation API.
// Replace Ё/ё→Е/е in ORDER BY; employees.id is the stable tiebreaker.
const ruSortKey = sql`replace(replace(${employees.name}, 'Ё', 'Е'), 'ё', 'е')`

// FIND-05 employee search predicate (phase 7). The query folds through the
// SAME normalizeNumber the write path uses, then a LOCAL Ё/ё→E/e replace —
// the fold lives here, never in lib/normalize.mjs or the norm() UDF (D-01:
// device search and the write-side fold stay byte-identical). The replace
// target is the LATIN E/e, not the Cyrillic Е/е: a typed base «е» reaches
// the Latin E through the homoglyph map inside normalizeNumber (and norm()
// on the column side maps the stored «Е» the same way), so the stored «Ё»
// — which norm() leaves untouched — must fold onto that same Latin E for
// «елкин» to find «Ёлкин» (SC 2); a Cyrillic Е would never match it.
// norm uppercases/trims/collapses whitespace and maps the 11 homoglyph
// pairs, so the lowercase ё cannot survive — the 'ё' replace is a harmless
// symmetric guard per the ruSortKey recipe. Split AFTER the fold (norm
// collapses whitespace runs), capped at 20 tokens (sanitary ceiling,
// research A2). D-03/D-04: every token must match (AND), and each token
// matches the employee name OR the department name — «пётр бух» finds
// «Ёлкин Пётр» in «Бухгалтерия». LIKE wildcards backslash/percent/underscore
// are escaped and every LIKE carries escape '\\' — '%' stays literal;
// drizzle binds every pattern as a parameter, q never enters SQL text
// (T-05-01 class). An empty/whitespace q means NO predicate (the full
// list). Exported because Phase 11's ⌘K palette reuses it whole, fold
// included (D-01).
export function employeeSearchPredicate(rawQ: string | undefined) {
  const folded = normalizeNumber(rawQ ?? '').replaceAll('Ё', 'E')
  const tokens = folded.split(' ').filter(Boolean).slice(0, 20)
  if (tokens.length === 0) return undefined
  const escapeLike = (token: string) =>
    `%${token.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
  return and(
    ...tokens.map((token) =>
      or(
        sql`replace(replace(norm(${employees.name}), 'Ё', 'E'), 'ё', 'e') like ${escapeLike(token)} escape '\\'`,
        sql`replace(replace(norm(${departments.name}), 'Ё', 'E'), 'ё', 'e') like ${escapeLike(token)} escape '\\'`,
      ),
    ),
  )
}

export function listEmployees({
  filter,
  page,
  pageSize,
  q,
}: {
  filter: EmployeeFilter
  page: number
  pageSize: number
  q?: string
}): { rows: EmployeeListItem[]; total: number; page: number; pages: number } {
  const isActive = filter === 'active' ? 1 : 0
  // One where shared by the count and the rows query (Pitfall 5 property):
  // the segment guard and the search predicate compose into a single and().
  const where = and(eq(employees.isActive, isActive), employeeSearchPredicate(q))
  // The SAME where spans departments (q matches the department name), so the
  // count query carries the same innerJoin — counting without it would let
  // total drift from the list when q searches departments (Pitfall 1). The
  // join is on the departments primary key, it cannot multiply rows.
  const total = db
    .select({ value: count() })
    .from(employees)
    .innerJoin(departments, eq(employees.departmentId, departments.id))
    .where(where)
    .get()!.value
  const pages = Math.max(1, Math.ceil(total / pageSize))
  // Clamp into [1, pages] — never render a page beyond the last one
  // (Pitfall 4: zero-page after archiving on the last row).
  const current = Math.min(Math.max(1, page), pages)
  const rows = db
    .select({
      id: employees.id,
      name: employees.name,
      department: departments.name,
      isActive: employees.isActive,
    })
    .from(employees)
    .innerJoin(departments, eq(employees.departmentId, departments.id))
    .where(where)
    .orderBy(ruSortKey, asc(employees.id))
    .limit(pageSize)
    .offset((current - 1) * pageSize)
    .all()
  return { rows, total, page: current, pages }
}

// One ⌘K-palette page of the directory (FIND-06, phase 11): composes ONLY
// the exported employeeSearchPredicate — NO isActive term, active AND
// archived employees both match (the archived row carries isActive === 0 in
// the SELECT so the island can render the «В архиве» badge; Pitfall 2).
// The innerJoin is MANDATORY: the predicate references departments.name
// (Pitfall 1) — a query over employees alone fails the moment q is
// non-empty. Canonical RU-sort + id order; LIMIT is the server cap (D-01).
export function searchPaletteEmployees({
  q,
  limit,
}: {
  q: string
  limit: number
}) {
  return db
    .select({
      id: employees.id,
      name: employees.name,
      department: departments.name,
      isActive: employees.isActive,
    })
    .from(employees)
    .innerJoin(departments, eq(employees.departmentId, departments.id))
    .where(employeeSearchPredicate(q))
    .orderBy(ruSortKey, asc(employees.id))
    .limit(limit)
    .all()
}

export function getEmployee(id: number): EmployeeRow | undefined {
  return db
    .select({
      id: employees.id,
      name: employees.name,
      department: departments.name,
      isActive: employees.isActive,
    })
    .from(employees)
    .innerJoin(departments, eq(employees.departmentId, departments.id))
    .where(eq(employees.id, id))
    .get()
}

export function listDepartments(): DepartmentRow[] {
  return db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .orderBy(
      // Same Russian-correct key as the employee list (department names are
      // user-entered Russian); id tiebreaker for stability.
      sql`replace(replace(${departments.name}, 'Ё', 'Е'), 'ё', 'е')`,
      asc(departments.id),
    )
    .all()
}

// Resolve-or-create by name inside the caller's transaction (D-03). Losing
// the departments_name_uq race is not an error: catch the UNIQUE violation
// and reuse the winning row — one code path, no separate UI state.
export function resolveDepartmentId(tx: Tx, name: string): number {
  const existing = tx
    .select({ id: departments.id })
    .from(departments)
    .where(eq(departments.name, name))
    .get()
  if (existing) return existing.id
  try {
    return tx
      .insert(departments)
      .values({ name })
      .returning({ id: departments.id })
      .get()!.id
  } catch (e) {
    if ((e as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return tx
        .select({ id: departments.id })
        .from(departments)
        .where(eq(departments.name, name))
        .get()!.id
    }
    throw e
  }
}

// One sync transaction: department and employee are written atomically —
// a mid-flight failure leaves no orphan department. Name is NOT unique (D-04):
// two identical names coexist, distinguished by department and id.
export function createEmployee({
  name,
  departmentName,
}: {
  name: string
  departmentName: string
}): { id: number; name: string; departmentId: number } {
  return db.transaction((tx) => {
    const departmentId = resolveDepartmentId(tx, departmentName)
    return tx
      .insert(employees)
      .values({ name, departmentId })
      .returning({
        id: employees.id,
        name: employees.name,
        departmentId: employees.departmentId,
      })
      .get()!
  })
}

// Returns true when the row existed and was updated; an unknown id neither
// throws nor creates any rows (the department is only resolved after the
// existence check).
export function updateEmployee(
  id: number,
  { name, departmentName }: { name: string; departmentName: string },
): boolean {
  return db.transaction((tx) => {
    const existing = tx
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.id, id))
      .get()
    if (!existing) return false
    const departmentId = resolveDepartmentId(tx, departmentName)
    tx.update(employees)
      .set({ name, departmentId })
      .where(eq(employees.id, id))
      .run()
    return true
  })
}

// Archive is the only off-list path (EMP-03, D-02): a reversible isActive
// flip. No row-removing statement against employees exists in this module —
// and must never.
export function setEmployeeArchived(id: number, archived: boolean): void {
  db.update(employees)
    .set({ isActive: archived ? 0 : 1 })
    .where(eq(employees.id, id))
    .run()
}
