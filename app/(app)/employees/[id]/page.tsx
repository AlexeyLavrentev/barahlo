import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { getEmployee } from '@/db/queries/employees'
import { EmployeeDialog } from '../employee-dialog'

// The URL id is untyped user input that reaches SQL (T-02-07): it must pass
// a positive-integer zod check BEFORE any database access — garbage ids 404
// through notFound(), they never reach getEmployee().
const IdSchema = z.coerce.number().int().positive()

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
        {/* Temporary create-mode hosting — Task 2 wires the edit mode. */}
        <EmployeeDialog label="Редактировать" />
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
