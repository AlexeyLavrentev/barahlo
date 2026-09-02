---
phase: 03-device-registry
reviewed: 2026-09-02T10:37:44Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - lib/device-schema.ts
  - lib/ru.ts
  - db/queries/devices.ts
  - app/(app)/devices/page.tsx
  - app/(app)/devices/actions.ts
  - app/(app)/devices/device-dialog.tsx
  - app/(app)/devices/type-filter.tsx
  - app/(app)/devices/loading.tsx
  - app/(app)/devices/error.tsx
  - app/(app)/nav.tsx
  - app/(app)/(card)/devices/[id]/page.tsx
  - app/(app)/(card)/devices/[id]/error.tsx
  - app/(app)/page.tsx
  - app/(app)/layout.tsx
  - components/ui/select.tsx
  - components/ui/checkbox.tsx
  - tests/device-schema.test.ts
  - tests/devices-queries.test.ts
  - scripts/smoke-devices.mjs
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-09-02T10:37:44Z
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Reviewed the Device Registry slice at standard depth with cross-file tracing: keystone module → queries → actions → RSC pages → client dialog/filter islands → tests → smoke. Verified against 03-CONTEXT (D-01..D-06), the binding 03-UI-SPEC, and the vercel-react-best-practices rules called out in 03-RESEARCH.

The security perimeter is solid. Both actions call `requireSession()` first; the zod whitelist is genuinely strict (verified by tests: injected `typeKey`/`status`/`currentEmployeeId` are rejected, update takes its type from the DB row, never the payload); normalized serial/inventory pairs are recomputed on every mutation including the empty→NULL/NULL rule; UNIQUE collisions surface as `{code}` and map to the Russian copy, not 500s; there is no delete path (test-pinned); all SQL is parameterized drizzle; nothing user-controlled reaches markup unescaped. 37 unit tests pass and `tsc --noEmit` is clean.

Three warnings: one user-reachable crash via a fractional `?page=` query param (verified against better-sqlite3: non-integer OFFSET throws), and two deviations from the approved UI-SPEC (list sort order, card edit-button variant). No critical issues found.

## Critical Issues

None.

## Warnings

### WR-01: Fractional `?page=` query param crashes the devices list route

**File:** `app/(app)/devices/page.tsx:45`, `db/queries/devices.ts:114,130`
**Issue:** The page param is clamped but never integer-validated: `Math.max(1, Number(sp.page) || 1)` accepts e.g. `1.05`. `listDevices` then computes `offset = (current - 1) * pageSize = 1.0000000000000009` and drizzle binds it as a REAL to `OFFSET ?`. Verified: better-sqlite3 throws `TypeError: datatype mismatch` for non-integer OFFSET. The RSC render throws, so `GET /devices?page=1.05` renders the error boundary («Не удалось загрузить список») and «Попробовать снова» re-throws — the user is stuck until they hand-edit the URL. Values like `?page=1.5` that happen to produce an integer offset instead render a nonsense «Страница 1.5 из 3» label with an overlapping row window. Note: the identical pattern exists in `app/(app)/employees/page.tsx:48` (phase 2, out of scope) — this phase re-implemented the flaw, not copied it accidentally.
**Fix:**
```ts
// app/(app)/devices/page.tsx
const parsedPage = Number(sp.page)
const page =
  Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
```

### WR-02: List sort order contradicts the binding UI-SPEC (alphabetical vs newest-first)

**File:** `db/queries/devices.ts:64,128`
**Issue:** The approved UI-SPEC is explicit in two places — list contract («Sort: newest first (`created_at DESC`, id DESC tiebreak)», 03-UI-SPEC:108) and Defaults («`created_at DESC` (newest first) … inventory operator adds a device and looks for it at the top», 03-UI-SPEC:222). The implementation orders by `ruSortKey` (RU-alphabetical on model) + `asc(id)`. `03-01-SUMMARY.md:50` documents this as a deliberate «план исполняемый контракт, UI-SPEC-дефолт перекрыт» override, but the UI-SPEC — the contract downstream phases and reviewers read — was never amended and still promises newest-first. Either the shipped behavior or the contract doc is wrong; as shipped, an operator who adds a device will not find it at the top, the exact scenario the spec default was written for.
**Fix:** Pick one and make the artifacts agree. If newest-first wins:
```ts
.orderBy(desc(devices.createdAt), desc(devices.id))
```
If RU-sort-by-model wins, update 03-UI-SPEC:108/222 (and note the override in the spec itself) so phase 5 planning does not inherit a stale contract.

### WR-03: Card «Редактировать» renders as an accent-primary button; UI-SPEC says secondary

**File:** `app/(app)/devices/device-dialog.tsx:543` (consumed by `app/(app)/(card)/devices/[id]/page.tsx:217-221`)
**Issue:** The dialog trigger is `<DialogTrigger render={<Button size="xl" data-device-edit-id={device?.id} />}>` with no `variant`, so it falls through to Button's `default` variant — solid `#0071E3` accent fill. The UI-SPEC card contract says «Редактировать» is a **secondary** button (03-UI-SPEC:112), and the Color section reserves accent for exactly: the list primary CTA, the dialog primary, and focus/select checkmarks (03-UI-SPEC:81-83). Every device card therefore shows an extra accent-filled button, diluting the «one primary CTA per screen» rule. The same deviation shipped in the phase-2 employee dialog (`employee-dialog.tsx:216`), so this is a consistent precedent — but the phase-3 spec restated «secondary» explicitly, and the review brief treats the spec as binding.
**Fix:** The component knows its mode — style the trigger by it:
```tsx
<DialogTrigger
  render={
    <Button
      size="xl"
      variant={editing ? 'secondary' : 'default'}
      data-device-edit-id={device?.id}
    />
  }
>
```
(or, if phase 2's primary «Редактировать» is deemed the real standard, amend both UI-SPECs instead.)

## Info

### IN-01: Dialog height cap 75svh vs the spec'd 85svh

**File:** `app/(app)/devices/device-dialog.tsx:286`
**Issue:** UI-SPEC dialog scroll contract: body scrolls with `max-h-[85svh] overflow-y-auto` (03-UI-SPEC:38). The implementation caps the form at `max-h-[75svh]` — scrolling and the pinned footer both work, but the panel is 10svh shorter than contracted, which is felt most on this 8–11-field form.
**Fix:** `className="flex max-h-[85svh] flex-col"` — or record 75svh as the new default in the spec.

### IN-02: `max-w-md` on DialogContent is likely defeated by its base `sm:max-w-sm`

**File:** `app/(app)/devices/device-dialog.tsx:547`
**Issue:** `DialogContent`'s shadcn base carries `sm:max-w-sm`; the consumer passes `max-w-md p-6`. `cn()` is `twMerge(clsx(...))`, which treats `max-w-md` and `sm:max-w-sm` as different variant groups and keeps both; in Tailwind's cascade the responsive rule wins at ≥640px, so the panel renders at 384px instead of the spec'd 448px `max-w-md`. The phase-2 employee dialog has the same interaction — verify against the built CSS; if confirmed, the device form (the tallest dialog yet) is ~64px narrower than designed.
**Fix:** Pass a responsive-matching class so twMerge deduplicates the group: `className="max-w-md sm:max-w-md p-6"`, or add the override in `dialog.tsx` once for both dialogs.

### IN-03: Invalid calendar dates pass the regex and fail late with the wrong copy

**File:** `lib/device-schema.ts:160,163`, `app/(app)/devices/actions.ts:170,173`
**Issue:** `^\d{4}-\d{2}-\d{2}$` accepts non-existent dates (`2026-02-30`, `2026-13-01`). Zod passes them, then `new Date('2026-02-30')` yields Invalid Date and the SQLite bind throws inside `createDevice`/`updateDevice` — the action's catch maps it to the generic «Не удалось сохранить…» instead of the agreed «Введите дату» under the field. Only reachable via a tampered/form-typed request (date pickers emit valid dates), hence Info.
**Fix:** Add a real-date refine in the keystone:
```ts
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()), 'invalid date')
```

### IN-04: Actions swallow unexpected DB errors without logging

**File:** `app/(app)/devices/actions.ts:207-211,246-248`
**Issue:** The catch-alls around `createDevice`/`updateDevice` map every non-UNIQUE failure to the generic string and return — no `console.error`, no digest. A genuine unexpected failure (FK, datatype, disk) leaves no server-side trace, which makes field reports like «кнопка не сохраняет» undebuggable. (Same shape as the phase-2 employee actions; fixing one fixes the pattern.)
**Fix:** Log before mapping: `catch (e) { console.error('createDeviceAction failed:', e); return uniqueFieldError(e) }`.

### IN-05: Smoke script smuggles `redirect: 'manual'` inside the headers object

**File:** `scripts/smoke-devices.mjs:132` (used at 135, 160, 172, 184, 193, 203, 237)
**Issue:** `const cookieHeaders = { cookie: ..., redirect: 'manual' }` is then passed as `headers:`, so every with-cookie request sends a junk `redirect: manual` HTTP header while the intended fetch option is silently absent (those steps run with default redirect-follow). Harmless today (no redirects occur with a valid cookie), but if a protected route ever redirected, step 7 would follow to `/login`, get a 200, and fail confusingly on the probe needle. The card/404 steps that re-declare `redirect: 'manual'` at the init level work correctly.
**Fix:** Keep only the cookie in the headers object: `const cookieHeaders = { cookie: \`session=${token}\` }`, and pass `redirect: 'manual'` per-call where wanted.

---

_Per-reviewed-file notes:_ `lib/device-schema.ts` (keystone: strict whitelists, test-pinned type/status exclusion), `lib/ru.ts` (RU plural forms verified for 0/1/2/5/11/21), `type-filter.tsx` (full-query-string push, page reset), `nav.tsx` / `app/(app)/page.tsx` / `layout.tsx` (nav order, redirect, guard), card `page.tsx` (zod-gated id → notFound(), UTC-consistent date formatting, D-06 groups), `loading.tsx` / both `error.tsx` (UI-SPEC copy, `retry` prop), `components/ui/select.tsx` / `checkbox.tsx` (usage: `items`+hidden-input pattern, checked-name-submits-`on` assumption — both consistent with the action's parsing): no defects beyond those listed.

_Reviewed: 2026-09-02T10:37:44Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
