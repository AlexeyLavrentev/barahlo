import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { getEmployee, listDepartments } from '@/db/queries/employees'
// This page lives in the (card) route group: a segment loading.tsx on the
// list branch streams its whole subtree (child segments included) and flushes
// status 200 before notFound() can answer — grouping the card separately
// keeps the 404 contract (T-02-07) while the list keeps its skeleton.
import { setEmployeeArchivedAction } from '@/app/(app)/employees/actions'
import { Button } from '@/components/ui/button'
import { EmployeeDialog } from '@/app/(app)/employees/employee-dialog'
import { ArchiveConfirmDialog } from '@/app/(app)/employees/archive-confirm-dialog'

// The URL id is untyped user input that reaches SQL (T-02-07): it must pass
// a positive-integer zod check BEFORE any database access — garbage ids 404
// through notFound(), they never reach getEmployee().
const IdSchema = z.coerce.number().int().positive()

// Direct unarchive submit — no confirmation, returning to the working lists
// is the safe direction (D-02). The shared action is useActionState-shaped
// ((prev, formData) → state); the form action prop needs () → Promise<void>,
// so this thin wrapper discards the state object: refresh() inside the
// action already re-renders this card.
async function unarchiveEmployee(formData: FormData): Promise<void> {
  'use server'
  await setEmployeeArchivedAction(undefined, formData)
}

export default async function EmployeeCardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireSession() // defense-in-depth: proxy + in-app guard
  const { id } = await params
  const parsed = IdSchema.safeParse(id)
  if (!parsed.success) notFound()
  const employee = getEmployee(parsed.data)
  if (!employee) notFound()

  return (
    <section className="max-w-2xl">
      <Link
        href="/employees"
        className="text-sm text-ink-secondary transition-colors hover:text-ink"
      >
        ← Сотрудники
      </Link>

      <div className="mt-4">
        <h1 className="text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] text-ink">
          {employee.name}
        </h1>
        {/* D-04: duplicate names are told apart by the visible department. */}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-sm text-ink-secondary">{employee.department}</p>
          {employee.isActive === 0 ? (
            <span className="rounded-full bg-black/5 px-2 py-1 text-sm text-ink-secondary">
              В архиве
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        {/* Server page renders a small client island: the edit dialog opens
            prefilled; the action's refresh() updates card and list. The
            department combobox needs the current department list (D-03). */}
        <EmployeeDialog
          label="Редактировать"
          departments={listDepartments()}
          employee={{
            id: employee.id,
            name: employee.name,
            department: employee.department,
          }}
        />
        {employee.isActive === 1 ? (
          // Archive (reversible, D-02) gets a confirmation; confirmation is
          // only needed for LEAVING the working lists — returning is direct.
          <ArchiveConfirmDialog
            employeeId={employee.id}
            employeeName={employee.name}
          />
        ) : (
          <form action={unarchiveEmployee}>
            <input type="hidden" name="id" value={employee.id} />
            <input type="hidden" name="archived" value="false" />
            <Button type="submit" variant="secondary" size="xl">
              Разархивировать
            </Button>
          </form>
        )}
      </div>

      <section className="mt-8">
        <h2 className="text-xl font-semibold tracking-tight text-ink">
          Техника
        </h2>
        {/* Issued devices land in Phase 4 (EMP-02) — a content placeholder,
            not an architectural one: the section is part of the card layout. */}
        <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-hairline">
          <p className="text-sm text-ink-secondary">Пока ничего не выдано</p>
        </div>
      </section>
    </section>
  )
}
