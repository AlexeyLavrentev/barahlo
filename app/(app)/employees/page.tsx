import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { requireSession } from '@/lib/auth'
import { listEmployees, listDepartments } from '@/db/queries/employees'
import { pluralEmployees } from '@/lib/ru'
import { EmployeeDialog } from './employee-dialog'

export const metadata: Metadata = {
  title: 'Сотрудники',
}

const PAGE_SIZE = 20

type EmployeesSearchParams = {
  [key: string]: string | string[] | undefined
}

// Links always rebuild the FULL query string — a bare `?page=2` would drop
// the active filter (Pitfall 3); switching the filter resets to page 1.
function buildQuery(filter: 'active' | 'archive', page: number): string {
  const params = new URLSearchParams()
  params.set('filter', filter)
  params.set('page', String(page))
  return `?${params.toString()}`
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<EmployeesSearchParams>
}) {
  await requireSession() // defense-in-depth: proxy + in-app guard
  const sp = await searchParams
  // searchParams is untyped user input — validate, never trust (T-02-02):
  // filter via enum, page via Number + clamp.
  const filter: 'active' | 'archive' = sp.filter === 'archive' ? 'archive' : 'active'
  const page = Math.max(1, Number(sp.page) || 1)
  const { rows, total, page: current, pages } = listEmployees({
    filter,
    page,
    pageSize: PAGE_SIZE,
  })

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            Сотрудники
          </h1>
          <p className="text-sm text-ink-secondary">{pluralEmployees(total)}</p>
        </div>
        {/* The dialog's department combobox lists the current departments
            (D-03) — fetched server-side and handed to the client island. */}
        <EmployeeDialog label="Добавить сотрудника" departments={listDepartments()} />
      </div>

      {/* Segmented control (D-02): default «Активные», active state is the
          white pill — never an accent color (UI-SPEC Color). Filter links
          reset the page to 1 and carry the FULL query string (Pitfall 3). */}
      <nav
        aria-label="Фильтр сотрудников"
        className="mt-6 inline-flex rounded-lg bg-black/5 p-1"
      >
        <Link
          href={buildQuery('active', 1)}
          aria-current={filter === 'active' ? 'page' : undefined}
          className={
            filter === 'active'
              ? 'rounded-lg bg-white px-3 py-1 text-sm text-ink shadow-sm'
              : 'rounded-lg px-3 py-1 text-sm text-ink-secondary transition-colors duration-150 ease-out hover:text-ink'
          }
        >
          Активные
        </Link>
        <Link
          href={buildQuery('archive', 1)}
          aria-current={filter === 'archive' ? 'page' : undefined}
          className={
            filter === 'archive'
              ? 'rounded-lg bg-white px-3 py-1 text-sm text-ink shadow-sm'
              : 'rounded-lg px-3 py-1 text-sm text-ink-secondary transition-colors duration-150 ease-out hover:text-ink'
          }
        >
          Архив
        </Link>
      </nav>

      {rows.length === 0 ? (
        /* Empty states, copy verbatim from the UI-SPEC copywriting contract:
           zero under «Активные» invites the first employee (the CTA above
           stays visible); zero under «Архив» explains the filter. */
        <div className="mt-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-hairline">
          {filter === 'active' ? (
            <>
              <h2 className="text-xl font-semibold tracking-tight text-ink">
                Пока нет сотрудников
              </h2>
              <p className="mt-1 text-sm text-ink-secondary">
                Добавьте первого сотрудника — понадобится имя и отдел.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold tracking-tight text-ink">
                Архив пуст
              </h2>
              <p className="mt-1 text-sm text-ink-secondary">
                Уволенные сотрудники появятся здесь.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-hairline overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-hairline">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/employees/${row.id}`}
                  title={`${row.name} · ${row.department}`}
                  className="flex min-h-11 items-center gap-2 px-4 transition-colors duration-150 ease-out hover:bg-page"
                >
                  <span className="min-w-0 flex-1 truncate text-base text-ink">
                    {row.name}
                    <span className="text-sm text-ink-secondary">
                      {' '}
                      · {row.department}
                    </span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-[#C7C7CC]" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          {/* Quiet prev/next (opacity-40, no href at the boundary) + N-of-M
              label; links rebuild the whole query string via buildQuery. A
              zero-page is impossible: listEmployees clamps the page. */}
          <nav
            aria-label="Страницы списка"
            className="mt-4 flex items-center justify-between"
          >
            {current > 1 ? (
              <Link
                href={buildQuery(filter, current - 1)}
                className="text-sm text-ink transition-colors hover:text-ink-secondary"
              >
                Назад
              </Link>
            ) : (
              <span className="text-sm opacity-40">Назад</span>
            )}
            <span className="text-sm text-ink-secondary">
              Страница {current} из {pages}
            </span>
            {current < pages ? (
              <Link
                href={buildQuery(filter, current + 1)}
                className="text-sm text-ink transition-colors hover:text-ink-secondary"
              >
                Далее
              </Link>
            ) : (
              <span className="text-sm opacity-40">Далее</span>
            )}
          </nav>
        </>
      )}
    </section>
  )
}
