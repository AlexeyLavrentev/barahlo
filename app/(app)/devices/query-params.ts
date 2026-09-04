import { z } from 'zod'
import { isDeviceStatusKey, isDeviceTypeKey } from '@/lib/device-schema'
import type { DeviceStatusKey } from '@/lib/device-schema'
// Type-only import — erased at compile time, the db module is never bundled.
import type { DeviceListType } from '@/db/queries/devices'

// The ONE params module of /devices (phase 5): the single source of the URL
// filter vocabulary, of the server-side parse and of the query-string
// builder. Pagination links, every island and the CSV route (plan 04) call
// buildDevicesQuery / parseDevicesSearchParams — no second parse path can
// drift.
//
// Pure and immutable: no framework imports, no module-level mutable state
// (vercel server-no-shared-module-state) — safe to import from RSC, client
// islands and vitest alike. Islands receive flat validated values as props
// (server-serialization — never functions across the RSC boundary) and
// import this module's builder themselves.

// URL-layer filter state. The sentinels live HERE: '' / 'all' / null / false
// mean INACTIVE. The page strips them into the db-layer DeviceListFilters
// (undefined-for-inactive) before querying.
export type DeviceFilters = {
  q: string
  type: DeviceListType
  status: DeviceStatusKey | 'all'
  departmentId: number | null
  warranty: 'w30' | 'w60' | 'expired' | 'all'
  ramNoUpgrade: boolean
}

// D-15 presets verbatim; the 60-day headline preset first (UI-SPEC Defaults
// #12). Single source for the island options, the parser and the tests.
export const WARRANTY_ITEMS = [
  { value: 'all', label: 'Вся гарантия' },
  { value: 'w60', label: 'Истекает ≤ 60 дней' },
  { value: 'w30', label: 'Истекает ≤ 30 дней' },
  { value: 'expired', label: 'Истекла' },
] as const

const WARRANTY_VALUES: readonly string[] = WARRANTY_ITEMS.map((w) => w.value)

function isWarrantyValue(value: unknown): value is DeviceFilters['warranty'] {
  return typeof value === 'string' && WARRANTY_VALUES.includes(value)
}

// Same shape as the card pages' IdSchema (z.coerce — a stringy ?dept= is the
// only form a URL param arrives in).
const DepartmentIdSchema = z.coerce.number().int().positive()

// Param-name convention (single source): q, type, status, dept, warranty,
// ram, page. page is pagination state, not a filter — the list page parses
// it locally; buildDevicesQuery takes it as an argument.
//
// searchParams is untyped user input — validate, never trust: every param
// degrades to its inactive sentinel, never a 500 (T-03-04 discipline).
export function parseDevicesSearchParams(
  sp: Record<string, string | string[] | undefined>,
): DeviceFilters {
  const rawQ = typeof sp.q === 'string' ? sp.q : ''
  const q = rawQ.trim().slice(0, 100)
  const type = isDeviceTypeKey(sp.type) ? sp.type : 'all'
  const status = isDeviceStatusKey(sp.status) ? sp.status : 'all'
  const parsedDept =
    typeof sp.dept === 'string' ? DepartmentIdSchema.safeParse(sp.dept) : undefined
  const departmentId = parsedDept?.success ? parsedDept.data : null
  const warranty = isWarrantyValue(sp.warranty) ? sp.warranty : 'all'
  // Presence of ram=1 — any other value deactivates (the server predicate
  // self-limits to laptops regardless; plan 02 wires the chip).
  const ramNoUpgrade = sp.ram === '1'
  return { q, type, status, departmentId, warranty, ramNoUpgrade }
}

// The ONE builder pagination links, islands and the CSV link all call: FULL
// query string, inactive sentinels omitted, page omitted when 1.
// D-08 coupling lives HERE in the one builder: switching type to a
// non-laptop drops the ram param so it can never silently reactivate later.
export function buildDevicesQuery(f: DeviceFilters, page = 1): string {
  const params = new URLSearchParams()
  if (f.q !== '') params.set('q', f.q)
  if (f.type !== 'all') params.set('type', f.type)
  if (f.status !== 'all') params.set('status', f.status)
  if (f.departmentId !== null) params.set('dept', String(f.departmentId))
  if (f.warranty !== 'all') params.set('warranty', f.warranty)
  if (f.ramNoUpgrade && f.type === 'laptop') params.set('ram', '1')
  if (page !== 1) params.set('page', String(page))
  return `?${params.toString()}`
}
