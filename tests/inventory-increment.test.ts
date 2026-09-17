import { describe, expect, it } from 'vitest'
import { nextInventoryNumber } from '@/lib/inventory-increment'

// D-02 matrix (REG-06, SC 3): «следующий по шаблону» с сохранением нулевого
// паддинга; нераспознанный шаблон или пустой оригинал → '' — молча, ничего
// не дописывается. The function runs on the RAW value (Pitfall 4): case and
// prefix survive verbatim; stored uniqueness is inventoryPair's job.
describe('nextInventoryNumber', () => {
  it('increments the tail and keeps zero padding', () => {
    expect(nextInventoryNumber('AB-001')).toBe('AB-002')
    expect(nextInventoryNumber('INV 007')).toBe('INV 008')
    expect(nextInventoryNumber('2026-0001')).toBe('2026-0002')
  })

  it('carries over naturally when padding overflows', () => {
    expect(nextInventoryNumber('AB-099')).toBe('AB-100')
    expect(nextInventoryNumber('AB-999')).toBe('AB-1000')
  })

  it('preserves the operator case and prefix verbatim (RAW, not normalized)', () => {
    expect(nextInventoryNumber('ab-001')).toBe('ab-002')
    expect(nextInventoryNumber('Ab-001')).toBe('Ab-002')
    expect(nextInventoryNumber('иб-000146')).toBe('иб-000147')
  })

  it('returns an empty string for a tail without trailing digits (SC 3 — silent)', () => {
    expect(nextInventoryNumber('ABC')).toBe('')
    expect(nextInventoryNumber('СКЛАД-А')).toBe('')
    expect(nextInventoryNumber('12а')).toBe('')
  })

  it('returns an empty string for an empty/null/undefined original', () => {
    expect(nextInventoryNumber('')).toBe('')
    expect(nextInventoryNumber(null)).toBe('')
    expect(nextInventoryNumber(undefined)).toBe('')
    expect(nextInventoryNumber('   ')).toBe('')
  })

  it('handles a bare-number tail', () => {
    expect(nextInventoryNumber('146')).toBe('147')
  })

  it('builds an N-copy series by folding N−1 times (server sequence recipe)', () => {
    let current = 'AB-098'
    const series = Array.from({ length: 3 }, () => {
      current = nextInventoryNumber(current)
      return current
    })
    expect(series).toEqual(['AB-099', 'AB-100', 'AB-101'])
  })

  it('degrades precision-unsafe digit tails to silent-empty (WR-01, SC 3)', () => {
    // 2^53 is exact in a double but NOT a safe integer: without the guard the
    // old code returned the SAME string and a 2-copy batch self-collided on
    // devices_inventory_norm_uq instead of silently suggesting nothing.
    expect(nextInventoryNumber('9007199254740992')).toBe('')
    expect(nextInventoryNumber('AB-9007199254740992')).toBe('')
    // Incrementing MAX_SAFE_INTEGER would land on 2^53 — guarded too.
    expect(nextInventoryNumber('AB-9007199254740991')).toBe('')
    // 22+ digit tails rendered as scientific-notation garbage ('…1e+22').
    expect(nextInventoryNumber('AB-9999999999999999999999')).toBe('')
    expect(nextInventoryNumber('9'.repeat(22))).toBe('')
    // Silent precision loss just past the safe range must not slip through.
    expect(nextInventoryNumber('AB-100000000000000001')).toBe('')
    // The last safely incrementable boundary still increments exactly.
    expect(nextInventoryNumber('AB-9007199254740990')).toBe('AB-9007199254740991')
  })
})
