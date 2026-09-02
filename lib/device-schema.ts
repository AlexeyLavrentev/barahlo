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
