import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { MAX_PHOTOS } from '@/lib/photos'
import { getDevice, type DeviceRow } from '@/db/queries/devices'
import { listByDevice } from '@/db/queries/attachments'
import {
  listActiveEmployees,
  listTimeline,
} from '@/db/queries/movements'
import {
  DEVICE_TYPES,
  deviceStatusLabel,
  deviceTypeName,
  typeFields,
  type DeviceField,
} from '@/lib/device-schema'
import {
  DeviceDialog,
  type DeviceDialogDevice,
} from '@/app/(app)/devices/device-dialog'
import { DeviceActions } from '@/app/(app)/devices/device-actions'
import { displayTodayUtc } from '@/lib/warranty'
import { WarrantyDate } from '@/lib/warranty-date'
import { PhotoGrid } from './photo-grid'
import { Timeline } from './timeline'
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

// yyyy-mm-dd for the edit dialog's input[type=date] — the same UTC reading as
// the display formatters, so what the user edits is what the card shows.
function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null
}

// The client edit island gets a flat serializable snapshot (vercel
// server-serialization): Dates become yyyy-mm-dd strings, no Date objects, no
// query rows. Type/status/holder are display-only (D-06) and absent here.
function dialogDeviceOf(device: DeviceRow): DeviceDialogDevice {
  return {
    id: device.id,
    typeKey: device.typeKey,
    model: device.model,
    serialNumber: device.serialNumber,
    inventoryNumber: device.inventoryNumber,
    notes: device.notes,
    purchaseDate: isoDate(device.purchaseDate),
    purchasePrice: device.purchasePrice,
    supplier: device.supplier,
    warrantyUntil: isoDate(device.warrantyUntil),
    ramGb: device.ramGb,
    ramUpgraded: device.ramUpgraded,
    ssdGb: device.ssdGb,
    screenDiagonal: device.screenDiagonal,
    panelType: device.panelType,
    portCount: device.portCount,
    peripheralKind: device.peripheralKind,
  }
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

// Status pill (04-UI-SPEC color table): the three working statuses stay
// neutral bg-black/5; the terminal «Списано» is the ONE tinted pill —
// destructive 10% fill with destructive text, the red family of the
// «Списать» action that caused it. Red is reserved to exactly these two
// fills in the UI (the other being the dispose dialog's primary button).
function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-sm ${
        status === 'disposed'
          ? 'bg-destructive/10 text-destructive'
          : 'bg-black/5 text-ink-secondary'
      }`}
    >
      {deviceStatusLabel(status)}
    </span>
  )
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
            (UI-SPEC); «Списано» tints red (StatusPill), the rest neutral. */}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-sm text-ink-secondary">
            {deviceTypeName(device.typeKey)} ·{' '}
            <span className="font-mono">{device.serialNumber}</span>
          </p>
          {device.status !== 'in_stock' ? (
            <StatusPill status={device.status} />
          ) : null}
        </div>
      </div>

      {/* Custody actions (MOVE-01..03, D-03, D-04, D-08): «Редактировать»
          first, then the status matrix (in_stock → Выдать accent · В ремонт ·
          Списать; assigned → Принять · Передать · В ремонт · Списать; repair
          → Из ремонта accent · Списать; «Выдать» is hidden on assigned and
          the server guard re-validates every transition). For a disposed
          device the ENTIRE row stays hidden — D-03 view-only: the card keeps
          only its timeline and fields. flex-wrap — up to five buttons wrap on
          narrow screens (04-UI-SPEC spacing). */}
      {device.status !== 'disposed' ? (
        <div className="mt-6 flex flex-wrap gap-2">
          <DeviceDialog
            label="Редактировать"
            typeConfigs={DEVICE_TYPES}
            device={dialogDeviceOf(device)}
          />
          <DeviceActions
            deviceId={device.id}
            status={device.status}
            holderName={device.holder}
            employees={listActiveEmployees()}
          />
        </div>
      ) : null}

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
          <StatusPill status={device.status} />
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
        {/* WAR-01 site 2 (phase 5, D-16): the colored «Гарантия до» value —
            the label is untouched, the date inherits the card-value role
            (16/400); «—» (no color) when «без гарантии». The card variant of
            the ONE WarrantyDate component; today is computed once per render. */}
        <FieldRow label="Гарантия до">
          <WarrantyDate
            value={device.warrantyUntil}
            today={displayTodayUtc()}
            variant="card"
          />
        </FieldRow>
      </FieldGroup>

      {/* Append-only history (MOVE-04): newest-first vertical rail fed by
          listTimeline; legacy devices render the honest empty state — no
          synthetic «received» events are invented (Defaults #18/#19). */}
      <FieldGroup title="История перемещений">
        <Timeline events={listTimeline(device.id)} />
      </FieldGroup>

      {/* Photos (REG-05, D-05, D-06): grid + lightbox + authorized upload/
          serve/delete, newest first. Disposed devices render read-only —
          add tile and delete hidden (D-03 view-only; the routes and the
          queries double-guard server-side). */}
      <PhotoGrid
        deviceId={device.id}
        photos={listByDevice(device.id).map((attachment) => ({
          id: attachment.id,
          fileName: attachment.fileName,
        }))}
        canMutate={device.status !== 'disposed'}
        maxPhotos={MAX_PHOTOS}
      />
    </section>
  )
}
