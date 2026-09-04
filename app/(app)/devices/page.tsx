import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { requireSession } from '@/lib/auth'
import { listDevices } from '@/db/queries/devices'
import type { DeviceListFilters } from '@/db/queries/devices'
import {
  DEVICE_TYPES,
  deviceStatusLabel,
  deviceTypeName,
} from '@/lib/device-schema'
import { pluralDevices } from '@/lib/ru'
import { DeviceDialog } from './device-dialog'
import { FilterBar } from './filter-bar'
import { buildDevicesQuery, parseDevicesSearchParams } from './query-params'

export const metadata: Metadata = {
  title: 'Устройства',
}

const PAGE_SIZE = 20

type DevicesSearchParams = {
  [key: string]: string | string[] | undefined
}

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<DevicesSearchParams>
}) {
  await requireSession() // defense-in-depth: proxy + in-app guard
  const sp = await searchParams
  // The ONE parser (query-params.ts): every param validated server-side —
  // invalid values degrade to the inactive sentinel, never a 500 (T-03-04).
  const filters = parseDevicesSearchParams(sp)
  // Page is pagination state, not a filter: Number + integer guard (a
  // fractional ?page= would bind a non-integer OFFSET and crash the query —
  // WR-01); the query still clamps into [1, pages].
  const parsedPage = Number(sp.page)
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
  // Strip the URL-layer sentinels into the db-layer contract: undefined
  // means INACTIVE (plan-02 presence guards assume undefined — never leak
  // 'all'/null/false/''). listDevices composes only the active predicates.
  const listFilters: DeviceListFilters = {}
  if (filters.q !== '') listFilters.q = filters.q
  if (filters.status !== 'all') listFilters.status = filters.status
  if (filters.departmentId !== null) listFilters.departmentId = filters.departmentId
  if (filters.warranty !== 'all') listFilters.warranty = filters.warranty
  if (filters.ramNoUpgrade) listFilters.ramNoUpgrade = true
  const { rows, total, page: current, pages } = listDevices({
    type: filters.type,
    page,
    pageSize: PAGE_SIZE,
    filters: listFilters,
  })
  // D-05: any active dimension renames the counter to «Найдено: …»; without
  // one the phase-3 counter is unchanged. Trigger set grows with the phase —
  // search + warranty now, the remaining filters in plan-02 Task 3 (type-only
  // already scoped the phase-3 count).
  const searching = filters.q !== '' || filters.warranty !== 'all'

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            Устройства
          </h1>
          <p className="text-sm text-ink-secondary">
            {searching ? `Найдено: ${pluralDevices(total)}` : pluralDevices(total)}
          </p>
        </div>
        {/* Field configs ride as flat serialized props (D-02 + vercel
            server-serialization): the dialog renders per-type fields from the
            same keystone the server validates against. */}
        <DeviceDialog label="Добавить устройство" typeConfigs={DEVICE_TYPES} />
      </div>

      {/* Filter bar (D-12): one visible bar — the server composition lives
          in FilterBar (search + type + warranty now; the remaining filters
          join in plan-02 Task 3). The search island keeps the current list
          mounted through the server swap (startTransition, no skeleton flash
          per keystroke). */}
      <FilterBar filters={filters} />

      {rows.length === 0 ? (
        /* Empty states, copy verbatim from the UI-SPEC copywriting contract,
           precedence: zero under an active search or warranty filter explains
           + resets (D-04); zero overall invites the first device; zero under
           a type filter explains — it never resets. */
        <div className="mt-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-hairline">
          {searching ? (
            <>
              <h2 className="text-xl font-semibold tracking-tight text-ink">
                Ничего не найдено
              </h2>
              <p className="mt-1 text-sm text-ink-secondary">
                Проверьте раскладку: набранное кириллицей „С123“ найдёт „C123“.
              </p>
              {/* Plain server Link — no island. On arrival q='' flows down
                  and the island's value === q guard clears the input. */}
              <Link
                href="/devices"
                className="mt-4 inline-flex h-10 items-center rounded-lg bg-secondary px-3 text-sm text-secondary-foreground transition-all duration-100 ease-out hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] active:scale-[0.97]"
              >
                Сбросить фильтры
              </Link>
            </>
          ) : filters.type === 'all' ? (
            <>
              <h2 className="text-xl font-semibold tracking-tight text-ink">
                Пока нет устройств
              </h2>
              <p className="mt-1 text-sm text-ink-secondary">
                Добавьте первое устройство — выберите тип и заполните поля.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold tracking-tight text-ink">
                Нет устройств этого типа
              </h2>
              <p className="mt-1 text-sm text-ink-secondary">
                Добавьте устройство этого типа или выберите другой фильтр.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-hairline overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-hairline">
            {rows.map((row) => (
              <li key={row.id}>
                {/* Two-line row (D-05): модель + pill on line 1; тип · серийник
                    · инвентарник · держатель on line 2 — all six columns of the
                    column list. Both lines truncate with a full title (overflow
                    consideration); the numbers render mono (UI-SPEC Typography).
                    href targets the (card) route from plan 03-02 — until it
                    exists the not-found page answers, never a 500. */}
                <Link
                  href={`/devices/${row.id}`}
                  title={[
                    row.model,
                    deviceTypeName(row.typeKey),
                    row.serialNumber,
                    row.inventoryNumber ?? '—',
                    row.holder ?? '—',
                  ].join(' · ')}
                  className="flex min-h-11 items-center gap-3 px-4 py-2 transition-colors duration-150 ease-out hover:bg-page"
                >
                  {/* REG-05 «thumbnails in lists»: leading cover (first
                      photo, served by the authorized route) — devices
                      without photos render no placeholder box, the text
                      position varies by row (UI-SPEC Defaults #9). */}
                  {row.coverAttachmentId ? (
                    // eslint-disable-next-line @next/next/no-img-element -- pre-sized thumb from the auth'd route; no optimizer hop (04-RESEARCH)
                    <img
                      src={`/api/attachments/${row.coverAttachmentId}?device=${row.id}&variant=thumb`}
                      alt=""
                      loading="lazy"
                      className="size-10 shrink-0 rounded-lg object-cover"
                    />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-base text-ink">
                        {row.model}
                      </span>
                      <span className="shrink-0 rounded-full bg-black/5 px-2 py-1 text-sm text-ink-secondary">
                        {deviceStatusLabel(row.status)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-ink-secondary">
                      {deviceTypeName(row.typeKey)}
                      {' · '}
                      <span className="font-mono">{row.serialNumber}</span>
                      {' · '}
                      <span className="font-mono">
                        {row.inventoryNumber ?? '—'}
                      </span>
                      {' · '}
                      {row.holder ?? '—'}
                    </span>
                  </span>
                  <ChevronRight
                    size={16}
                    className="shrink-0 text-[#C7C7CC]"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>

          {/* Quiet prev/next (opacity-40, no href at the boundary) + N-of-M
              label; links rebuild the whole query string via the ONE builder
              (buildDevicesQuery — filters preserved, page swapped). A
              zero-page is impossible: listDevices clamps the page. */}
          <nav
            aria-label="Страницы списка"
            className="mt-4 flex items-center justify-between"
          >
            {current > 1 ? (
              <Link
                href={buildDevicesQuery(filters, current - 1)}
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
                href={buildDevicesQuery(filters, current + 1)}
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
