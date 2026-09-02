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
import { createDeviceAction } from './actions'

// Create dialog for devices (REG-02, D-06). One component, create mode in this
// plan; edit joins in the card plan with the same employee-dialog mechanics.
// The «Тип» select at the top decides which «Характеристики типа» section is
// rendered beneath «Основное»: fields come from typeFields() via the
// typeConfigs props (D-02 — no parallel field list in the component).
//
// Switching the type REMOUNTS the per-type section (key={typeKey}) — a clean
// reset of the per-type values without any useEffect (vercel
// rerender-derived-state-no-effect). Status and держатель have NO fields here
// at all — state changes ride the phase 4 actions (D-06, roadmap boundary).

const CONTROL_CLASS = 'h-10 px-3 text-base md:text-base'
const ERROR_CLASS = 'text-sm text-[#D70015]'

// Module-level renderers (vercel rerender-no-inline-components): flat prop
// configs only, so nothing from the server rows crosses here
// (server-serialization).

function TypedTextField({ field, error }: { field: DeviceField; error?: string }) {
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
        className={CONTROL_CLASS}
        aria-invalid={error ? true : undefined}
      />
      {error ? <p className={ERROR_CLASS}>{error}</p> : null}
    </div>
  )
}

function TypedNumberField({ field, error }: { field: DeviceField; error?: string }) {
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
        className={CONTROL_CLASS}
        aria-invalid={error ? true : undefined}
      />
      {error ? <p className={ERROR_CLASS}>{error}</p> : null}
    </div>
  )
}

// Base UI Select submits nothing by itself — the hidden input carries the
// chosen value to the action (the combobox lesson of phase 2, now explicit).
function TypedSelectField({ field, error }: { field: DeviceField; error?: string }) {
  const options = (field.options ?? []).map((option) => ({
    value: option,
    label: option,
  }))
  const [value, setValue] = useState<string | null>(null)
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
// nothing — the action maps both onto 0/1 («unchecked = stored 0»).
function TypedCheckboxField({ field }: { field: DeviceField }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <Checkbox id={`device-${field.key}`} name={field.key} />
      <Label htmlFor={`device-${field.key}`} className="text-ink">
        {field.label}
      </Label>
    </div>
  )
}

function TypedField({ field, error }: { field: DeviceField; error?: string }) {
  switch (field.type) {
    case 'number':
      return <TypedNumberField field={field} error={error} />
    case 'select':
      return <TypedSelectField field={field} error={error} />
    case 'checkbox':
      return <TypedCheckboxField field={field} />
    default:
      return <TypedTextField field={field} error={error} />
  }
}

function DeviceDialogForm({
  label,
  typeConfigs,
  onDone,
}: {
  label: string
  typeConfigs: readonly DeviceTypeConfig[]
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState(createDeviceAction, {})
  // null = nothing chosen yet → the select shows its placeholder and the
  // per-type section stays hidden until a type is picked (UI-SPEC).
  const [typeKey, setTypeKey] = useState<string | null>(null)
  const typeItems = typeConfigs.map((t) => ({ value: t.key, label: t.name }))
  const config = typeConfigs.find((t) => t.key === typeKey)

  // The action already called refresh() — closing on the fresh state object
  // shows the updated list behind the dialog immediately.
  useEffect(() => {
    if (state.ok) onDone()
  }, [state, onDone])

  return (
    <form action={formAction} className="flex max-h-[75svh] flex-col">
      {/* The body scrolls inside the 16px-radius panel; the footer stays
          pinned below it (UI-SPEC «Dialog scroll»). */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <div className="space-y-2">
          <Label htmlFor="device-type">Тип</Label>
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
          {/* The select itself submits nothing — the hidden input rides the
              typeKey to the action (js-early-exit validates it first). */}
          <input type="hidden" name="typeKey" value={typeKey ?? ''} />
          {state.fieldErrors?.typeKey ? (
            <p className={ERROR_CLASS}>{state.fieldErrors.typeKey}</p>
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
              className="min-h-20 text-base md:text-base"
              aria-invalid={state.fieldErrors?.notes ? true : undefined}
            />
            {state.fieldErrors?.notes ? (
              <p className={ERROR_CLASS}>{state.fieldErrors.notes}</p>
            ) : null}
          </div>
        </section>

        {/* key={typeKey}: switching the type remounts this section, so the
            previous type's values (and select state) are gone — no effect. */}
        {config ? (
          <section key={config.key} className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">
              Характеристики типа
            </h3>
            {config.fields.map((field) => (
              <TypedField
                key={field.key}
                field={field}
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
          {pending ? 'Сохранение…' : label}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function DeviceDialog({
  label,
  typeConfigs,
}: {
  label: string
  typeConfigs: readonly DeviceTypeConfig[]
}) {
  const [open, setOpen] = useState(false)
  // Stable identity so the form's ok-effect keyed on [state, onDone] fires
  // per action response, not per parent render.
  const close = useCallback(() => setOpen(false), [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="xl" />}>{label}</DialogTrigger>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle>Новое устройство</DialogTitle>
        </DialogHeader>
        {/* Rendered inside the portal: mounts with the dialog session and
            unmounts after the close animation — WR-01 state reset. */}
        <DeviceDialogForm
          label={label}
          typeConfigs={typeConfigs}
          onDone={close}
        />
      </DialogContent>
    </Dialog>
  )
}
