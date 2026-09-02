'use client'

import { useActionState, useCallback, useEffect, useState } from 'react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import type {
  DeviceField,
  DeviceTypeConfig,
} from '@/lib/device-schema'
import { createDeviceAction, updateDeviceAction } from './actions'

// Create/EDIT device dialog — one component, two modes (D-06; the employee-
// dialog mechanics verbatim). A `device` prop switches to edit mode: fields
// prefill from it, a hidden id rides to updateDeviceAction, the type renders
// as read-only text (the type IS the field set — REG-03 covers the fields),
// and the primary copy becomes «Сохранить изменения».
//
// The «Тип» select in create mode decides which «Характеристики типа» section
// is rendered beneath «Основное»: fields come from typeFields() via the
// typeConfigs props (D-02 — no parallel field list in the component).
//
// Switching the type REMOUNTS the per-type section (key={typeKey}) — a clean
// reset of the per-type values without any useEffect (vercel
// rerender-derived-state-no-effect). Status and держатель have NO fields here
// at all in either mode — state changes ride the phase 4 actions (D-06,
// roadmap boundary).

// Flat serializable snapshot of the edited row (vercel
// server-serialization): the card page maps its Date columns to yyyy-mm-dd
// strings so input[type=date] prefills. Only fields the edit action accepts —
// no status, no holder, no server-only columns.
export type DeviceDialogDevice = {
  id: number
  typeKey: string
  model: string
  serialNumber: string
  inventoryNumber: string | null
  notes: string | null
  purchaseDate: string | null
  purchasePrice: number | null
  supplier: string | null
  warrantyUntil: string | null
  ramGb: number | null
  ramUpgraded: number | null
  ssdGb: number | null
  screenDiagonal: number | null
  panelType: string | null
  portCount: number | null
  peripheralKind: string | null
}

const CONTROL_CLASS = 'h-10 px-3 text-base md:text-base'
const ERROR_CLASS = 'text-sm text-[#D70015]'

// Module-level renderers (vercel rerender-no-inline-components): flat prop
// configs only, so nothing from the server rows crosses here
// (server-serialization).

// The edited row's value of one per-type field (null in create mode or when
// the column is empty). Typed access keeps the DeviceFieldKey switch
// exhaustive at compile time.
function initialOf(
  device: DeviceDialogDevice | undefined,
  field: DeviceField,
): string | number | null {
  if (!device) return null
  switch (field.key) {
    case 'ramGb':
      return device.ramGb
    case 'ramUpgraded':
      return device.ramUpgraded
    case 'ssdGb':
      return device.ssdGb
    case 'screenDiagonal':
      return device.screenDiagonal
    case 'panelType':
      return device.panelType
    case 'portCount':
      return device.portCount
    case 'peripheralKind':
      return device.peripheralKind
  }
}

function TypedTextField({
  field,
  initial,
  error,
}: {
  field: DeviceField
  initial: string | number | null
  error?: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`device-${field.key}`}>{field.label}</Label>
      <Input
        id={`device-${field.key}`}
        name={field.key}
        type="text"
        autoComplete="off"
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        defaultValue={typeof initial === 'string' ? initial : undefined}
        className={CONTROL_CLASS}
        aria-invalid={error ? true : undefined}
      />
      {error ? <p className={ERROR_CLASS}>{error}</p> : null}
    </div>
  )
}

function TypedNumberField({
  field,
  initial,
  error,
}: {
  field: DeviceField
  initial: string | number | null
  error?: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`device-${field.key}`}>{field.label}</Label>
      <Input
        id={`device-${field.key}`}
        name={field.key}
        type="number"
        inputMode="numeric"
        step={field.step}
        autoComplete="off"
        defaultValue={typeof initial === 'number' ? initial : undefined}
        className={CONTROL_CLASS}
        aria-invalid={error ? true : undefined}
      />
      {error ? <p className={ERROR_CLASS}>{error}</p> : null}
    </div>
  )
}

// Base UI Select submits nothing by itself — the hidden input carries the
// chosen value to the action (the combobox lesson of phase 2, now explicit).
// In edit mode the value starts prefilled from the row.
function TypedSelectField({
  field,
  initial,
  error,
}: {
  field: DeviceField
  initial: string | number | null
  error?: string
}) {
  const options = (field.options ?? []).map((option) => ({
    value: option,
    label: option,
  }))
  const [value, setValue] = useState<string | null>(
    typeof initial === 'string' && initial !== '' ? initial : null,
  )
  return (
    <div className="space-y-2">
      <Label htmlFor={`device-${field.key}`}>{field.label}</Label>
      <Select
        items={options}
        value={value}
        onValueChange={(next) =>
          setValue(typeof next === 'string' ? next : null)
        }
      >
        <SelectTrigger
          id={`device-${field.key}`}
          className={`${CONTROL_CLASS} w-full`}
          aria-invalid={error ? true : undefined}
        >
          <SelectValue placeholder="Выберите вид" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <input type="hidden" name={field.key} value={value ?? ''} />
      {error ? <p className={ERROR_CLASS}>{error}</p> : null}
    </div>
  )
}

// Uncontrolled with a name: a checked box submits 'on', unchecked submits
// nothing — the action maps both onto 0/1 («unchecked = stored 0»). Edit mode
// starts from the stored flag (1 = checked).
function TypedCheckboxField({
  field,
  initial,
}: {
  field: DeviceField
  initial: string | number | null
}) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <Checkbox
        id={`device-${field.key}`}
        name={field.key}
        defaultChecked={initial === 1}
      />
      <Label htmlFor={`device-${field.key}`} className="text-ink">
        {field.label}
      </Label>
    </div>
  )
}

function TypedField({
  field,
  initial,
  error,
}: {
  field: DeviceField
  initial: string | number | null
  error?: string
}) {
  switch (field.type) {
    case 'number':
      return <TypedNumberField field={field} initial={initial} error={error} />
    case 'select':
      return <TypedSelectField field={field} initial={initial} error={error} />
    case 'checkbox':
      return <TypedCheckboxField field={field} initial={initial} />
    default:
      return <TypedTextField field={field} initial={initial} error={error} />
  }
}

function DeviceDialogForm({
  label,
  typeConfigs,
  device,
  editing,
  onDone,
}: {
  label: string
  typeConfigs: readonly DeviceTypeConfig[]
  device: DeviceDialogDevice | undefined
  editing: boolean
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState(
    editing ? updateDeviceAction : createDeviceAction,
    {},
  )
  // Create: null = nothing chosen yet → the select shows its placeholder and
  // the per-type section stays hidden until a type is picked. Edit: pinned to
  // the row's own type — never user-editable.
  const [typeKey, setTypeKey] = useState<string | null>(device?.typeKey ?? null)
  const typeItems = typeConfigs.map((t) => ({ value: t.key, label: t.name }))
  const config = typeConfigs.find((t) => t.key === typeKey)

  // The action already called refresh() — closing on the fresh state object
  // shows the updated list behind the dialog immediately.
  useEffect(() => {
    if (state.ok) onDone()
  }, [state, onDone])

  return (
    <form action={formAction} className="flex max-h-[75svh] flex-col">
      {editing ? <input type="hidden" name="id" value={device!.id} /> : null}
      {/* The body scrolls inside the 16px-radius panel; the footer stays
          pinned below it (UI-SPEC «Dialog scroll»). */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <div className="space-y-2">
          <Label htmlFor="device-type">Тип</Label>
          {editing ? (
            // REG-03 boundary made visible: the type renders as read-only
            // static text (UI-SPEC edit mode) — the action takes the type
            // from the DB row, never from the payload, and the update schema
            // would reject a submitted typeKey outright.
            <p className="text-base text-ink">{config?.name ?? typeKey}</p>
          ) : (
            <Select
              items={typeItems}
              value={typeKey}
              onValueChange={(next) =>
                setTypeKey(typeof next === 'string' ? next : null)
              }
            >
              <SelectTrigger
                id="device-type"
                className={`${CONTROL_CLASS} w-full`}
                aria-invalid={state.fieldErrors?.typeKey ? true : undefined}
              >
                <SelectValue placeholder="Выберите тип" />
              </SelectTrigger>
              <SelectContent>
                {typeItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!editing ? (
            <>
              {/* The select itself submits nothing — the hidden input rides
                  the typeKey to the action (js-early-exit validates it
                  first). In edit mode nothing submits: no field, no key. */}
              <input type="hidden" name="typeKey" value={typeKey ?? ''} />
              {state.fieldErrors?.typeKey ? (
                <p className={ERROR_CLASS}>{state.fieldErrors.typeKey}</p>
              ) : null}
            </>
          ) : null}
        </div>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-ink">Основное</h3>
          <div className="space-y-2">
            <Label htmlFor="device-model">Модель</Label>
            <Input
              id="device-model"
              name="model"
              type="text"
              autoComplete="off"
              maxLength={80}
              placeholder="MacBook Pro 14&quot;"
              defaultValue={device?.model}
              className={CONTROL_CLASS}
              aria-invalid={state.fieldErrors?.model ? true : undefined}
            />
            {state.fieldErrors?.model ? (
              <p className={ERROR_CLASS}>{state.fieldErrors.model}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="device-serialNumber">Серийный номер</Label>
            <Input
              id="device-serialNumber"
              name="serialNumber"
              type="text"
              autoComplete="off"
              maxLength={80}
              defaultValue={device?.serialNumber}
              className={`${CONTROL_CLASS} font-mono`}
              aria-invalid={state.fieldErrors?.serialNumber ? true : undefined}
            />
            {state.fieldErrors?.serialNumber ? (
              <p className={ERROR_CLASS}>{state.fieldErrors.serialNumber}</p>
            ) : null}
            {typeKey === 'peripheral' ? (
              // D-04 convention for serial-less gear, shown for периферия only.
              <p className="text-sm text-ink-secondary">
                У периферии серийника может не быть — впишите инвентарный номер
                из 1С.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="device-inventoryNumber">Инвентарный номер</Label>
            <Input
              id="device-inventoryNumber"
              name="inventoryNumber"
              type="text"
              autoComplete="off"
              maxLength={80}
              placeholder="Из 1С, если присвоен"
              defaultValue={device?.inventoryNumber ?? undefined}
              className={`${CONTROL_CLASS} font-mono`}
              aria-invalid={
                state.fieldErrors?.inventoryNumber ? true : undefined
              }
            />
            {state.fieldErrors?.inventoryNumber ? (
              <p className={ERROR_CLASS}>{state.fieldErrors.inventoryNumber}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="device-notes">Заметки</Label>
            <Textarea
              id="device-notes"
              name="notes"
              maxLength={2000}
              defaultValue={device?.notes ?? undefined}
              className="min-h-20 text-base md:text-base"
              aria-invalid={state.fieldErrors?.notes ? true : undefined}
            />
            {state.fieldErrors?.notes ? (
              <p className={ERROR_CLASS}>{state.fieldErrors.notes}</p>
            ) : null}
          </div>
        </section>

        {/* key={typeKey}: switching the type remounts this section, so the
            previous type's values (and select state) are gone — no effect.
            In edit mode the type never changes; values prefill from the row. */}
        {config ? (
          <section key={config.key} className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">
              Характеристики типа
            </h3>
            {config.fields.map((field) => (
              <TypedField
                key={field.key}
                field={field}
                initial={initialOf(device, field)}
                error={state.fieldErrors?.[field.key]}
              />
            ))}
          </section>
        ) : null}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-ink">Закупка</h3>
          <div className="space-y-2">
            <Label htmlFor="device-purchaseDate">Дата закупки</Label>
            <Input
              id="device-purchaseDate"
              name="purchaseDate"
              type="date"
              defaultValue={device?.purchaseDate ?? undefined}
              className={CONTROL_CLASS}
              aria-invalid={state.fieldErrors?.purchaseDate ? true : undefined}
            />
            {state.fieldErrors?.purchaseDate ? (
              <p className={ERROR_CLASS}>{state.fieldErrors.purchaseDate}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="device-purchasePrice">Стоимость, ₽</Label>
            <Input
              id="device-purchasePrice"
              name="purchasePrice"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              autoComplete="off"
              defaultValue={
                device?.purchasePrice === null || device?.purchasePrice === undefined
                  ? undefined
                  : device.purchasePrice
              }
              className={CONTROL_CLASS}
              aria-invalid={state.fieldErrors?.purchasePrice ? true : undefined}
            />
            {state.fieldErrors?.purchasePrice ? (
              <p className={ERROR_CLASS}>{state.fieldErrors.purchasePrice}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="device-supplier">Поставщик</Label>
            <Input
              id="device-supplier"
              name="supplier"
              type="text"
              autoComplete="off"
              maxLength={80}
              defaultValue={device?.supplier ?? undefined}
              className={CONTROL_CLASS}
              aria-invalid={state.fieldErrors?.supplier ? true : undefined}
            />
            {state.fieldErrors?.supplier ? (
              <p className={ERROR_CLASS}>{state.fieldErrors.supplier}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="device-warrantyUntil">Гарантия до</Label>
            <Input
              id="device-warrantyUntil"
              name="warrantyUntil"
              type="date"
              defaultValue={device?.warrantyUntil ?? undefined}
              className={CONTROL_CLASS}
              aria-invalid={state.fieldErrors?.warrantyUntil ? true : undefined}
            />
            {state.fieldErrors?.warrantyUntil ? (
              <p className={ERROR_CLASS}>{state.fieldErrors.warrantyUntil}</p>
            ) : null}
          </div>
        </section>

        {state.error ? (
          <p className={ERROR_CLASS} role="alert">
            {state.error}
          </p>
        ) : null}
      </div>

      <DialogFooter className="mt-4 shrink-0">
        <DialogClose render={<Button variant="secondary" />}>
          Не сохранять
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending
            ? 'Сохранение…'
            : editing
              ? 'Сохранить изменения'
              : label}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function DeviceDialog({
  label,
  typeConfigs,
  device,
}: {
  label: string
  typeConfigs: readonly DeviceTypeConfig[]
  device?: DeviceDialogDevice
}) {
  const editing = device !== undefined
  const [open, setOpen] = useState(false)
  // Stable identity so the form's ok-effect keyed on [state, onDone] fires
  // per action response, not per parent render.
  const close = useCallback(() => setOpen(false), [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Edit mode is a secondary trigger (UI-SPEC card contract); accent
          stays reserved for the list primary CTA and the dialog primary. */}
      <DialogTrigger
        render={
          <Button
            size="xl"
            variant={editing ? 'secondary' : 'default'}
            data-device-edit-id={device?.id}
          />
        }
      >
        {label}
      </DialogTrigger>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Редактировать устройство' : 'Новое устройство'}
          </DialogTitle>
        </DialogHeader>
        {/* Rendered inside the portal: mounts with the dialog session and
            unmounts after the close animation — WR-01 state reset. */}
        <DeviceDialogForm
          label={label}
          typeConfigs={typeConfigs}
          device={device}
          editing={editing}
          onDone={close}
        />
      </DialogContent>
    </Dialog>
  )
}
