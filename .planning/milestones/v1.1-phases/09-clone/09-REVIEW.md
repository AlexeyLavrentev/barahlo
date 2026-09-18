---
phase: 09-clone
reviewed: 2026-09-17T05:41:41Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - drizzle/0001_cooing_wendell_rand.sql
  - scripts/migrate.mjs
  - lib/inventory-increment.ts
  - app/(app)/devices/clone-dialog.tsx
  - db/schema.ts
  - db/queries/devices.ts
  - db/queries/movements.ts
  - app/(app)/devices/actions.ts
  - app/(app)/(card)/devices/[id]/page.tsx
  - tests/inventory-increment.test.ts
  - tests/clone-queries.test.ts
  - tests/migrate-runner.test.ts
  - tests/schema.test.ts
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 9: Code Review Report

**Reviewed:** 2026-09-17T05:41:41Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Phase 9 (device cloning) was reviewed at standard depth: migration 0001 (serial → nullable), the host-side migration runner, the clone core (`cloneDevices`), the server action + dialog, the card-page integration, and the four new/updated test files. Evidence gathered: full-file reads of all 13 files, cross-file tracing of the clone path (dialog → action → zod → query → transaction → UNIQUE mapping), git-diff verification of the frozen surfaces, and execution of the suite (`vitest run`: 391/391 green; `tsc --noEmit` clean; `eslint` clean on the new sources). The `better-sqlite3@13` FK-default claim underpinning the runner was re-probed against the installed package (fresh connection reports `foreign_keys = 1`) — the migrate.mjs premise is factually correct.

Overall this is a disciplined implementation: the transactional N-insert core, the NULL/NULL pair handling, the zod whitelist, and the migration recreation are all correct and well-tested. The frozen surfaces (`lib/device-schema.ts`, `device-actions.tsx`) have empty diffs against `d34c202`; movement semantics are untouched (movements.ts diff is type-nullability only); `requireSession()` remains the first statement of `cloneDeviceAction`. The migration was verified column-by-column against 0000 (all 23 columns copied, all 5 indexes recreated including the partial warranty index, CHECK rewritten by the rename and empirically enforced, append-only triggers survive, AUTOINCREMENT sequence continuity exercised by tests).

One real defect was found and empirically proven: `nextInventoryNumber` silently corrupts or self-collides inventory series for digit tails beyond 2^53, and its safety comment is mathematically false. No critical issues.

## Warnings

### WR-01: `nextInventoryNumber` loses integer precision on long digit tails — silent series corruption or self-colliding batch

**File:** `lib/inventory-increment.ts:22-24` (comment at lines 22-23 is the false claim)

**Issue:** The increment uses `Number(digits) + 1`. The inline comment claims "tails ≤ 80 chars are far below 2^53" — this is mathematically false: an 80-digit tail is ~2^265, and the zod `max(80)` cap bounds length, not numeric value. Probed against the exact function logic:

- `nextInventoryNumber('9007199254740992')` (exact 2^53) returns `'9007199254740992'` — the SAME string. A 2-copy batch writes copy 1 with this inventory, then copy 2 collides on `devices_inventory_norm_uq` → the whole batch rolls back with the misleading field copy «Устройство с таким инвентарным номером уже есть» (referring to a number the operator just typed).
- `nextInventoryNumber('AB-9999999999999999999999')` (22 nines) returns `'AB-000000000000000001e+22'` — `String(Number)` switched to scientific notation. The server then stores this garbage as the raw inventory number of copies 2..N, silently (values stay distinct, so no UNIQUE rollback saves the data). Each subsequent fold continues the nonsense (`…1e+23`, `…1e+24`).
- Between 2^53 and 1e21 precision loss is silent but renders as an integer: e.g. input `100000000000000001` suggests `100000000000000000` — a number *lower* than the submitted start.

The module's own contract (SC 3) is that an unrecognized pattern yields `''` and nothing is invented; the precision-loss case is an unrecognized pattern by that standard but is not guarded. Realistic 1C inventory numbers are short, which keeps this out of BLOCKER territory — but the claimed invariant is false and the corruption path writes to the DB.

**Fix:**
```typescript
export function nextInventoryNumber(raw: string | null | undefined): string {
  if (!raw) return ''
  const match = raw.trim().match(/^(.*?)(\d+)$/)
  if (!match) return ''
  const [, prefix, digits] = match
  const value = Number(digits)
  // Out of safe-integer range → pattern is not reliably incrementable:
  // same contract as a non-numeric tail (SC 3 — suggest nothing).
  if (!Number.isSafeInteger(value)) return ''
  return prefix + String(value + 1).padStart(digits.length, '0')
}
```
This degrades every oversized tail to the existing silent-empty behavior. Add a unit case to `tests/inventory-increment.test.ts` pinning it (`expect(nextInventoryNumber('9'.repeat(22))).toBe('')`, plus the 2^53 self-collision input).

## Info

### IN-01: Query-level "unrecognized start → all-NULL series" behavior is unpinned

**File:** `db/queries/devices.ts:575-587` (`inventorySequence`)

**Issue:** When the operator submits a non-empty start with no trailing digit (e.g. `ABC`), `inventorySequence` discards it and returns an all-NULL series — N copies are created with no inventory and no error. This matches the plan ("пустой/нераспознанный старт → все null") and SC 3, but it is only tested indirectly (unit: `nextInventoryNumber('ABC') === ''`); no query-level test pins that `cloneDevices(source, 'ABC', 3)` writes three NULL/NULL pairs rather than one raw `ABC` plus NULLs.

**Fix:** Add one assertion to `tests/clone-queries.test.ts`:
```typescript
const ids = cloneDevices(getDevice(sourceId)!, 'ABC', 3)
for (const id of ids) {
  expect(rawDevice(id).inventory_number).toBeNull()
  expect(rawDevice(id).inventory_normalized).toBeNull()
}
```

### IN-02: Test-matrix gaps — N=100 boundary and runner rollback path untested

**File:** `tests/clone-queries.test.ts`, `tests/migrate-runner.test.ts`

**Issue:** (a) The phase context's test matrix named "граница N=100", but no test exercises 100 copies (or rejects 101); the only guard is the action's zod bound and there are no action-level tests (consistent with the codebase, which has none for any action — the query-level N=100 batch would still pin the transaction at its cap). (b) The migrate.mjs header promises "сбой любого стейтмента откатывает файл целиком" and FK restoration on failure, but no test drives `runMigrations` into a mid-batch failure to prove rollback + `foreign_keys = ON` after the catch path.

**Fix:** (a) One test: `cloneDevices(getDevice(id)!, null, 100)` returns 100 distinct ids. (b) One test with a fixture DB containing a pending journal entry whose SQL collides (e.g. re-creating an existing table): assert `runMigrations` throws, row counts are unchanged, and `sqlite.pragma('foreign_keys', { simple: true }) === 1`.

### IN-03: migrate.mjs CLI-detection throws when `process.argv[1]` is undefined

**File:** `scripts/migrate.mjs:98`

**Issue:** The module-level guard `if (import.meta.url === pathToFileURL(process.argv[1]).href)` calls `pathToFileURL(undefined)` when the module is imported from a context without `argv[1]` (`node -e`, REPL, some workers) — a TypeError at import time instead of simply not running the CLI. Today only vitest and the direct CLI import it, so nothing breaks, but the file's own contract ("импорт из тестов ничего не исполняет") holds only by accident of vitest setting `argv[1]`. Relatedly, a failed `new Database(file)` in the CLI tail escapes as an unhandled stack trace rather than the clean `console.error` + exit-1 path used for migration failures.

**Fix:**
```javascript
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
```
and wrap the `new Database(file)` open in the same try/catch as `runMigrations`.

---

## Verified sound (no findings)

- **Migration 0001**: recreation copies all 23 columns; indexes (incl. partial `devices_warranty_until_idx`) recreated post-rename; CHECK rewritten by `RENAME` and empirically enforced post-migration (both `tests/migrate-runner.test.ts` and `tests/schema.test.ts`); append-only triggers survive; AUTOINCREMENT continuity exercised; `pragma_table_info` asserts both serial columns `notnull=0`; snapshot `0001_snapshot.json` matches the SQL (serial nullable, CHECK value references `devices` post-rename).
- **Migration runner premise**: re-probed `better-sqlite3@13.0.3` — fresh connections report `foreign_keys = 1`; `PRAGMA foreign_keys=OFF` before `BEGIN` is the only working lever, exactly as documented. Pending-entry rule (`when > last created_at`) and tracking-row format (sha256 + journal `when`) are CLI-compatible per the drizzle-orm comparison rule.
- **Clone core**: one `db.transaction` per batch (rollback proven by the mid-batch collision test, `{ code: 'inventoryNormalized' }` shape asserted); serial NULL/NULL written directly by the query layer; inventory always through `inventoryPair` (empty → NULL/NULL, never `''`); notes/holder/movements/attachments provably untouched; status hardcoded `in_stock`; type config inherited sparsely.
- **Action contract**: `requireSession()` first; strict 3-field zod whitelist (`z.strictObject` — injected `status`/`currentEmployeeId`/`notes` rejected as a class); `''` → `undefined` → NULL before the query layer; echo-values on every failure; UNIQUE collisions mapped to the byte-exact «уже есть» field copy with the clone-specific generic fallback; `refresh()` on success. The absent server-side disposed-source guard is the plan's locked resolution (09-01-PLAN A1: UI-hiding only, "ретаргет — одна строка, если владелец захочет иного") — not a defect.
- **Dialog**: wrapper-owned open state + portal-mounted `useActionState` form; success line survives `refresh()` and clears on reopen; RAW (never normalized) inventory prop feeds the prefill; one pure function shared by client prefill and server fold.
- **Frozen surfaces**: `lib/device-schema.ts` (serial `min(1)` intact) and `device-actions.tsx` — empty diffs vs `d34c202`; `movements.ts` changes are type-nullability + comments only, no behavioral change; registry/dashboard/employee pages updated for `serialNumber ?? '—'` consistently.
- **Checks**: `vitest run` 391/391 across 23 files; `tsc --noEmit` clean; `eslint` clean on the new sources; no debug artifacts, no hardcoded secrets, no injection surfaces (drizzle binds everything; all payloads zod-whitelisted).

---

_Reviewed: 2026-09-17T05:41:41Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
