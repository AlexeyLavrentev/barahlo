import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { requireSession } from '@/lib/auth'
import { listDevices } from '@/db/queries/devices'
import {
  DEVICE_TYPES,
  deviceStatusLabel,
  deviceTypeName,
  isDeviceTypeKey,
} from '@/lib/device-schema'
import { pluralDevices } from '@/lib/ru'
import { DeviceDialog } from './device-dialog'
import { DeviceTypeFilter } from './type-filter'

export const metadata: Metadata = {
  title: 'Устройства',
}

const PAGE_SIZE = 20

type DevicesSearchParams = {
  [key: string]: string | string[] | undefined
}

// Links always rebuild the FULL query string — a bare `?page=2` would drop
// the active filter (Pitfall 3); switching the filter resets to page 1.
function buildQuery(type: string, page: number): string {
  const params = new URLSearchParams()
  if (type !== 'all') params.set('type', type)
  params.set('page', String(page))
  return `?${params.toString()}`
}

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<DevicesSearchParams>
}) {
  await requireSession() // defense-in-depth: proxy + in-app guard
  const sp = await searchParams
  // searchParams is untyped user input — validate, never trust (T-03-04):
  // type via the 4-key enum (anything else = all), page via Number + clamp.
  const type = isDeviceTypeKey(sp.type) ? sp.type : 'all'
  const page = Math.max(1, Number(sp.page) || 1)
  const { rows, total, page: current, pages } = listDevices({
    type,
    page,
    pageSize: PAGE_SIZE,
  })

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            Устройства
          </h1>
          <p className="text-sm text-ink-secondary">{pluralDevices(total)}</p>
        </div>
        {/* Field configs ride as flat serialized props (D-02 + vercel
            server-serialization): the dialog renders per-type fields from the
            same keystone the server validates against. */}
        <DeviceDialog label="Добавить устройство" typeConfigs={DEVICE_TYPES} />
      </div>

      {/* Type filter (D-05): dropdown island, full-query-string push, page
          reset to 1. The trigger shows the active choice, never an accent. */}
      <div className="mt-6">
        <DeviceTypeFilter current={type} />
      </div>

      {rows.length === 0 ? (
        /* Empty states, copy verbatim from the UI-SPEC copywriting contract:
           zero overall invites the first device (the CTA above stays
           visible); zero under a filter explains — it never resets. */
        <div className="mt-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-hairline">
          {type === 'all' ? (
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
                  className="flex min-h-11 items-center gap-2 px-4 py-2 transition-colors duration-150 ease-out hover:bg-page"
                >
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
              label; links rebuild the whole query string via buildQuery. A
              zero-page is impossible: listDevices clamps the page. */}
          <nav
            aria-label="Страницы списка"
            className="mt-4 flex items-center justify-between"
          >
            {current > 1 ? (
              <Link
                href={buildQuery(type, current - 1)}
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
                href={buildQuery(type, current + 1)}
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
