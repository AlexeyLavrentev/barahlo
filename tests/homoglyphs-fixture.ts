import { HOMOGLYPHS } from '@/lib/normalize'

// FIND-04 typing-test fixture (closes the STATE.md homoglyph blocker): the
// documented pairs of lib/normalize.mjs as a typed table. The device-search
// matrix proves every pair in BOTH required directions — a serial holding
// the Latin letter is found by the Cyrillic-typed twin, and (for the
// reverse subset below) the Latin-typed query also finds the Cyrillic-
// stored twin through the norm() UDF.
export type HomoglyphPair = { cyr: string; lat: string }

export const HOMOGLYPH_PAIRS: readonly HomoglyphPair[] = [
  { cyr: 'А', lat: 'A' },
  { cyr: 'В', lat: 'B' },
  { cyr: 'С', lat: 'C' },
  { cyr: 'Е', lat: 'E' },
  { cyr: 'Н', lat: 'H' },
  { cyr: 'К', lat: 'K' },
  { cyr: 'М', lat: 'M' },
  { cyr: 'О', lat: 'O' },
  { cyr: 'Р', lat: 'P' },
  { cyr: 'Т', lat: 'T' },
  { cyr: 'Х', lat: 'X' },
]

// Reverse-direction subset (05-RESEARCH Validation Architecture): for these
// pairs the test also searches with the LATIN letter against a device whose
// MODEL stores the Cyrillic twin raw — the column that exercises the UDF.
export const REVERSE_DIRECTION_CYR: readonly string[] = ['С', 'О', 'Е']

// Completeness guard: the matrix FAILS if the exported map grows or changes
// without the fixture following — every Object.keys(HOMOGLYPHS) entry must
// appear as a cyr/lat row in the table, and every row must be a real map
// entry with the exact mapped counterpart.
export function assertFixtureCompleteness(): void {
  const mapEntries = Object.entries(HOMOGLYPHS)
  for (const [cyr, lat] of mapEntries) {
    const row = HOMOGLYPH_PAIRS.find((p) => p.cyr === cyr)
    if (!row) {
      throw new Error(
        `HOMOGLYPHS key «${cyr}» is missing from the fixture table — add it to HOMOGLYPH_PAIRS`,
      )
    }
    if (row.lat !== lat) {
      throw new Error(
        `fixture pair «${cyr}»→«${row.lat}» disagrees with the map («${cyr}»→«${lat}»)`,
      )
    }
  }
  if (HOMOGLYPH_PAIRS.length !== mapEntries.length) {
    throw new Error(
      `fixture has ${HOMOGLYPH_PAIRS.length} pairs but HOMOGLYPHS has ${mapEntries.length}`,
    )
  }
}
