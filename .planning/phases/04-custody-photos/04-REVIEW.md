---
phase: 04-custody-photos
reviewed: 2026-09-04T05:43:16Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - lib/movement-schema.ts
  - lib/photos.ts
  - lib/ru.ts
  - db/queries/movements.ts
  - db/queries/attachments.ts
  - db/queries/devices.ts
  - app/(app)/devices/actions.ts
  - app/(app)/devices/device-actions.tsx
  - app/(app)/devices/movement-dialogs.tsx
  - app/(app)/devices/page.tsx
  - app/(app)/(card)/devices/[id]/page.tsx
  - app/(app)/(card)/devices/[id]/timeline.tsx
  - app/(app)/(card)/devices/[id]/photo-grid.tsx
  - app/(app)/(card)/employees/[id]/page.tsx
  - app/(app)/employees/actions.ts
  - app/(app)/employees/employee-dialog.tsx
  - app/api/devices/[id]/photos/route.ts
  - app/api/attachments/[attachmentId]/route.ts
  - tests/movements-queries.test.ts
  - tests/attachments-queries.test.ts
  - scripts/smoke-custody.mjs
  - scripts/smoke-devices.mjs
findings:
  critical: 1
  warning: 2
  info: 5
  total: 8
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-09-04T05:43:16Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Reviewed all phase-4 custody and photo files at standard depth, cross-checked against 04-CONTEXT.md (D-01..D-08), the binding 04-UI-SPEC, and 04-RESEARCH patterns. Supporting modules read for contract verification: `lib/auth.ts`, `lib/session.ts` (via auth), `db/schema.ts`, `db/queries/employees.ts`, `proxy.ts`, `compose.yml`, `Dockerfile`, `components/ui/combobox.tsx`. `npx tsc --noEmit` is clean.

The adversarial core of the phase held up well under attack: every custody transition is a single guard-UPDATE transaction with `.changes` deciding (no read-then-write window; eventType hardcoded per action; D-08/D-03 guards re-validated server-side); movements stay append-only; return-all is atomic with per-device events; the 8-photo cap re-check rides one transaction with the INSERT; photo routes are requireSession-first with the attachmentId+deviceId IDOR pair, containment-checked path resolution, hardcoded `image/jpeg` + `nosniff` + private-immutable cache; EXIF/GPS stripping is by-construction in the sharp re-encode; disposed devices refuse upload and delete server-side (verified in tests and smoke). No IDOR, no path traversal, no guard bypass found.

What did not hold: the occurredAt not-future validation runs on **server-local day boundaries** while the deployment container runs UTC (no `TZ` in compose.yml/Dockerfile) and the office wall clock is Moscow (`DISPLAY_TZ = 'Europe/Moscow'` in `lib/ru.ts` — applied to display only, not validation). Result: every custody dialog rejects its own prefilled "today" date during the nightly 00:00–03:00 MSK window. Two warnings cover a stale photo grid after a partially failed batch upload and a misleading picker empty-state; five info items cover minor validation/copy/duplication gaps.

## Critical Issues

### CR-01: occurredAt "not future" validation uses server-local (UTC) day boundary — the prefilled «today» is rejected nightly 00:00–03:00 MSK

**File:** `lib/movement-schema.ts:41-51` (primary); related: `lib/movement-schema.ts:56-68`, `app/(app)/devices/movement-dialogs.tsx:62-67,167`, `compose.yml` / `Dockerfile` (no `TZ` set)

**Issue:** `isNotFutureDate` parses the submitted `yyyy-mm-dd` with `new Date(y, m-1, d)` and compares against `new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)` — both constructed in the **server's local timezone**, which inside the container is UTC (`node:24-slim`, no `TZ` env anywhere in compose.yml or the Dockerfile). The user operates on the Moscow wall clock (the project itself fixed this exact class of bug for *display* — `DISPLAY_TZ = 'Europe/Moscow'` in `lib/ru.ts`, per RESEARCH C7/Pitfall 9 — but never applied it to *validation*). During MSK 00:00–03:00 the UTC server is still on the previous day, so the user's "today" is the server's "tomorrow":

```
MSK 2026-09-03 00:30  ==  UTC 2026-09-02 21:30
chosen  = 2026-09-03T00:00:00Z   (client prefill todayLocal() = Moscow date)
startOfTomorrow (UTC server) = 2026-09-03T00:00:00Z
chosen < startOfTomorrow → false → «Дата не может быть в будущем»
```

Empirically confirmed (script above). The date input is **prefilled with today** and `max`-clamped to today, so for three hours every night the default flow of **all six custody dialogs** (Выдать/Принять/Передать/В ремонт/Из ремонта/Списать) fails server-side with no legal alternative date the user can enter. This is the primary write path of the entire phase.

**Fix:** make the calendar-day comparison (and the stored instant's day semantics) agree with the office wall clock. Either:

```ts
// lib/movement-schema.ts — compare calendar days in DISPLAY_TZ
const tzToday = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date()) // 'yyyy-mm-dd'
export function isNotFutureDate(iso: string): boolean {
  return iso <= tzToday // both are yyyy-mm-dd — lexicographic == chronological
}
```

or, simpler and fixing the whole family (`isNotFutureDate`, `occurredAtFromDate`, server `createdAt` wall-clock) at once, set the container timezone so server-local == wall clock:

```yaml
# compose.yml
services:
  app:
    environment:
      TZ: Europe/Moscow
```
```dockerfile
# Dockerfile (runner stage)
ENV TZ=Europe/Moscow
```

Add a regression test that pins the boundary behavior (e.g. freeze `Date.now()` at 21:30 UTC and assert a Moscow-today submission passes).

## Warnings

### WR-01: Partially failed batch upload leaves the photo grid stale — stored photos invisible until an unrelated refresh

**File:** `app/(app)/(card)/devices/[id]/photo-grid.tsx:92-118`

**Issue:** `onFilesChosen` uploads files sequentially; `router.refresh()` (line 108) runs only after the **whole** loop succeeds. The server intentionally keeps already-stored files from a mid-batch failure (`app/api/devices/[id]/photos/route.ts:30-33` documents "a mid-batch failure keeps the already-stored ones"). So when the user picks e.g. 5 files with 3 slots free, files 1–3 are committed server-side, file 4 fails with `409 CAP`, the loop aborts, and the grid shows **none** of the 3 new photos — only the generic error. The user's natural retry re-uploads duplicates until the cap, and the counter/grid stay wrong until an unrelated navigation or refresh.

**Fix:** track whether anything was stored and refresh regardless:

```ts
let stored = 0
try {
  for (const file of Array.from(fileList)) {
    const blob = await resizeToJpeg(file)
    const form = new FormData()
    form.append('file', blob, file.name)
    const res = await fetch(`/api/devices/${deviceId}/photos`, { method: 'POST', body: form })
    if (!res.ok) throw new Error(`upload failed: ${res.status}`)
    stored += 1
  }
} catch {
  setUploadError(UPLOAD_ERROR)
} finally {
  setUploading(false)
  if (inputRef.current) inputRef.current.value = ''
  if (stored > 0) router.refresh() // reflect the partial success too
}
```

### WR-02: Employee picker shows the «Нет активных сотрудников» hint for any zero-match search, not only for zero employees

**File:** `app/(app)/devices/movement-dialogs.tsx:124-145` (hint at 134-136); mechanism: `components/ui/combobox.tsx:193-198`

**Issue:** 04-UI-SPEC ties the popover hint «Нет активных сотрудников — добавьте их в разделе „Сотрудники“.» to the **zero active employees** state ("Zero active employees → the empty-state hint inside the popover"). The picker implements it via `ComboboxEmpty`, which Base UI renders whenever **no items render** (`group-data-empty/combobox-content:flex`) — and the picker feeds it the already-filtered `matches`. Typing a query that simply matches nothing (e.g. «Иван» among employees named otherwise) displays the same hint, falsely telling the user there are no active employees and to go create some. `employee-dialog.tsx` avoids this by rendering its own inline zero-match paragraph instead of `ComboboxEmpty`.

**Fix:** split the two states — render the hiring hint only when the source list is empty, and a neutral zero-match fallback otherwise:

```tsx
<ComboboxContent>
  <ComboboxList>…</ComboboxList>
  {employees.length === 0 ? (
    <ComboboxEmpty>Нет активных сотрудников — добавьте их в разделе «Сотрудники».</ComboboxEmpty>
  ) : matches.length === 0 ? (
    <p className="px-3 py-2 text-sm text-ink-secondary">Никого не найдено</p>
  ) : null}
</ComboboxContent>
```

## Info

### IN-01: Invalid calendar dates roll over silently instead of failing validation

**File:** `lib/movement-schema.ts:41-51,56-68`

**Issue:** Only the shape is checked (`^\d{4}-\d{2}-\d{2}$`); `new Date(2026, 1, 30)` rolls over to 2026-03-02, so a crafted direct POST with `occurredAt=2026-02-30` is accepted and stored as **March 2** — the record's day differs from the submitted one. The browser `type="date"` input never submits this, but the schema is the server trust boundary and UI-SPEC defines «Введите корректную дату» for malformed dates.

**Fix:** round-trip check before comparing: construct the Date and verify `constructed.getFullYear()/getMonth()/getDate()` equal the parsed y/m/d; on mismatch reject with the malformed-date copy.

### IN-02: Over-long dispose reason surfaces the «Укажите причину списания» copy although a reason was supplied

**File:** `app/(app)/devices/actions.ts:362-385` with `lib/movement-schema.ts:105-109`

**Issue:** For dispose, every `comment`-path zod issue maps to «Укажите причину списания» — including `max(500)` failures. A user (or crafted POST) submitting a 501-char reason is told to *enter* a reason they did enter. The single-copy-per-field mapping is contract-consistent for the empty case, but the over-long case reads as a contradiction.

**Fix:** for dispose, distinguish `issue.code === 'too_big'` (fall back to the generic «Не удалось списать. Попробуйте ещё раз.») from the required-error, or keep as-is and accept the copy as a known simplification.

### IN-03: `foldRu` helper duplicated between the two dialogs

**File:** `app/(app)/devices/movement-dialogs.tsx:88` and `app/(app)/employees/employee-dialog.tsx:46-48`

**Issue:** Both client dialogs define an identical `foldRu(s) { return s.toLowerCase().replaceAll('ё', 'е') }` for RU-insensitive filtering. Two copies of one normalization rule will drift (it also belongs beside the other RU text helpers).

**Fix:** export it once from `lib/ru.ts` (pure module, safe for client and vitest) and import in both dialogs.

### IN-04: Photo delete responds before the unlinks are known to have run — smoke disk assertions ride a race

**File:** `db/queries/attachments.ts:169-176`; consumed by `app/api/attachments/[attachmentId]/route.ts:109`

**Issue:** `deleteAttachment` fires `unlink(...).catch(() => {})` **without awaiting** before returning; the route responds `200` while the file removal may still be in flight on the threadpool. Production impact is nil (orphan direction is harmless, eventual removal), but `scripts/smoke-custody.mjs:579-595` asserts exact disk counts immediately after the 200 — theoretically flaky.

**Fix:** make the helper async and `await Promise.allSettled([...unlinks])` before returning; the route already awaits the query call.

### IN-05: Malformed multipart body on the upload route maps to a generic 500 instead of a 4xx validation error

**File:** `app/api/devices/[id]/photos/route.ts:70,113-120`

**Issue:** `await request.formData()` sits inside the try whose catch maps known codes to 4xx and everything else to `500 {code:'INTERNAL'}` + `console.error`. A truncated/corrupt multipart body (bad client, proxy hiccup) is a **client** error but is logged as a server failure and reported as INTERNAL.

**Fix:** parse the form in its own try/catch and return `400 {code:'BAD_REQUEST'}` on parse failure, then proceed with the existing pipeline error mapping.

---

_Verified clean (attacked, held): guard-UPDATE transitions and `.changes` rejection with zero side effects; append-only movements; disposed terminality across all 7 paths; return-all atomicity incl. injected-failure rollback; 8-cap inside the insert transaction; strict attachmentId+deviceId IDOR pair on GET/DELETE; `resolveUploadPath` containment against absolute/traversal keys; magic-byte gate before decode; 10MB raw cap; EXIF/GPS/ICC strip + autoOrient via sharp re-encode; requireSession-first on all actions/routes; `Cache-Control: private, immutable` + `nosniff` + hardcoded `image/jpeg`; no debug artifacts; `tsc --noEmit` clean._

_Reviewed: 2026-09-04T05:43:16Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
