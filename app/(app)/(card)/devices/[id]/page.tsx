import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { getDevice, type DeviceRow } from '@/db/queries/devices'
import {
  deviceStatusLabel,
  deviceTypeName,
  typeFields,
  type DeviceField,
} from '@/lib/device-schema'
// This page lives in the (card) route group: a segment loading.tsx on the
// list branch streams its whole subtree (child segments included) and flushes
// status 200 before notFound() can answer — grouping the card separately
// keeps the 404 contract (T-02-07) while the list keeps its skeleton. No
// loading.tsx may ever appear next to this file.

// The URL id is untyped user input that reaches SQL (T-03-02): it must pass
// a positive-integer zod check BEFORE any database access — garbage ids 404
// through notFound(), they never reach getDevice().
const IdSchema = z.coerce.number().int().positive()

// Module-level formatters (server-hoist-static-io): one Intl instance per
// process, not per render. Dates are stored as UTC-midnight timestamps —
// formatting in UTC keeps the rendered calendar day equal to the yyyy-mm-dd
// the form wrote, on any host timezone.
const dateFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC' })
const priceFormat = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
})

function dateValue(value: Date | null): string | null {
  return value ? dateFormat.format(value) : null
}

function priceValue(value: number | null): string | null {
  return value === null ? null : priceFormat.format(value)
}

// Card text of one per-type field (UI-SPEC per-type table): quantities render
// bare (the label carries the unit), the diagonal gets its ″ mark, the laptop
// flag reads Да/Нет (null = never set → dash), empty optionals are a dash (D-06).
function typedValueOf(field: DeviceField, device: DeviceRow): string | null {
  switch (field.key) {
    case 'ramGb':
      return device.ramGb === null ? null : String(device.ramGb)
    case 'ramUpgraded':
      return device.ramUpgraded === null
        ? null
        : device.ramUpgraded === 1
          ? 'Да'
          : 'Нет'
    case 'ssdGb':
      return device.ssdGb === null ? null : String(device.ssdGb)
    case 'screenDiagonal':
      return device.screenDiagonal === null
        ? null
        : `${device.screenDiagonal}″`
    case 'panelType':
      return device.panelType
    case 'portCount':
      return device.portCount === null ? null : String(device.portCount)
    case 'peripheralKind':
      return device.peripheralKind
  }
}

// Card group (D-06): 20/600 header + one white card of hairline-separated
// label/value rows — the same recipe the list rows use, so list and card read
// as one system (UI-SPEC «Card groups»).
function FieldGroup({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
      <div className="mt-3 divide-y divide-hairline rounded-2xl bg-white shadow-sm ring-1 ring-hairline">
        {children}
      </div>
    </section>
  )
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 px-4 py-2">
      <span className="text-sm text-ink-secondary">{label}</span>
      <span className="min-w-0 truncate text-right text-base text-ink">
        {children}
      </span>
    </div>
  )
}

// A missing optional value is a secondary-ink dash, never an empty cell (D-06).
function Value({ value, mono }: { value: string | null; mono?: boolean }) {
  if (value === null || value === '') {
    return <span className="text-ink-secondary">—</span>
  }
  return <span className={mono ? 'font-mono text-sm' : undefined}>{value}</span>
}

// Notes wrap BELOW the label, full width — the one row that breaks the
// label/value split on purpose (UI-SPEC «Основное»).
function NotesRow({ value }: { value: string | null }) {
  return (
    <div className="px-4 py-2">
      <p className="text-sm text-ink-secondary">Заметки</p>
      {value ? (
        <p className="mt-1 whitespace-pre-line text-base text-ink">{value}</p>
      ) : (
        <p className="mt-1 text-base text-ink-secondary">—</p>
      )}
    </div>
  )
}

// Phase 4 land: content placeholders inside the normal card recipe — no
// skeleton, no controls (UI-SPEC «Card placeholders»).
function PlaceholderRow({ children }: { children: ReactNode }) {
  return <p className="px-4 py-2 text-sm text-ink-secondary">{children}</p>
}

export default async function DeviceCardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireSession() // defense-in-depth: proxy + in-app guard
  const { id } = await params
  const parsed = IdSchema.safeParse(id)
  if (!parsed.success) notFound()
  const device = getDevice(parsed.data)
  if (!device) notFound()

  // The keystone decides which characteristic rows exist (D-02) — the card
  // keeps no parallel field list; groups render in the fixed plan order:
  // Основное → Характеристики типа → Закупка.
  const fields = typeFields(device.typeKey)

  return (
    <section className="max-w-2xl">
      <Link
        href="/devices"
        className="text-sm text-ink-secondary transition-colors hover:text-ink"
      >
        ← Устройства
      </Link>

      <div className="mt-4">
        <h1 className="text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] text-ink">
          {device.model}
        </h1>
        {/* Meta line: тип · серийник (mono). The pill sits beside it only
            while the device is NOT stocked — absence IS the default state
            (UI-SPEC); neutral styling either way, color arrives in phase 5. */}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-sm text-ink-secondary">
            {deviceTypeName(device.typeKey)} ·{' '}
            <span className="font-mono">{device.serialNumber}</span>
          </p>
          {device.status !== 'in_stock' ? (
            <span className="rounded-full bg-black/5 px-2 py-1 text-sm text-ink-secondary">
              {deviceStatusLabel(device.status)}
            </span>
          ) : null}
        </div>
      </div>

      <FieldGroup title="Основное">
        <FieldRow label="Тип">{deviceTypeName(device.typeKey)}</FieldRow>
        <FieldRow label="Модель">{device.model}</FieldRow>
        <FieldRow label="Серийный номер">
          <Value value={device.serialNumber} mono />
        </FieldRow>
        <FieldRow label="Инвентарный номер">
          {/* «—» until a 1C number is entered (D-16). */}
          <Value value={device.inventoryNumber} mono />
        </FieldRow>
        <FieldRow label="Статус">
          <span className="rounded-full bg-black/5 px-2 py-1 text-sm text-ink-secondary">
            {deviceStatusLabel(device.status)}
          </span>
        </FieldRow>
        <FieldRow label="Держатель">
          <Value value={device.holder} />
        </FieldRow>
        <NotesRow value={device.notes} />
      </FieldGroup>

      {/* Only the device's OWN type fields (REG-03 boundary made visible);
          an unknown type key has no fields and no section. */}
      {fields.length > 0 ? (
        <FieldGroup title="Характеристики типа">
          {fields.map((field) => (
            <FieldRow key={field.key} label={field.label}>
              <Value value={typedValueOf(field, device)} />
            </FieldRow>
          ))}
        </FieldGroup>
      ) : null}

      <FieldGroup title="Закупка">
        <FieldRow label="Дата закупки">
          <Value value={dateValue(device.purchaseDate)} />
        </FieldRow>
        <FieldRow label="Стоимость">
          <Value value={priceValue(device.purchasePrice)} />
        </FieldRow>
        <FieldRow label="Поставщик">
          <Value value={device.supplier} />
        </FieldRow>
        {/* No warranty coloring — semantics are WAR-01/Phase 5 (UI-SPEC). */}
        <FieldRow label="Гарантия до">
          <Value value={dateValue(device.warrantyUntil)} />
        </FieldRow>
      </FieldGroup>

      <FieldGroup title="История перемещений">
        <PlaceholderRow>Здесь появится история выдач и возвратов.</PlaceholderRow>
      </FieldGroup>
      <FieldGroup title="Фото">
        <PlaceholderRow>Здесь появятся фотографии устройства.</PlaceholderRow>
      </FieldGroup>
    </section>
  )
}
