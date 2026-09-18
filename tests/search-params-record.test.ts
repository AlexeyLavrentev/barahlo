import { describe, expect, it } from 'vitest'
import { searchParamsRecord } from '@/lib/search-params-record'
import { parseDevicesSearchParams } from '@/app/(app)/devices/query-params'

// D-08 fix #1 (phase 11, the WR-01 of phase 8): the export route must shape
// URLSearchParams into a Record the way Next does for the /devices page —
// duplicated params become arrays in order of occurrence, so the shared
// parser's array-degradation path (T-03-04) makes the CSV equal the page for
// every URL, well-formed or not. Convention of normalize.test.ts: a pure
// describe/it without a db (query-params.ts is pure by module contract).

describe('searchParamsRecord — shaping URLSearchParams to a Record', () => {
  it('a single parameter yields its string value', () => {
    expect(searchParamsRecord(new URLSearchParams('q=елк'))).toEqual({
      q: 'елк',
    })
  })

  it('a duplicated key yields an array in order of occurrence', () => {
    expect(
      searchParamsRecord(new URLSearchParams('type=laptop&type=monitor')),
    ).toEqual({ type: ['laptop', 'monitor'] })
  })

  it('three values of one key yield an array of three', () => {
    expect(
      searchParamsRecord(
        new URLSearchParams('warranty=w30&warranty=w60&warranty=expired'),
      ),
    ).toEqual({ warranty: ['w30', 'w60', 'expired'] })
  })

  it('an empty URLSearchParams yields an empty record', () => {
    expect(searchParamsRecord(new URLSearchParams())).toEqual({})
  })

  it('a duplicated key coexists with single keys (the malformed 08-REVIEW URL)', () => {
    expect(
      searchParamsRecord(
        new URLSearchParams('type=laptop&type=monitor&ram=0&ram=1&q=aspire'),
      ),
    ).toEqual({ type: ['laptop', 'monitor'], ram: ['0', '1'], q: 'aspire' })
  })
})

describe('searchParamsRecord → parseDevicesSearchParams — CSV == page on any URL', () => {
  it('a duplicated type degrades to the inactive sentinel (page semantics), never the last value', () => {
    const filters = parseDevicesSearchParams(
      searchParamsRecord(new URLSearchParams('type=laptop&type=monitor')),
    )
    expect(filters.type).toBe('all')
  })

  it('a single type keeps its value', () => {
    const filters = parseDevicesSearchParams(
      searchParamsRecord(new URLSearchParams('type=laptop')),
    )
    expect(filters.type).toBe('laptop')
  })

  it('a duplicated ram degrades to false (no RAM filter), matching the page', () => {
    const filters = parseDevicesSearchParams(
      searchParamsRecord(new URLSearchParams('ram=0&ram=1')),
    )
    expect(filters.ramNoUpgrade).toBe(false)
  })
})
