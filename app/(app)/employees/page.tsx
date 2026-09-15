import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { requireSession } from '@/lib/auth'
import { listEmployees, listDepartments } from '@/db/queries/employees'
import { pluralEmployees } from '@/lib/ru'
import {
  buildEmployeesQuery,
  parseEmployeesSearchParams,
} from './query-params'
import { EmployeeDialog } from './employee-dialog'
import { EmployeeSearchBox } from './search-box'

export const metadata: Metadata = {
  title: 'Сотрудники',
}

const PAGE_SIZE = 20

type EmployeesSearchParams = {
  [key: string]: string | string[] | undefined
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<EmployeesSearchParams>
}) {
  await requireSession() // defense-in-depth: proxy + in-app guard
  const sp = await searchParams
  // searchParams is untyped user input — validate, never trust (T-02-02):
  // filter/q degrade to their sentinels in the ONE parser
  // (parseEmployeesSearchParams, query-params.ts); page via Number +
  // integer guard (a fractional ?page= would bind a non-integer OFFSET and
  // crash the query — WR-01); the query still clamps into [1, pages].
  const filters = parseEmployeesSearchParams(sp)
  const { filter, q } = filters
  const parsedPage = Number(sp.page)
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const { rows, total, page: current, pages } = listEmployees({
    filter,
    page,
    pageSize: PAGE_SIZE,
    q,
  })

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            Сотрудники
          </h1>
          {/* Subtitle variant (D-08, UI-SPEC Default 6): «Найдено: …» fires
              while q is non-empty ONLY — segment alone never switches the
              wording; q-empty keeps the phase-2 counter byte-exact.
              «Найдено: 0 сотрудников» above the empty state is valid output. */}
          <p className="text-sm text-ink-secondary">
            {q !== ''
              ? `Найдено: ${pluralEmployees(total)}`
              : pluralEmployees(total)}
          </p>
        </div>
        {/* The dialog's department combobox lists the current departments
            (D-03) — fetched server-side and handed to the client island. */}
        <EmployeeDialog label="Добавить сотрудника" departments={listDepartments()} />
      </div>

      {/* Segmented control (D-02): default «Активные», active state is the
          white pill — never an accent color (UI-SPEC Color). Segment links
          reset the page to 1 and carry the FULL query string via the ONE
          builder — switching the segment carries q (D-05, Pitfall 3). */}
      <nav
        aria-label="Фильтр сотрудников"
        className="mt-6 inline-flex rounded-lg bg-black/5 p-1"
      >
        <Link
          href={buildEmployeesQuery({ filter: 'active', q })}
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
          href={buildEmployeesQuery({ filter: 'archive', q })}
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

      {/* Live-search field (FIND-05, D-09): the page's ONLY client island —
          a plain server-rendered mount (filter-bar pattern), positioned
          between the segment nav (mt-6) and the list/empty card (mt-4):
          rhythm 24 → 16 (the field's own mt-4) → 16 (UI-SPEC layout). */}
      <EmployeeSearchBox q={q} filter={filter} />

      {rows.length === 0 ? (
        /* Empty states, copy verbatim from the UI-SPEC copywriting contract.
           Precedence (D-08, SC 4): a non-empty q wins over BOTH phase-2
           states — including an empty archive reached with a q; the q-empty
           cases keep the phase-2 copy byte-exact. */
        <div className="mt-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-hairline">
          {q !== '' ? (
            <>
              <h2 className="text-xl font-semibold tracking-tight text-ink">
                Ничего не найдено
              </h2>
              <p className="mt-1 text-sm text-ink-secondary">
                Проверьте раскладку и Ё/ё: „елкин“ найдёт „Ёлкин“.
              </p>
              {/* Plain server Link — no island, no onClick. On arrival q=''
                  differs from the island's lastSynced ref, so its clean-input
                  adoption clears the input without a focus jump
                  (search-box.tsx). Deliberate divergence from the devices
                  bare-link reset: buildEmployeesQuery drops q by omission and
                  keeps the segment (D-08). */}
              <Link
                href={buildEmployeesQuery({ filter, q: '' }, 1)}
                className="mt-4 inline-flex h-10 items-center rounded-lg bg-secondary px-3 text-sm text-secondary-foreground transition-all duration-100 ease-out hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] active:scale-[0.97]"
              >
                Сбросить поиск
              </Link>
            </>
          ) : filter === 'active' ? (
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
              label; links rebuild the whole query string via
              buildEmployeesQuery — q rides along (D-05). A zero-page is
              impossible: listEmployees clamps the page. */}
          <nav
            aria-label="Страницы списка"
            className="mt-4 flex items-center justify-between"
          >
            {current > 1 ? (
              <Link
                href={buildEmployeesQuery({ filter, q }, current - 1)}
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
                href={buildEmployeesQuery({ filter, q }, current + 1)}
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
