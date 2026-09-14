import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { requireSession } from '@/lib/auth'
import {
  deviceCountByStatus,
  deviceCountByType,
  nearestExpiringWarranties,
  totalDeviceCount,
  warrantyPresetCounts,
  type NearestExpiringWarranty,
} from '@/db/queries/devices'
import {
  listRecentMovements,
  type RecentMovementView,
} from '@/db/queries/movements'
import type {
  DeviceStatusKey,
  DeviceTypeKey,
} from '@/lib/device-schema'
import {
  DEVICE_STATUS_KEYS,
  DEVICE_TYPES,
  deviceStatusLabel,
} from '@/lib/device-schema'
import { movementEventLabel } from '@/lib/movement-schema'
import { occurredAtFormat, pluralDevices } from '@/lib/ru'
import { displayTodayUtc } from '@/lib/warranty'
import { WarrantyDate, formatWarrantyDate } from '@/lib/warranty-date'
import { buildDevicesQuery, TYPE_ITEMS } from './devices/query-params'

export const metadata: Metadata = {
  title: 'Дашборд',
}

// Labels of the four type tiles: a lookup over TYPE_ITEMS from
// devices/query-params.ts — the same shared module the type-filter island's
// FILTER_ITEMS composes (app/(app)/devices/type-filter.tsx), so the UI-SPEC
// copy contract is byte-exact BY CONSTRUCTION (WR-02), not by two hand-kept
// lists. DEVICE_TYPES' singular names are card/row copy, not tile copy.
const TYPE_TILE_LABELS = new Map(
  TYPE_ITEMS.map((item) => [item.value, item.label] as const),
)

// D-02's locked status order — deliberately NOT the filter's in_stock-first
// order: the dashboard leads with the live state. Labels come from the
// keystone's deviceStatusLabel (no parallel status map).
const STATUS_TILE_ORDER: readonly DeviceStatusKey[] = [
  'assigned',
  'in_stock',
  'repair',
  'disposed',
]

// Every tile href is built by the ONE builder (D-03): a FULL DeviceFilters
// object with every other dimension at its inactive sentinel — sentinel
// omission is the builder's job, so `?type=laptop` / `?status=repair` come
// out clean. The builder emits the query string alone (relative on /devices
// itself), so the page prefixes its own target path; hand-concatenated
// filter URLs are forbidden.
function typeTileHref(type: DeviceTypeKey): string {
  return `/devices${buildDevicesQuery({
    q: '',
    type,
    status: 'all',
    departmentId: null,
    warranty: 'all',
    ramNoUpgrade: false,
  })}`
}

function statusTileHref(status: DeviceStatusKey): string {
  return `/devices${buildDevicesQuery({
    q: '',
    type: 'all',
    status,
    departmentId: null,
    warranty: 'all',
    ramNoUpgrade: false,
  })}`
}

// Warranty counter href (D-04): the ONE builder with a FULL DeviceFilters —
// identical to the tile helpers except the warranty preset. Hand-built
// filter URLs stay forbidden (orchestrator resolution 7); the builder owns
// sentinel omission, so `?warranty=w30` / `?warranty=w60` / `?warranty=
// expired` come out clean.
function warrantyCounterHref(preset: 'w30' | 'w60' | 'expired'): string {
  return `/devices${buildDevicesQuery({
    q: '',
    type: 'all',
    status: 'all',
    departmentId: null,
    warranty: preset,
    ramNoUpgrade: false,
  })}`
}

// D-04's locked counter order: 30 → 60 → истекла (UI-SPEC Copywriting).
// Each label carries the trailing colon so the row renders ONE static text
// node («Истекает ≤ 30 дней: 3») — the smoke needles stay contiguous across
// the React SSR text-splitting (the «Всего:» lesson from 06-01).
const WARRANTY_COUNTERS: readonly {
  preset: 'w30' | 'w60' | 'expired'
  label: string
}[] = [
  { preset: 'w30', label: 'Истекает ≤ 30 дней:' },
  { preset: 'w60', label: 'Истекает ≤ 60 дней:' },
  { preset: 'expired', label: 'Истекла:' },
]

// Row recipe of the warranty card's link rows (counters and top-5): the
// standing list-row anatomy plus the page-wide focus semantics (UI-SPEC —
// focus-visible rings on tile/row links).
const WARRANTY_ROW_CLASS =
  'flex min-h-11 items-center justify-between gap-2 px-4 py-2 outline-none transition-colors duration-150 ease-out hover:bg-page focus-visible:ring-2 focus-visible:ring-accent/30'

const TILE_CLASS =
  'rounded-2xl bg-white p-4 shadow-sm ring-1 ring-hairline outline-none transition-all duration-100 ease-out hover:bg-page active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-accent/30'

const NAME_LINK_CLASS = 'text-accent underline-offset-2 hover:underline'

// Route table of the feed's line 2 (D-05, UI-SPEC): ONE source for both the
// rendered segments and the title text. «склад» substitutes a null person
// slot ONLY in the three custody moves; to_repair keeps «от {держателя}»
// when there was one (a repair is not a stock move); received / from_repair
// / disposed carry no route — the date stands alone. Employee ids ride in
// the SELECT (RecentMovementView) exactly so these names can be links;
// archived employees link like active ones (the card shows its own state).
type RouteSegment = { text: string; href: string | null }

function routeSegments(event: RecentMovementView): RouteSegment[] | null {
  const from: RouteSegment =
    event.fromId !== null
      ? { text: event.fromName ?? 'склад', href: `/employees/${event.fromId}` }
      : { text: 'склад', href: null }
  const to: RouteSegment =
    event.toId !== null
      ? { text: event.toName ?? 'склад', href: `/employees/${event.toId}` }
      : { text: 'склад', href: null }
  switch (event.eventType) {
    case 'assigned':
      return [{ text: 'склад', href: null }, { text: ' → ', href: null }, to]
    case 'transferred':
      return [from, { text: ' → ', href: null }, to]
    case 'returned':
      return [from, { text: ' → ', href: null }, { text: 'склад', href: null }]
    case 'to_repair':
      return event.fromId !== null ? [{ text: 'от ', href: null }, from] : null
    default:
      // received / from_repair / disposed — no route
      return null
  }
}

// One feed row (UI-SPEC Visual Details): segmented links — the row container
// has NO href of its own (nested anchors are invalid HTML and break
// hydration); the model anchor is the row's primary link, employee names are
// their own links, the pill and the date are plain siblings. Line 1:
// pill · модель (accent, truncates) + серийник (mono, shrink-0); line 2:
// маршрут (truncates first) + дата (shrink-0). Titles carry the full texts.
function FeedRow({ event }: { event: RecentMovementView }) {
  const route = routeSegments(event)
  const routeTitle = route?.map((segment) => segment.text).join('')
  return (
    <li className="min-h-11 px-4 py-2 transition-colors duration-150 ease-out hover:bg-page">
      <div className="flex items-center gap-2">
        <span
          className={
            event.eventType === 'disposed'
              ? 'shrink-0 rounded-full bg-destructive/10 px-2 py-1 text-sm text-destructive'
              : 'shrink-0 rounded-full bg-black/5 px-2 py-1 text-sm text-ink-secondary'
          }
        >
          {movementEventLabel(event.eventType)}
        </span>
        <Link
          href={`/devices/${event.deviceId}`}
          title={`${movementEventLabel(event.eventType)} · ${event.model} · ${event.serialNumber}`}
          className="flex min-w-0 flex-1 items-center justify-between gap-2"
        >
          <span className="truncate text-base text-accent hover:underline underline-offset-2">
            {event.model}
          </span>
          <span className="shrink-0 font-mono text-sm text-ink-secondary">
            {event.serialNumber}
          </span>
        </Link>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        {route !== null ? (
          <span className="truncate text-sm text-ink-secondary" title={routeTitle}>
            {route.map((segment, index) =>
              segment.href !== null ? (
                <Link key={index} href={segment.href} className={NAME_LINK_CLASS}>
                  {segment.text}
                </Link>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
            )}
          </span>
        ) : null}
        <span className="shrink-0 text-sm text-ink-secondary">
          {occurredAtFormat.format(event.occurredAt)}
        </span>
      </div>
    </li>
  )
}

// One top-5 row of the «Гарантия» block (UI-SPEC Visual Details): line 1 —
// модель (truncate) + chevron; line 2 — «гар. до » (secondary prefix,
// rendered by the page) + WarrantyDate variant="card". The card variant is
// the bare colored date inheriting 14/400: inside the w60 window it renders
// warn orange BY CONSTRUCTION — the query only admits w60-alive devices, so
// green is impossible here (the phase-5 invariant, not a page rule). No
// date-diff or color logic of its own (Don't-Hand-Roll, P2): the component
// owns the math, `today` is the page's single once-per-render Date.
function WarrantyTopRow({
  item,
  today,
}: {
  item: NearestExpiringWarranty
  today: Date
}) {
  return (
    <li>
      <Link
        href={`/devices/${item.id}`}
        title={`${item.model} · гар. до ${formatWarrantyDate(item.warrantyUntil)}`}
        className={WARRANTY_ROW_CLASS}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base text-ink">
            {item.model}
          </span>
          <span className="mt-1 block text-sm text-ink-secondary">
            {'гар. до '}
            <WarrantyDate
              value={item.warrantyUntil}
              today={today}
              variant="card"
            />
          </span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-[#C7C7CC]" aria-hidden />
      </Link>
    </li>
  )
}

// The dashboard (DASH-01/DASH-02/DASH-03, D-01): a pure read-model over the
// existing core — aggregate counters beside the same predicates the /devices
// filters run, the warranty block over the very same operators, and the 10
// most recent movements. No mutations, no client islands
// (D-06: the nav below stays the page's only client JS), no cache — every
// visit re-runs the queries. The page reads no searchParams at all.
export default async function DashboardPage() {
  await requireSession() // defense-in-depth: proxy + in-app guard
  // WAR-01 contract: «today» is computed ONCE per render — plan 06-02 hands
  // this SAME instant to the warranty counters and WarrantyDate.
  const today = displayTodayUtc()
  const total = totalDeviceCount()
  // Zero-default (Pitfall 3): GROUP BY returns no row for an absent bucket —
  // tiles iterate the keystone lists and look the counts up with ?? 0, so
  // all eight tiles always exist, even on a fresh install (eight honest
  // zeros). A phantom tile from an unknown value is impossible: iteration
  // runs over the keystones, never over the SQL rows.
  const countByType = new Map(
    deviceCountByType().map((row) => [row.typeKey, row.n]),
  )
  const countByStatus = new Map(
    deviceCountByStatus().map((row) => [row.status, row.n]),
  )
  const feed = listRecentMovements(10)
  // DASH-02 (D-04): the SAME once-per-render today feeds the warranty
  // counters, the top-5 query and every WarrantyDate below — three
  // consumers, one Date, so the counter boundaries and the rendered date
  // colors cannot disagree.
  const warranty = warrantyPresetCounts(today)
  const nearest = nearestExpiringWarranties(5, today)

  return (
    <section>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          Дашборд
        </h1>
        {/* D-03: the total is a quiet headline, NOT a link. */}
        <p className="mt-1 text-sm text-ink-secondary">
          Всего: {pluralDevices(total)}
        </p>
      </div>

      {/* DASH-01: one grid, eight quiet tiles — types first, then statuses.
          All eight are deep links into the phase-5 filters; a dashboard of
          accent cards would annihilate the 10% discipline, so tiles stay
          white (UI-SPEC Defaults #4). */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {DEVICE_TYPES.map((type) => (
          <Link key={type.key} href={typeTileHref(type.key)} className={TILE_CLASS}>
            <span className="block text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] text-ink">
              {countByType.get(type.key) ?? 0}
            </span>
            <span className="mt-1 block truncate text-sm text-ink-secondary">
              {TYPE_TILE_LABELS.get(type.key)}
            </span>
          </Link>
        ))}
        {STATUS_TILE_ORDER.map((status) => (
          <Link
            key={status}
            href={statusTileHref(status)}
            className={TILE_CLASS}
          >
            <span className="block text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] text-ink">
              {countByStatus.get(status) ?? 0}
            </span>
            <span className="mt-1 block truncate text-sm text-ink-secondary">
              {deviceStatusLabel(status)}
            </span>
          </Link>
        ))}
      </div>

      {/* DASH-02 zone (D-02): «Гарантия» first — left column on sm+, first
          on mobile in source order — the feed second; the grid owns the
          spacing (gap-8 stacked / gap-6 side-by-side). */}
      <div className="mt-8 grid gap-8 sm:grid-cols-2 sm:gap-6">
        {/* DASH-02 (D-04): one card reading as one block — three counter
            rows in the locked 30 → 60 → истекла order (each a deep link into
            the matching phase-5 preset, always rendered even at «: 0» — the
            target is a valid empty list), then the sub-header, then the top-5
            nearest still-alive warranties (or the
            honest empty copy — true whenever w30 = w60 = 0, including when
            «Истекла: K» above shows K > 0). */}
        <section>
          <h2 className="text-xl font-semibold tracking-tight text-ink">
            Гарантия
          </h2>
          <div className="mt-3 divide-y divide-hairline rounded-2xl bg-white shadow-sm ring-1 ring-hairline">
            {WARRANTY_COUNTERS.map(({ preset, label }) => (
              <Link
                key={preset}
                href={warrantyCounterHref(preset)}
                className={WARRANTY_ROW_CLASS}
              >
                <span className="text-sm text-ink">{`${label} ${warranty[preset]}`}</span>
                <ChevronRight
                  size={16}
                  className="shrink-0 text-[#C7C7CC]"
                  aria-hidden
                />
              </Link>
            ))}
            {/* The allowed 14/600 mini-header separating counters from the
                top-5 inside the same card — UI-SPEC's copy contract. */}
            <p className="px-4 py-2 text-sm font-semibold text-ink">
              Ближайшие сроки
            </p>
            {nearest.length === 0 ? (
              <p className="px-4 py-2 text-sm text-ink-secondary">
                Нет техники с истекающей гарантией
              </p>
            ) : (
              <ul className="divide-y divide-hairline">
                {nearest.map((item) => (
                  <WarrantyTopRow key={item.id} item={item} today={today} />
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* DASH-03 (D-05): the 10 most recent movements. The empty feed is the
            NORMAL fresh-install case (Pitfall 8: createDevice writes no
            movement event) — the copy promises nothing. */}
        <section>
          <h2 className="text-xl font-semibold tracking-tight text-ink">
            Последние перемещения
          </h2>
          {feed.length === 0 ? (
            <div className="mt-3 divide-y divide-hairline rounded-2xl bg-white shadow-sm ring-1 ring-hairline">
              <p className="px-4 py-2 text-sm text-ink">
                Перемещений пока нет
              </p>
              <p className="px-4 py-2 text-sm text-ink-secondary">
                Здесь появятся выдачи, возвраты и передачи техники.
              </p>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-hairline overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-hairline">
              {feed.map((event) => (
                <FeedRow key={event.id} event={event} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  )
}
