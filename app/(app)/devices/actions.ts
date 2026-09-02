'use server'

import { z } from 'zod'
import { refresh } from 'next/cache'
import { requireSession } from '@/lib/auth'
import {
  createDevice,
  getDevice,
  updateDevice,
  type DeviceInput,
} from '@/db/queries/devices'
import {
  deviceSaveSchema,
  deviceUpdateSchema,
  isDeviceTypeKey,
  typeFields,
  type DeviceTypeKey,
} from '@/lib/device-schema'

// Server Actions are directly POST-able — the proxy perimeter does not cover
// them — so requireSession() is the FIRST line of every action (T-03-01).
// Inputs are whitelisted through zod (T-03-02): raw FormData is never spread
// into SQL values. Only the generic Russian failure string leaves the action
// (V7); field-level errors come from the UI-SPEC copy table.
//
// The whitelist is intentionally MINIMAL: the registry form never reads the
// custody columns (they belong to the phase 4 actions) and, in edit mode,
// never reads typeKey — the row's own type decides the field set (Pitfall 3).

const SAVE_ERROR = 'Не удалось сохранить. Попробуйте ещё раз.'

const IdSchema = z.coerce.number().int().positive()

export type DeviceFieldErrors = {
  typeKey?: string
  model?: string
  serialNumber?: string
  inventoryNumber?: string
  purchaseDate?: string
  purchasePrice?: string
  supplier?: string
  warrantyUntil?: string
  notes?: string
  ramGb?: string
  ramUpgraded?: string
  ssdGb?: string
  screenDiagonal?: string
  panelType?: string
  portCount?: string
  peripheralKind?: string
}

export type DeviceFormState = {
  ok?: boolean
  error?: string
  fieldErrors?: DeviceFieldErrors
}

// Map zod issues onto the UI-SPEC inline copy (14/400 #D70015 under field).
// An issue without an agreed copy (tampered lengths on free-text fields) falls
// back to the generic dialog error instead of inventing copy.
function fieldErrorsOf(error: z.ZodError): DeviceFormState {
  const fieldErrors: DeviceFieldErrors = {}
  let unmapped = false
  for (const issue of error.issues) {
    const key = String(issue.path[0])
    const copy = FIELD_COPY[key]
    if (copy) {
      fieldErrors[key as keyof DeviceFieldErrors] = copy
    } else {
      unmapped = true
    }
  }
  if (unmapped) return { error: SAVE_ERROR }
  return { fieldErrors }
}

const FIELD_COPY: Record<string, string> = {
  model: 'Укажите модель',
  serialNumber: 'Укажите серийный номер',
  peripheralKind: 'Выберите вид периферии',
  ramGb: 'Введите число',
  ssdGb: 'Введите число',
  screenDiagonal: 'Введите число',
  portCount: 'Введите число',
  purchasePrice: 'Введите число',
  purchaseDate: 'Введите дату',
  warrantyUntil: 'Введите дату',
}

// UNIQUE collisions surface from the queries module as { code } — map them to
// the UI-SPEC inline copy, never to a generic error (Pitfall 1).
function uniqueFieldError(e: unknown): DeviceFormState {
  const code = (e as { code?: string } | undefined)?.code
  if (code === 'serialNormalized') {
    return {
      fieldErrors: {
        serialNumber: 'Устройство с таким серийным номером уже есть',
      },
    }
  }
  if (code === 'inventoryNormalized') {
    return {
      fieldErrors: {
        inventoryNumber: 'Устройство с таким инвентарным номером уже есть',
      },
    }
  }
  return { error: SAVE_ERROR }
}

function textOf(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

// FormData → whitelisted plain values. An empty optional string becomes
// undefined (→ NULL in the queries), numbers are coerced here so the schema
// can reject garbage with the numeric copy.
function commonPayload(formData: FormData) {
  const inventory = textOf(formData, 'inventoryNumber')
  const purchaseDate = textOf(formData, 'purchaseDate')
  const warrantyUntil = textOf(formData, 'warrantyUntil')
  const price = textOf(formData, 'purchasePrice')
  const supplier = textOf(formData, 'supplier')
  const notes = textOf(formData, 'notes')
  return {
    model: textOf(formData, 'model'),
    serialNumber: textOf(formData, 'serialNumber'),
    inventoryNumber: inventory === '' ? undefined : inventory,
    purchaseDate: purchaseDate === '' ? undefined : purchaseDate,
    purchasePrice: price === '' ? undefined : Number(price),
    supplier: supplier === '' ? undefined : supplier,
    warrantyUntil: warrantyUntil === '' ? undefined : warrantyUntil,
    notes: notes === '' ? undefined : notes,
  }
}

// Only the type's OWN fields are ever read (Pitfall 7): typeFields(typeKey) is
// the whitelist walker, injected foreign keys are never touched.
function typedPayload(typeKey: DeviceTypeKey, formData: FormData) {
  const payload: Record<string, unknown> = {}
  for (const field of typeFields(typeKey)) {
    const raw = formData.get(field.key)
    if (field.type === 'checkbox') {
      // Base UI checkbox submits its value only when checked.
      payload[field.key] = raw === 'on' || raw === '1'
      continue
    }
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (value === '') continue
    payload[field.key] = field.type === 'number' ? Number(value) : value
  }
  return payload
}

// Parsed payload → query input: dates become Date, empties become NULL, the
// laptop flag becomes 0/1 («unchecked = stored 0» — always written).
function deviceInputOf(data: Record<string, unknown>): DeviceInput {
  const str = (key: string) =>
    typeof data[key] === 'string' ? (data[key] as string) : undefined
  const num = (key: string) =>
    typeof data[key] === 'number' ? (data[key] as number) : undefined
  const purchaseDate = str('purchaseDate')
  const warrantyUntil = str('warrantyUntil')
  return {
    model: str('model') ?? '',
    serialNumber: str('serialNumber') ?? '',
    inventoryNumber: str('inventoryNumber') ?? null,
    purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
    purchasePrice: num('purchasePrice') ?? null,
    supplier: str('supplier') ?? null,
    warrantyUntil: warrantyUntil ? new Date(warrantyUntil) : null,
    notes: str('notes') ?? null,
    ramGb: num('ramGb') ?? null,
    ramUpgraded:
      data.ramUpgraded === undefined ? null : data.ramUpgraded === true ? 1 : 0,
    ssdGb: num('ssdGb') ?? null,
    screenDiagonal: num('screenDiagonal') ?? null,
    panelType: str('panelType') ?? null,
    portCount: num('portCount') ?? null,
    peripheralKind: str('peripheralKind') ?? null,
  }
}

// The merged schema of one save comes from the keystone (deviceSaveSchema /
// deviceUpdateSchema): common bounds + the strict per-type shape of exactly
// this type. Strictness is the tamper gate — extra keys are rejected, never
// stored (T-03-02).

export async function createDeviceAction(
  _prev: unknown,
  formData: FormData,
): Promise<DeviceFormState> {
  await requireSession()
  // Early exit: the type decides which fields even exist (js-early-exit).
  const typeKeyRaw = formData.get('typeKey')
  const typeKey = typeof typeKeyRaw === 'string' ? typeKeyRaw : ''
  if (!isDeviceTypeKey(typeKey)) {
    return { fieldErrors: { typeKey: 'Выберите тип устройства' } }
  }
  const parsed = deviceSaveSchema(typeKey).safeParse({
    ...commonPayload(formData),
    ...typedPayload(typeKey, formData),
  })
  if (!parsed.success) return fieldErrorsOf(parsed.error)
  try {
    createDevice({ typeKey, ...deviceInputOf(parsed.data) })
  } catch (e) {
    return uniqueFieldError(e)
  }
  // Without refresh() the route is NOT re-rendered in the action response
  // (Pitfall 1) — the new device would not appear until a manual reload.
  refresh()
  return { ok: true }
}

export async function updateDeviceAction(
  _prev: unknown,
  formData: FormData,
): Promise<DeviceFormState> {
  await requireSession()
  const idParsed = IdSchema.safeParse(formData.get('id'))
  if (!idParsed.success) return { error: SAVE_ERROR }
  const existing = getDevice(idParsed.data)
  if (!existing) return { error: SAVE_ERROR }
  // The row's own type decides the field set; a typeKey in the payload is
  // never read — the type is the identity of the field set (Pitfall 3). The
  // merged update schema carries the id and the whitelist, so an injected
  // typeKey/status/currentEmployeeId is rejected by the strict object, and
  // the unknown-id race still ends in the generic error (no rows created).
  const typeKey = existing.typeKey
  if (!isDeviceTypeKey(typeKey)) return { error: SAVE_ERROR }
  const parsed = deviceUpdateSchema(typeKey).safeParse({
    id: idParsed.data,
    ...commonPayload(formData),
    ...typedPayload(typeKey, formData),
  })
  if (!parsed.success) return fieldErrorsOf(parsed.error)
  try {
    const updated = updateDevice(
      parsed.data.id,
      deviceInputOf(parsed.data),
    )
    if (!updated) return { error: SAVE_ERROR }
  } catch (e) {
    return uniqueFieldError(e)
  }
  refresh()
  return { ok: true }
}
