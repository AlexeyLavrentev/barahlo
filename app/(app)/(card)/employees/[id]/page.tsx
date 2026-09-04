import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { ChevronRight } from 'lucide-react'
import { requireSession } from '@/lib/auth'
import { getEmployee, listDepartments } from '@/db/queries/employees'
import { listIssuedByEmployee } from '@/db/queries/movements'
// This page lives in the (card) route group: a segment loading.tsx on the
// list branch streams its whole subtree (child segments included) and flushes
// status 200 before notFound() can answer — grouping the card separately
// keeps the 404 contract (T-02-07) while the list keeps its skeleton.
import { setEmployeeArchivedAction } from '@/app/(app)/employees/actions'
import { Button } from '@/components/ui/button'
import { EmployeeDialog } from '@/app/(app)/employees/employee-dialog'
import { ArchiveConfirmDialog } from '@/app/(app)/employees/archive-confirm-dialog'
import { ReturnAllDialog } from '@/app/(app)/devices/movement-dialogs'
import { occurredDateFormat, pluralDevices } from '@/lib/ru'
import { displayTodayUtc } from '@/lib/warranty'
import { WarrantyDate } from '@/lib/warranty-date'

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

// Issued-devices section (EMP-02, D-07): only devices with a CURRENT assigned
// on this employee; «выдано {дата}» is the latest assigned event's date. The
// return-all confirm appears from one issued device on. A server-side query
// in the same RSC render — the actions' refresh() updates it without F5
// (MOVE-05).
function IssuedSection({ employeeId }: { employeeId: number }) {
  const issued = listIssuedByEmployee(employeeId)
  // WAR-01 (D-16): ONE calculation for every render site — «today» computed
  // ONCE per render and passed to each row's WarrantyDate (not per row).
  const today = displayTodayUtc()
  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight text-ink">
          Техника
        </h2>
        {issued.length > 0 ? (
          <p className="text-sm text-ink-secondary">
            {pluralDevices(issued.length)}
          </p>
        ) : null}
      </div>
      {issued.length === 0 ? (
        // Phase 2 copy kept verbatim (04-UI-SPEC empty-state table).
        <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-hairline">
          <p className="text-sm text-ink-secondary">Пока ничего не выдано</p>
        </div>
      ) : (
        <>
          <div className="mt-3 divide-y divide-hairline rounded-2xl bg-white shadow-sm ring-1 ring-hairline">
            {issued.map((device) => (
              <Link
                key={device.id}
                href={`/devices/${device.id}`}
                title={`${device.model} · ${device.serialNumber}`}
                className="flex min-h-11 items-center gap-2 px-4 py-2 transition-colors duration-150 ease-out hover:bg-page"
              >
                <span className="min-w-0 flex-1">
                  {/* Line 1: модель (16/400 ink, truncate); line 2: серийник
                      mono · «выдано {дата}» (04-UI-SPEC Default 14). */}
                  <span className="block truncate text-base text-ink">
                    {device.model}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-ink-secondary">
                    <span className="font-mono">{device.serialNumber}</span>
                    {device.issuedAt ? (
                      <>
                        {' · выдано '}
                        {occurredDateFormat.format(device.issuedAt)}
                      </>
                    ) : null}
                    {/* WAR-01 site 3: the colored «гар. до …» segment after
                        «выдано {дата}» — one WarrantyDate; the whole segment
                        (separator included) disappears when warrantyUntil is
                        null. Not mono: a date, not an identifier. */}
                    <WarrantyDate
                      value={device.warrantyUntil}
                      today={today}
                      variant="list"
                    />
                  </span>
                </span>
                <ChevronRight
                  size={16}
                  className="shrink-0 text-[#C7C7CC]"
                  aria-hidden
                />
              </Link>
            ))}
          </div>
          <div className="mt-3">
            <ReturnAllDialog employeeId={employeeId} count={issued.length} />
          </div>
        </>
      )}
    </section>
  )
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

      <IssuedSection employeeId={employee.id} />
    </section>
  )
}
