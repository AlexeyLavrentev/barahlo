// Thin typed entry point for app code (phases 2–6). The implementation lives
// in lib/normalize.mjs so scripts/*.mjs share it without a build step.
import {
  normalizeInventory as _normalizeInventory,
  normalizeNumber as _normalizeNumber,
  normalizeSerial as _normalizeSerial,
} from './normalize.mjs'

export const normalizeNumber: (input: string) => string = _normalizeNumber
export const normalizeSerial: (input: string) => string = _normalizeSerial
export const normalizeInventory: (input: string) => string = _normalizeInventory
