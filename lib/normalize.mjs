// Single source of number normalization (Pitfall 5: normalize on write AND on
// search). Plain ESM (.mjs) so both the app and scripts/*.mjs import it without
// a build step. Normalized columns are UNIQUE (D-17); inventory numbers are
// manual-only, entered exactly as assigned by 1C (D-16).

// Cyrillic homoglyphs → Latin counterparts (documented starting set; the
// fixture completeness is proven in Phase 5, FIND-04).
const HOMOGLYPHS = {
  'А': 'A',
  'В': 'B',
  'С': 'C',
  'Е': 'E',
  'Н': 'H',
  'К': 'K',
  'М': 'M',
  'О': 'O',
  'Р': 'P',
  'Т': 'T',
  'Х': 'X',
}

export function normalizeNumber(input) {
  const upper = input.trim().replace(/\s+/g, ' ').toUpperCase()
  return [...upper].map((ch) => HOMOGLYPHS[ch] ?? ch).join('')
}

// Named wrappers — synonyms today; phases 3/5 may tighten per-column rules
// (e.g. inventory format checks) without changing call sites.
export const normalizeSerial = normalizeNumber
export const normalizeInventory = normalizeNumber
