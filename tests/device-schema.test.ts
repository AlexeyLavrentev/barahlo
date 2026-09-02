import { describe, expect, it } from 'vitest'
import {
  DEVICE_TYPES,
  buildZodSchema,
  isDeviceTypeKey,
  typeFields,
} from '@/lib/device-schema'

// lib/device-schema.ts is the keystone (D-02): the ONLY source of per-type
// field sets. The form renders from typeFields(), the actions validate through
// buildZodSchema() — these tests pin the contract both consumers rely on.

describe('DEVICE_TYPES — 4 fixed types with ru names', () => {
  it('holds laptop/monitor/dock/peripheral in order with UI-SPEC names', () => {
    expect(DEVICE_TYPES.map((t) => t.key)).toEqual([
      'laptop',
      'monitor',
      'dock',
      'peripheral',
    ])
    expect(DEVICE_TYPES.map((t) => t.name)).toEqual([
      'Ноутбук',
      'Монитор',
      'Док-станция',
      'Периферия',
    ])
  })

  it('isDeviceTypeKey accepts only the 4 keys and rejects everything else', () => {
    for (const key of ['laptop', 'monitor', 'dock', 'peripheral']) {
      expect(isDeviceTypeKey(key)).toBe(true)
    }
    for (const bad of ['all', '', 'LAPTOP', 'notebook', undefined]) {
      expect(isDeviceTypeKey(bad)).toBe(false)
    }
  })
})

describe('typeFields — exactly the UI-SPEC per-type field table', () => {
  it('laptop contains exactly ramGb / ramUpgraded / ssdGb', () => {
    expect(typeFields('laptop').map((f) => f.key)).toEqual([
      'ramGb',
      'ramUpgraded',
      'ssdGb',
    ])
  })

  it('monitor contains screenDiagonal and free-text panelType (maxLength 40, no options)', () => {
    const fields = typeFields('monitor')
    expect(fields.map((f) => f.key)).toEqual(['screenDiagonal', 'panelType'])
    const panel = fields.find((f) => f.key === 'panelType')!
    expect(panel.type).toBe('text')
    expect(panel.maxLength).toBe(40)
    expect(panel.options).toBeUndefined()
  })

  it('dock contains portCount', () => {
    expect(typeFields('dock').map((f) => f.key)).toEqual(['portCount'])
  })

  it('peripheral contains required peripheralKind with the 5 fixed options (D-03)', () => {
    const fields = typeFields('peripheral')
    expect(fields.map((f) => f.key)).toEqual(['peripheralKind'])
    const kind = fields[0]
    expect(kind.required).toBe(true)
    expect(kind.type).toBe('select')
    expect(kind.options).toEqual([
      'мышь',
      'клавиатура',
      'гарнитура',
      'веб-камера',
      'прочее',
    ])
  })

  it('labels the UI-SPEC ru copy and keeps every field in the type group', () => {
    const all = [
      ...typeFields('laptop'),
      ...typeFields('monitor'),
      ...typeFields('dock'),
      ...typeFields('peripheral'),
    ]
    expect(all.every((f) => f.group === 'type')).toBe(true)
    const byKey = new Map(all.map((f) => [f.key, f]))
    expect(byKey.get('ramGb')?.label).toBe('RAM, ГБ')
    expect(byKey.get('ramUpgraded')?.label).toBe('RAM апгрейдена')
    expect(byKey.get('ssdGb')?.label).toBe('SSD, ГБ')
    expect(byKey.get('screenDiagonal')?.label).toBe('Диагональ, ″')
    expect(byKey.get('panelType')?.label).toBe('Тип матрицы')
    expect(byKey.get('portCount')?.label).toBe('Количество портов')
    expect(byKey.get('peripheralKind')?.label).toBe('Вид')
  })

  it('returns no fields for an unknown type key', () => {
    expect(typeFields('all')).toEqual([])
    expect(typeFields('')).toEqual([])
  })
})

describe('buildZodSchema — strict per-type whitelist (Pitfall 7)', () => {
  it('monitor schema rejects laptop ramGb keys (strict object)', () => {
    const schema = buildZodSchema('monitor')
    expect(schema.safeParse({ ramGb: 8 }).success).toBe(false)
    expect(
      schema.safeParse({ ramGb: 8, ramUpgraded: true, ssdGb: 256 }).success,
    ).toBe(false)
  })

  it('laptop schema rejects peripheralKind and panelType keys', () => {
    const schema = buildZodSchema('laptop')
    expect(schema.safeParse({ peripheralKind: 'мышь' }).success).toBe(false)
    expect(schema.safeParse({ panelType: 'IPS' }).success).toBe(false)
  })

  it('peripheral schema requires a valid peripheralKind — empty string fails', () => {
    const schema = buildZodSchema('peripheral')
    expect(schema.safeParse({}).success).toBe(false)
    expect(schema.safeParse({ peripheralKind: '' }).success).toBe(false)
    expect(schema.safeParse({ peripheralKind: 'гарнитура' }).success).toBe(true)
    expect(schema.safeParse({ peripheralKind: 'тостер' }).success).toBe(false)
  })

  it('laptop optional numbers are strict positive ints, flag is boolean', () => {
    const schema = buildZodSchema('laptop')
    expect(schema.safeParse({}).success).toBe(true)
    expect(schema.safeParse({ ramGb: 16, ramUpgraded: true, ssdGb: 512 }).success).toBe(true)
    expect(schema.safeParse({ ramGb: 0 }).success).toBe(false)
    expect(schema.safeParse({ ramGb: 8.5 }).success).toBe(false)
    expect(schema.safeParse({ ramGb: -4 }).success).toBe(false)
    expect(schema.safeParse({ ramUpgraded: 'yes' }).success).toBe(false)
  })

  it('monitor accepts a fractional diagonal and caps panelType at 40 chars', () => {
    const schema = buildZodSchema('monitor')
    expect(schema.safeParse({ screenDiagonal: 27.5 }).success).toBe(true)
    expect(schema.safeParse({ screenDiagonal: 0 }).success).toBe(false)
    expect(schema.safeParse({ panelType: 'а'.repeat(40) }).success).toBe(true)
    expect(schema.safeParse({ panelType: 'а'.repeat(41) }).success).toBe(false)
  })

  it('dock portCount is an int of at least 1', () => {
    const schema = buildZodSchema('dock')
    expect(schema.safeParse({}).success).toBe(true)
    expect(schema.safeParse({ portCount: 1 }).success).toBe(true)
    expect(schema.safeParse({ portCount: 0 }).success).toBe(false)
    expect(schema.safeParse({ portCount: 2.5 }).success).toBe(false)
  })
})
