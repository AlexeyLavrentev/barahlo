---
phase: 14-xlsx
reviewed: 2026-10-01T04:59:15Z
depth: standard
status: findings
files_reviewed: 6
files_reviewed_list:
  - lib/device-xlsx.ts
  - app/api/devices/export-xlsx/route.ts
  - app/(app)/devices/filter-bar.tsx
  - components/command-palette.tsx
  - package.json
  - tests/xlsx-export.test.ts
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
---

# Phase 14: Code Review Report

**Reviewed:** 2026-10-01T04:59:15Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** findings

## Summary

Phase 14 (XLSX-выгрузка ведомости) reviewed at standard depth against the CSV analog (`app/api/devices/export/route.ts`, `lib/device-csv.ts`, `lib/csv.ts`), the session/binary-body precedents (`lib/auth.ts`, `app/api/attachments/[attachmentId]/route.ts`), the locked decisions D-01..D-08 (14-CONTEXT.md), the verified write-excel-file@4.1.1 API rules (14-RESEARCH.md), and the mandated `vercel-react-best-practices` skill (server-auth-actions, bundle-analyzable-paths, server-no-shared-module-state).

Verified clean, with evidence:

- **Security posture holds.** `await requireSession()` is the first statement of the new route (`route.ts:42`); response headers are hardcoded constants built only from an internal UTC date — no input is echoed (V5); no error path echoes internals (V7); `nosniff` + `no-store` present; the RFC 5987 dual filename mirrors the shipped CSV form. No Formula cells (formula injection CWE-1236 structurally absent — XLSX strings are inert shared strings, pinned by `tests/xlsx-export.test.ts:334-340`).
- **D-07 zero-drift chain is verbatim** relative to the CSV route; the shared parser/strip/query trio is imported, not duplicated. `git log --name-only` over the phase-14 commits (6027305..fb49778) confirms the CSV route, `lib/device-csv.ts`, and `lib/csv.ts` were byte-untouched — the prohibition holds.
- **D-05 inversion is correct.** Labels come from `deviceCsvHeader()` (no parallel 20-label dictionary); `XLSX_COLUMN_WIDTHS` has exactly 20 entries; BOM/«;»/`esc()`/`diagonalCell`/`isoFileDate` do not leak into the XLSX path.
- **D-03 typing is correct, including the dangerous direction.** Serials/inventory are `{ type: String, format: '@' }` with no `Number()`/`+` coercion between the query row and the cell array; the only format ever attached to a String cell is `'@'` (Pitfall 14.1), pinned at `tests/xlsx-export.test.ts:342-350`.
- **Null-in-typed-cell safety traced in library source.** `node_modules/write-excel-file/modules/xlsx/files/sheet.xml/row.js` + `cell.js`: `isEmpty(value)` → `value = null`; `generateCell` returns an empty (styled) cell before any type validation — so `{ value: null, type: Number, format: '0.0' }` cannot throw. See WR-01 for the test-gap this leaves.
- **Surfaces match D-08.** `filter-bar.tsx` places the XLSX anchor after the CSV anchor without a second `ml-auto` (Pitfall 14.5 respected); the palette XLSX row is a byte-shaped mirror of the CSV row (`render={<a href>}` + close-on-click), keeping native download semantics on Enter (Pitfall 14.4).
- **Skill checks pass.** `lib/device-xlsx.ts` is pure (no `server-only`, no `next/*`, no module-level mutable state — vitest-importable as required); the library is imported through the statically analyzable `write-excel-file/node` subpath, never the browser-build root (bundle-analyzable-paths + D-04); `package.json` pins `write-excel-file` at exactly `4.1.1` (no caret).
- **Toolchain evidence:** `npx vitest run` → 514/514 green (28 files, incl. 31 new XLSX pins); `npx tsc --noEmit` → 0 errors; `npx eslint` on all five source files → 0 problems. The one accepted deviation (the `as SheetData` cast for null cell values, `lib/device-xlsx.ts:91-123`) is documented against the library's `CellObjectOfType` omission and was verified against runtime behavior — not re-flagged per the known-accepted list.

No critical issues found. One warning (test-coverage gap on a now-safe library branch) and two info items below.

## Warnings

### WR-01: Null DB values inside typed cell objects never reach real workbook generation in tests

**File:** `tests/xlsx-export.test.ts:353-366` (with `lib/device-xlsx.ts:96-108`)
**Issue:** `buildDeviceXlsx` is invoked only with (a) zero rows and (b) the fully-filled control row. The most common real-world sparse row — `null` `inventoryNumber`/`screenDiagonal`/`purchasePrice` riding inside `{ type, format }` cell objects (the `rowFixture` defaults are exactly this shape) — never passes through `writeXlsxFile`, because `deviceXlsxSheetData` tests never call the assembly step. The null→empty-cell branch for *typed* cells is therefore only source-verified (safe in the pinned 4.1.1: `row.js` normalizes empty values to `null`, `cell.js` emits an empty styled cell before type validation), not test-pinned. A future deliberate upgrade of the exact-pinned dependency could change null handling and every partial device row (device without price/diagonal/inventory — the norm, not the exception) would 500 the export, with a fully green suite. The "pinned core" claim of SC 2/3 currently does not cover this branch.
**Fix:** add one test to the `buildDeviceXlsx` describe — generate a workbook from a sparse row and assert it resolves to valid bytes:

```typescript
it('разреженная строка (null-инвентарник/диагональ/цена в типизированных объектах) → валидная книга', async () => {
  const buf = await buildDeviceXlsx([rowFixture({})], today) // все поля null, кроме serial/type/model
  expect(buf.subarray(0, 2).toString('latin1')).toBe('PK')
})
```

## Info

### IN-01: `ramUpgraded` ternary now lives in two files

**File:** `lib/device-xlsx.ts:104` (duplicate of `lib/device-csv.ts:135`)
**Issue:** the phase-5 semantics ternary (`null → null / 1 → 'да' / 0 → 'нет'`) is hand-copied between the CSV and XLSX row builders. The phase research explicitly sanctioned this inline copy ("zero production refactor" option), so it is not a violation — but it is now the one cell renderer duplicated across the two formats, and a future wording/semantics change can silently drift them (the exact WR-01-class drift the rest of the file is built to prevent).
**Fix:** when either file is next touched, extract a shared `ramUpgradedCell(value: number | null): 'да' | 'нет' | null` into `lib/device-csv.ts` and import it from both builders (research Pattern table already sketches this).

### IN-02: `XLSX_COLUMN_WIDTHS` is positionally coupled to `deviceCsvHeader()` with no length cross-check

**File:** `lib/device-xlsx.ts:33-54`
**Issue:** the 20 hardcoded widths are ordered "in `deviceCsvHeader()` order" by comment convention only. If the keystone gains a column, the header test pins the *header* at 20 and fails — but the widths array has no assertion anywhere, and the library silently maps `columns[]` onto the first N columns, so a partially-updated file would misalign every width after the insertion point without an error.
**Fix:** one-line pin in the existing header describe of `tests/xlsx-export.test.ts`:

```typescript
expect(XLSX_COLUMN_WIDTHS).toHaveLength(deviceCsvHeader().length)
```

---

_Reviewed: 2026-10-01T04:59:15Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
