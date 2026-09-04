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
  acceptDevice,
  assignDevice,
  disposeDevice,
  getDeviceHolder,
  returnFromRepair,
  sendToRepair,
  transferDevice,
} from '@/db/queries/movements'
import {
  deviceSaveSchema,
  deviceUpdateSchema,
  isDeviceTypeKey,
  typeFields,
  type DeviceTypeKey,
} from '@/lib/device-schema'
import { movementSchemas, occurredAtFromDate } from '@/lib/movement-schema'

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
  // Echo of the submitted strings: React 19 resets an uncontrolled form after
  // every form action (success or failure), so failures carry the input back
  // to defaultValue — otherwise the user retypes everything on each error.
  values?: Record<string, string>
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

// Raw strings (pre-coercion) of every field the form may submit — the echo
// payload attached to any failure state (see DeviceFormState.values).
function echoValues(formData: FormData): Record<string, string> {
  const keys = [
    'model',
    'serialNumber',
    'inventoryNumber',
    'purchaseDate',
    'purchasePrice',
    'supplier',
    'warrantyUntil',
    'notes',
    'ramGb',
    'ssdGb',
    'screenDiagonal',
    'panelType',
    'portCount',
    'peripheralKind',
  ]
  const values: Record<string, string> = {}
  for (const key of keys) {
    const raw = formData.get(key)
    if (typeof raw === 'string' && raw !== '') values[key] = raw
  }
  return values
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
  const values = echoValues(formData)
  if (!isDeviceTypeKey(typeKey)) {
    return { fieldErrors: { typeKey: 'Выберите тип устройства' }, values }
  }
  const parsed = deviceSaveSchema(typeKey).safeParse({
    ...commonPayload(formData),
    ...typedPayload(typeKey, formData),
  })
  if (!parsed.success) return { ...fieldErrorsOf(parsed.error), values }
  try {
    createDevice({ typeKey, ...deviceInputOf(parsed.data) })
  } catch (e) {
    return { ...uniqueFieldError(e), values }
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
  if (!existing) return { error: SAVE_ERROR, values: echoValues(formData) }
  // The row's own type decides the field set; a typeKey in the payload is
  // never read — the type is the identity of the field set (Pitfall 3). The
  // merged update schema carries the id and the whitelist, so an injected
  // typeKey/status/currentEmployeeId is rejected by the strict object, and
  // the unknown-id race still ends in the generic error (no rows created).
  const typeKey = existing.typeKey
  if (!isDeviceTypeKey(typeKey)) return { error: SAVE_ERROR }
  const values = echoValues(formData)
  const parsed = deviceUpdateSchema(typeKey).safeParse({
    id: idParsed.data,
    ...commonPayload(formData),
    ...typedPayload(typeKey, formData),
  })
  if (!parsed.success) return { ...fieldErrorsOf(parsed.error), values }
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

// ─── Custody actions (MOVE-01..03, D-08) ────────────────────────────────────
//
// Same contract as the registry actions: requireSession() first, zod
// whitelist, one transactional query, refresh() on success. The status and
// the holder are NEVER read from the payload — the query's guard-UPDATE
// decides from the DB row inside the transaction (T-04-02, RESEARCH C1); a
// guard rejection (crafted POST, stale UI) surfaces as the dialog's own
// «Не удалось …» copy (04-UI-SPEC Guard row), with the submitted values
// echoed back (React 19 form-reset pattern, 4886f6a).

const ASSIGN_ERROR = 'Не удалось выдать. Попробуйте ещё раз.'
const ACCEPT_ERROR = 'Не удалось принять. Попробуйте ещё раз.'
const TRANSFER_ERROR = 'Не удалось передать. Попробуйте ещё раз.'
const TO_REPAIR_ERROR = 'Не удалось отправить в ремонт. Попробуйте ещё раз.'
const FROM_REPAIR_ERROR = 'Не удалось вернуть из ремонта. Попробуйте ещё раз.'
const DISPOSE_ERROR = 'Не удалось списать. Попробуйте ещё раз.'

export type MovementFieldErrors = {
  employeeId?: string
  occurredAt?: string
  // The dispose reason lives in the comment field and is обязательна (D-03).
  comment?: string
}

export type MovementFormState = {
  ok?: boolean
  error?: string
  fieldErrors?: MovementFieldErrors
  // Echo of the submitted strings — same rationale as DeviceFormState.values.
  values?: Record<string, string>
}

// Raw strings of the movement form fields — the echo payload attached to any
// failure state (the employee picker keeps its own client state, the date and
// comment inputs are uncontrolled and reset by React 19).
function echoMovementValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {}
  for (const key of ['employeeId', 'occurredAt', 'comment']) {
    const raw = formData.get(key)
    if (typeof raw === 'string' && raw !== '') values[key] = raw
  }
  return values
}

// FormData → whitelisted plain values. Empty optionals become undefined (→
// «сейчас» / NULL in the queries); employeeId is included only for the
// person-carrying schemas — the strict accept schema treats it as a tampering
// signal (T-04-02).
function movementPayload(formData: FormData, withEmployee: boolean) {
  const comment = textOf(formData, 'comment')
  const occurredAt = textOf(formData, 'occurredAt')
  const base = {
    deviceId: formData.get('deviceId'),
    occurredAt: occurredAt === '' ? undefined : occurredAt,
    comment: comment === '' ? undefined : comment,
  }
  return withEmployee
    ? { ...base, employeeId: formData.get('employeeId') }
    : base
}

// Map zod issues onto the UI-SPEC inline copy; an unmapped issue (garbage
// deviceId, an overlong comment) falls back to the action's own error. The
// comment key only maps when the action owns a comment copy (dispose: the
// обязательная причина) — elsewhere a tampered comment surfaces as the
// generic action error, never as misplaced reason copy.
function movementFieldErrorsOf(
  error: z.ZodError,
  fallback: string,
  commentCopy?: string,
): MovementFormState {
  const fieldErrors: MovementFieldErrors = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0])
    if (key === 'employeeId') {
      fieldErrors.employeeId = 'Выберите сотрудника'
    } else if (key === 'occurredAt') {
      // custom = the not-in-future refine; everything else = malformed date.
      fieldErrors.occurredAt =
        issue.code === 'custom'
          ? 'Дата не может быть в будущем'
          : 'Введите корректную дату'
    } else if (key === 'comment' && commentCopy) {
      fieldErrors.comment = commentCopy
    } else {
      return { error: fallback }
    }
  }
  return { fieldErrors }
}

export async function assignDeviceAction(
  _prev: unknown,
  formData: FormData,
): Promise<MovementFormState> {
  await requireSession()
  const values = echoMovementValues(formData)
  const parsed = movementSchemas.assign.safeParse(movementPayload(formData, true))
  if (!parsed.success) {
    return { ...movementFieldErrorsOf(parsed.error, ASSIGN_ERROR), values }
  }
  try {
    assignDevice(parsed.data.deviceId, parsed.data.employeeId, {
      occurredAt: occurredAtFromDate(parsed.data.occurredAt),
      comment: parsed.data.comment ?? null,
    })
  } catch {
    // ILLEGAL_TRANSITION / EMPLOYEE_INACTIVE — the copy table's per-action
    // error; internal details never leave the server (V7).
    return { error: ASSIGN_ERROR, values }
  }
  refresh()
  return { ok: true }
}

export async function acceptDeviceAction(
  _prev: unknown,
  formData: FormData,
): Promise<MovementFormState> {
  await requireSession()
  const values = echoMovementValues(formData)
  const parsed = movementSchemas.accept.safeParse(movementPayload(formData, false))
  if (!parsed.success) {
    return { ...movementFieldErrorsOf(parsed.error, ACCEPT_ERROR), values }
  }
  try {
    acceptDevice(parsed.data.deviceId, {
      occurredAt: occurredAtFromDate(parsed.data.occurredAt),
      comment: parsed.data.comment ?? null,
    })
  } catch {
    return { error: ACCEPT_ERROR, values }
  }
  refresh()
  return { ok: true }
}

export async function transferDeviceAction(
  _prev: unknown,
  formData: FormData,
): Promise<MovementFormState> {
  await requireSession()
  const values = echoMovementValues(formData)
  const idParsed = IdSchema.safeParse(formData.get('deviceId'))
  if (!idParsed.success) return { error: TRANSFER_ERROR, values }
  // The current holder comes from the DB row (never the payload) — the
  // transfer refine rejects «себе самому» with the inline field copy before
  // the transaction; the guard-UPDATE remains the authority.
  const holder = getDeviceHolder(idParsed.data)
  if (!holder) return { error: TRANSFER_ERROR, values }
  const parsed = movementSchemas
    .transfer(holder.currentEmployeeId)
    .safeParse(movementPayload(formData, true))
  if (!parsed.success) {
    return { ...movementFieldErrorsOf(parsed.error, TRANSFER_ERROR), values }
  }
  try {
    transferDevice(idParsed.data, parsed.data.employeeId, {
      occurredAt: occurredAtFromDate(parsed.data.occurredAt),
      comment: parsed.data.comment ?? null,
    })
  } catch {
    return { error: TRANSFER_ERROR, values }
  }
  refresh()
  return { ok: true }
}

// В ремонт (D-04): the holder of an assigned device is auto-accepted inside
// the transaction (returned + to_repair in one tx) — the form carries no
// person field, so a crafted employeeId dies on the strict whitelist.
export async function sendToRepairDeviceAction(
  _prev: unknown,
  formData: FormData,
): Promise<MovementFormState> {
  await requireSession()
  const values = echoMovementValues(formData)
  const parsed = movementSchemas.repair.safeParse(movementPayload(formData, false))
  if (!parsed.success) {
    return { ...movementFieldErrorsOf(parsed.error, TO_REPAIR_ERROR), values }
  }
  try {
    sendToRepair(parsed.data.deviceId, {
      occurredAt: occurredAtFromDate(parsed.data.occurredAt),
      comment: parsed.data.comment ?? null,
    })
  } catch {
    // ILLEGAL_TRANSITION — a stale UI or a crafted POST; the per-action copy
    // of the UI-SPEC table, never the internal detail (V7).
    return { error: TO_REPAIR_ERROR, values }
  }
  refresh()
  return { ok: true }
}

// Из ремонта (D-04): repair → in_stock, one from_repair event.
export async function returnFromRepairDeviceAction(
  _prev: unknown,
  formData: FormData,
): Promise<MovementFormState> {
  await requireSession()
  const values = echoMovementValues(formData)
  const parsed = movementSchemas.repair.safeParse(movementPayload(formData, false))
  if (!parsed.success) {
    return { ...movementFieldErrorsOf(parsed.error, FROM_REPAIR_ERROR), values }
  }
  try {
    returnFromRepair(parsed.data.deviceId, {
      occurredAt: occurredAtFromDate(parsed.data.occurredAt),
      comment: parsed.data.comment ?? null,
    })
  } catch {
    return { error: FROM_REPAIR_ERROR, values }
  }
  refresh()
  return { ok: true }
}

// Списать (D-03): the terminal action — причина обязательна (it IS the
// comment), the guard-UPDATE only ever matches a non-disposed status, so no
// payload can resurrect or double-dispose a device. The reason flows through
// the schema as a required field: an empty textarea fails zod with the
// inline «Укажите причину списания», never a generic error.
export async function disposeDeviceAction(
  _prev: unknown,
  formData: FormData,
): Promise<MovementFormState> {
  await requireSession()
  const values = echoMovementValues(formData)
  const parsed = movementSchemas.dispose.safeParse(
    movementPayload(formData, false),
  )
  if (!parsed.success) {
    return {
      ...movementFieldErrorsOf(parsed.error, DISPOSE_ERROR, 'Укажите причину списания'),
      values,
    }
  }
  try {
    disposeDevice(parsed.data.deviceId, {
      occurredAt: occurredAtFromDate(parsed.data.occurredAt),
      comment: parsed.data.comment,
    })
  } catch {
    // ILLEGAL_TRANSITION — disposed is terminal and the guard says so.
    return { error: DISPOSE_ERROR, values }
  }
  refresh()
  return { ok: true }
}
