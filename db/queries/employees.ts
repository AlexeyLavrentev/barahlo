import { asc, count, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { departments, employees } from '@/db/schema'

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

export function listEmployees({
  filter,
  page,
  pageSize,
}: {
  filter: EmployeeFilter
  page: number
  pageSize: number
}): { rows: EmployeeListItem[]; total: number; page: number; pages: number } {
  const isActive = filter === 'active' ? 1 : 0
  const total = db
    .select({ value: count() })
    .from(employees)
    .where(eq(employees.isActive, isActive))
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
    .where(eq(employees.isActive, isActive))
    .orderBy(ruSortKey, asc(employees.id))
    .limit(pageSize)
    .offset((current - 1) * pageSize)
    .all()
  return { rows, total, page: current, pages }
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
