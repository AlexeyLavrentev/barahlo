import { describe, expect, it } from 'vitest'
import { normalizeInventory, normalizeNumber, normalizeSerial } from '@/lib/normalize'

// Imports go through the typed re-export (lib/normalize.ts) — this checks both
// the re-export wiring and the logic in lib/normalize.mjs.

describe('normalizeNumber', () => {
  it('trims surrounding whitespace and upper-cases', () => {
    expect(normalizeNumber(' c123 ')).toBe('C123')
  })

  it('keeps Cyrillic that has no Latin twins unchanged', () => {
    expect(normalizeNumber('ИБ-0000146')).toBe('ИБ-0000146')
  })

  it('maps all 11 Cyrillic homoglyphs (А,В,С,Е,Н,К,М,О,Р,Т,Х) to Latin', () => {
    expect(normalizeNumber('С123')).toBe('C123')
    expect(normalizeNumber('ОРО')).toBe('OPO')
    const pairs: Record<string, string> = {
      'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H', 'К': 'K',
      'М': 'M', 'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X',
    }
    for (const [cyr, lat] of Object.entries(pairs)) {
      expect(normalizeNumber(cyr)).toBe(lat)
      expect(normalizeNumber(cyr.toLowerCase())).toBe(lat)
    }
  })

  it('collapses inner whitespace to one space (does not remove it)', () => {
    expect(normalizeNumber('a  b')).toBe('A B')
  })

  it('exposes serial/inventory wrappers identical to normalizeNumber', () => {
    const samples = [' c123 ', 'ИБ-0000146', 'С123', 'ОРО', 'a  b', 'sn-ab12']
    for (const s of samples) {
      expect(normalizeSerial(s)).toBe(normalizeNumber(s))
      expect(normalizeInventory(s)).toBe(normalizeNumber(s))
    }
  })

  it('returns an empty string for empty input without throwing', () => {
    expect(normalizeNumber('')).toBe('')
  })
})
