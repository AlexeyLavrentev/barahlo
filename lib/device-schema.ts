import { z } from 'zod'

// Keystone module of the device registry (D-02): the SINGLE source of the
// per-type field sets. The dialog renders per-type controls from typeFields(),
// the server actions validate through buildZodSchema() — no component keeps a
// parallel field list. Field content is the canonical per-type field table of
// 03-UI-SPEC (D-01); phase 5 filters will read this same module.
//
// Pure and immutable: no framework imports, no module-level mutable state
// (vercel server-no-shared-module-state) — safe to import from RSC, actions
// and vitest alike. Client bundles receive field configs as serialized props
// (server-serialization), never this module's zod half.

export type FieldType = 'text' | 'number' | 'select' | 'checkbox'

export type DeviceTypeKey = 'laptop' | 'monitor' | 'dock' | 'peripheral'

// Flat, serializable shape handed to the client dialog as props
// (server-serialization): no functions, no rows — just field configs.
export type DeviceTypeConfig = {
  key: DeviceTypeKey
  name: string
  fields: readonly DeviceField[]
}

export type DeviceFieldKey =
  | 'ramGb'
  | 'ramUpgraded'
  | 'ssdGb'
  | 'screenDiagonal'
  | 'panelType'
  | 'portCount'
  | 'peripheralKind'

export type DeviceField = {
  key: DeviceFieldKey
  label: string
  type: FieldType
  required: boolean
  group: 'type'
  options?: readonly string[]
  maxLength?: number
  step?: number
  placeholder?: string
}

// D-03: fixed list (select, not free text) — filterability beats freedom.
export const PERIPHERAL_KINDS = [
  'мышь',
  'клавиатура',
  'гарнитура',
  'веб-камера',
  'прочее',
] as const

const PER_TYPE_FIELDS: Record<DeviceTypeKey, readonly DeviceField[]> = {
  laptop: [
    { key: 'ramGb', label: 'RAM, ГБ', type: 'number', required: false, group: 'type', step: 1 },
    { key: 'ramUpgraded', label: 'RAM апгрейдена', type: 'checkbox', required: false, group: 'type' },
    { key: 'ssdGb', label: 'SSD, ГБ', type: 'number', required: false, group: 'type', step: 1 },
  ],
  monitor: [
    { key: 'screenDiagonal', label: 'Диагональ, ″', type: 'number', required: false, group: 'type', step: 0.1 },
    {
      key: 'panelType',
      label: 'Тип матрицы',
      type: 'text',
      required: false,
      group: 'type',
      maxLength: 40,
      placeholder: 'IPS / VA / TN / OLED',
    },
  ],
  dock: [
    { key: 'portCount', label: 'Количество портов', type: 'number', required: false, group: 'type', step: 1 },
  ],
  peripheral: [
    { key: 'peripheralKind', label: 'Вид', type: 'select', required: true, group: 'type', options: PERIPHERAL_KINDS },
  ],
}

export const DEVICE_TYPES = [
  { key: 'laptop', name: 'Ноутбук', fields: PER_TYPE_FIELDS.laptop },
  { key: 'monitor', name: 'Монитор', fields: PER_TYPE_FIELDS.monitor },
  { key: 'dock', name: 'Док-станция', fields: PER_TYPE_FIELDS.dock },
  { key: 'peripheral', name: 'Периферия', fields: PER_TYPE_FIELDS.peripheral },
] as const

const DEVICE_TYPE_KEYS: readonly DeviceTypeKey[] = DEVICE_TYPES.map((t) => t.key)

export function isDeviceTypeKey(value: unknown): value is DeviceTypeKey {
  return (
    typeof value === 'string' &&
    (DEVICE_TYPE_KEYS as readonly string[]).includes(value)
  )
}

// Russian name of a type key (list line 2, card meta/row); an unknown key
// falls back to itself — the device_types FK makes that unreachable, the
// display stays honest anyway.
export function deviceTypeName(typeKey: string): string {
  return DEVICE_TYPES.find((t) => t.key === typeKey)?.name ?? typeKey
}

// Display vocabulary of the four statuses (REG-04 wording, UI-SPEC): neutral
// pills everywhere — colored semantics arrive with phases 4–5. Shared by the
// list and the card so no component keeps a parallel status map.
const DEVICE_STATUS_LABELS = {
  in_stock: 'На складе',
  assigned: 'Используется',
  repair: 'В ремонте',
  disposed: 'Списано',
} as const

export function deviceStatusLabel(status: string): string {
  return DEVICE_STATUS_LABELS[status as keyof typeof DEVICE_STATUS_LABELS] ?? status
}

// Per-type fields of one device type; an unknown key has no fields.
export function typeFields(typeKey: string): readonly DeviceField[] {
  return isDeviceTypeKey(typeKey) ? PER_TYPE_FIELDS[typeKey] : []
}

// Server-side validation schema for one type's per-type fields. Strict on
// purpose (Pitfall 7): per-type fields of a FOREIGN type in the payload are a
// tampering signal — rejected, never silently stored. No transforms here: the
// action trims FormData strings before parsing.
export function buildZodSchema(typeKey: DeviceTypeKey) {
  switch (typeKey) {
    case 'laptop':
      return z.strictObject({
        ramGb: z.number().int().positive().optional(),
        ramUpgraded: z.boolean().optional(),
        ssdGb: z.number().int().positive().optional(),
      })
    case 'monitor':
      return z.strictObject({
        screenDiagonal: z.number().positive().optional(),
        panelType: z.string().min(1).max(40).optional(),
      })
    case 'dock':
      return z.strictObject({
        portCount: z.number().int().min(1).optional(),
      })
    case 'peripheral':
      return z.strictObject({
        peripheralKind: z.enum(PERIPHERAL_KINDS),
      })
  }
}

// Common (all-type) field bounds of the registry form (plan 03-01): the zod
// layer is the real gate — the DOM maxLength only mirrors the UI-SPEC input
// contract. Lives in the keystone so the actions and the tests share one
// source (D-02 — no parallel validation lists).
const CommonFields = {
  model: z.string().min(1).max(200),
  serialNumber: z.string().min(1).max(100),
  inventoryNumber: z.string().min(1).max(80).optional(),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  purchasePrice: z.number().int().positive().optional(),
  supplier: z.string().min(1).max(80).optional(),
  warrantyUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(2000).optional(),
}

// The merged schema of one CREATE: common bounds + the strict per-type shape
// of exactly this type. Strictness is the tamper gate — extra keys (a
// submitted typeKey, status, currentEmployeeId…) are rejected, never stored
// (T-03-02).
export function deviceSaveSchema(typeKey: DeviceTypeKey) {
  return z.strictObject({
    ...CommonFields,
    ...buildZodSchema(typeKey).shape,
  })
}

// The merged schema of one EDIT (plan 03-02): {id} + the same whitelist. The
// caller passes the typeKey of the EXISTING row — a typeKey in the payload is
// never read (Pitfall 3), and the custody columns stay out of the schema
// entirely (Pitfall 4): status and holder change only via the phase 4 actions.
export function deviceUpdateSchema(typeKey: DeviceTypeKey) {
  return z.strictObject({
    id: z.coerce.number().int().positive(),
    ...CommonFields,
    ...buildZodSchema(typeKey).shape,
  })
}
