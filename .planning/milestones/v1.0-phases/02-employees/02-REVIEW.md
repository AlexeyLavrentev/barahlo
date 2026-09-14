---
phase: 02-employees
reviewed: 2026-09-01T18:36:31Z
depth: standard
files_reviewed: 29
files_reviewed_list:
  - components.json
  - components/ui/button.tsx
  - components/ui/input.tsx
  - components/ui/label.tsx
  - components/ui/badge.tsx
  - components/ui/dialog.tsx
  - components/ui/combobox.tsx
  - components/ui/input-group.tsx
  - components/ui/textarea.tsx
  - lib/utils.ts
  - lib/ru.ts
  - app/layout.tsx
  - app/globals.css
  - app/login/page.tsx
  - app/login/login-form.tsx
  - app/(app)/layout.tsx
  - app/(app)/page.tsx
  - app/(app)/employees/page.tsx
  - app/(app)/employees/actions.ts
  - app/(app)/employees/employee-dialog.tsx
  - app/(app)/employees/archive-confirm-dialog.tsx
  - app/(app)/employees/loading.tsx
  - app/(app)/employees/error.tsx
  - app/(app)/(card)/employees/[id]/page.tsx
  - app/(app)/(card)/employees/[id]/error.tsx
  - db/queries/employees.ts
  - scripts/smoke-employees.mjs
  - tests/employees-queries.test.ts
  - tests/ru.test.ts
findings:
  critical: 0
  warning: 3
  info: 9
  total: 12
status: issues
---

# Phase 02 (Employees): Code Review Report

**Reviewed:** 2026-09-01T18:36:31Z
**Depth:** standard
**Files Reviewed:** 29 (+ supporting context: `db/schema.ts`, `lib/auth.ts`, `lib/session.ts`, `app/(app)/actions.ts`, `app/login/actions.ts` diff)
**Status:** issues

## Summary

Scope note: the workflow listed `app/(app)/employees/[id]/page.tsx`, but the card actually lives at `app/(app)/(card)/employees/[id]/page.tsx` (route group chosen to keep the list `loading.tsx` from swallowing 404s). Both were treated as one route; no file exists at the listed path.

The security posture is solid. Every Server Action (`createEmployeeAction`, `updateEmployeeAction`, `setEmployeeArchivedAction`, and the inline `unarchiveEmployee`) calls `requireSession()` as its first statement; every page under `(app)` re-checks via layout + page. All inputs pass through whitelisting zod schemas — `searchParams` filter is enum-mapped, `page` is number-clamped, the card `id` passes a positive-int check before any DB access (verified by the smoke 404 matrix). All SQL goes through parameterized Drizzle (the RU sort key interpolates only a column reference); no `DELETE` path against `employees` exists anywhere (EMP-03 honored, enforced by a module-level test). No `dangerouslySetInnerHTML`, no `eval`, no hardcoded secrets, no debug artifacts. Employee names render as escaped React text nodes only. `npx tsc --noEmit` is clean and the phase suites pass (21/21).

The findings below are correctness/UX robustness (one real stale-state bug in both dialogs), UI-contract deviations against the approved 02-UI-SPEC (English 404 fallback, nova preset in `components.json`), and motion/copy details.

## Warnings

### WR-01: Dialog error state is stale after close/reopen — reopening shows errors from the previous attempt

**File:** `app/(app)/employees/employee-dialog.tsx:59-73,121-125,177-181` and `app/(app)/employees/archive-confirm-dialog.tsx:31-41,57-61`
**Issue:** `useActionState` state lives in the dialog wrapper component, which stays mounted when the Base UI popup unmounts on close. After a failed submit (inline field errors or the `role=alert` mutation error), closing via «Не сохранять»/«Не архивировать»/ESC and reopening renders the old error text and `aria-invalid` immediately under untouched fields — the form presents a failure the user has not caused in this dialog session. `onOpenChange` resets only `inputValue`, not the action state. Affects all three dialog surfaces (create, edit, archive confirm).
**Fix:** Reset state per dialog session by moving the form + `useActionState` into an inner component mounted only while open, so each open starts from a clean state:

```tsx
// EmployeeDialog: keep open state here, render the form only while open
{open ? <EmployeeDialogForm key="form" onDone={() => setOpen(false)} … /> : null}

// EmployeeDialogForm owns useActionState + the <form>; mounting fresh each open
```

(A `key={openCount}` variant on the existing subtree does not work alone — the hook state sits above the form and survives remounts; the hook itself must move inside the per-open component.)

### WR-02: `notFound()` falls through to Next's default English 404 page (UI-01 violation on a reachable surface)

**File:** `app/(app)/(card)/employees/[id]/page.tsx:38,40`
**Issue:** Garbage (`/employees/abc`) and unknown (`/employees/99999`) ids correctly reach `notFound()` — but no `app/not-found.tsx` exists anywhere, so the framework's default English "This page could not be found." is rendered. UI-01 («Интерфейс полностью на русском») is a locked requirement, and this surface is exercised by the phase's own smoke 404 matrix, so it is a real user-facing screen, not a theoretical one.
**Fix:** Add a minimal root boundary in the design language:

```tsx
// app/not-found.tsx
import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-page px-6">
      <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-hairline">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Страница не найдена</h1>
        <p className="mt-1 text-sm text-ink-secondary">Проверьте адрес или вернитесь к списку.</p>
        <Link href="/employees" className="mt-4 inline-block text-sm text-accent hover:underline">
          ← Сотрудники
        </Link>
      </div>
    </main>
  )
}
```

### WR-03: `components.json` records the nova preset (`"style": "base-nova"`) despite UI-SPEC `preset: none`

**File:** `components.json:3` (also `menuColor`/`menuAccent` keys at lines 22-23)
**Issue:** The approved UI-SPEC frontmatter locks `preset: none`, and 02-RESEARCH Pitfall 5 explicitly warns "`-d/--defaults` applies preset **nova** … do NOT use -d (pulls preset 'nova'; UI-SPEC wants none)". The recorded style and the extra preset keys show nova nonetheless. The executor hand-overrode the tokens in `globals.css` and the generated files, so no visual bug is live today — but every future `shadcn add` in phases 3-6 will keep pulling nova-flavored components that must be re-fought, and the deviation is not recorded in the plan SUMMARY as the research required.
**Fix:** Either (a) record this as an accepted deviation in the phase SUMMARY/DECISIONS, or (b) set `"style": "base"` and drop `menuColor`/`menuAccent` from `components.json`, then re-run `npx shadcn@latest add --dry-run` on one component to confirm the generator no longer emits preset tokens.

## Info

### IN-01: English sr-only label «Close» on the dialog close button

**File:** `components/ui/dialog.tsx:78` (and the unused «Close» text button at `components/ui/dialog.tsx:117-119`)
**Issue:** Every rendered dialog's X close button carries `<span className="sr-only">Close</span>` — invisible visually, but announced as English by screen readers, against UI-01. The file was already customized for this phase (scrim, title, footer), so the label is an in-scope modification gap rather than untouched boilerplate.
**Fix:** Change the sr-only text to «Закрыть».

### IN-02: Fractional `?page=` values are not integer-normalized

**File:** `app/(app)/employees/page.tsx:38` with `db/queries/employees.ts:54,67`
**Issue:** `Math.max(1, Number(sp.page) || 1)` accepts `1.5`: clamping keeps `1.5`, the label renders «Страница 1.5 из N», and `offset((1.5-1)*20)` silently shifts the window. Crafted-URL-only (single authorized user), so cosmetic — but the validator that exists to normalize this field misses the fractional case.
**Fix:** `const raw = Number(sp.page); const page = Number.isInteger(raw) && raw > 0 ? raw : 1` (or `Math.trunc`).

### IN-03: Shell nav «Сотрудники» never renders its active state

**File:** `app/(app)/layout.tsx:22-25`
**Issue:** UI-SPEC App shell: «Center-left nav: «Сотрудники» (14/400; active = ink, inactive = `#6E6E73`)». The link is hardcoded `text-ink-secondary`, so on `/employees` and every card page the sole nav item renders in the inactive color forever.
**Fix:** Compute active state from the pathname. In the server layout this needs a small client island (`usePathname()`) or `useRender`-free conditional via a child server component reading its own segment; simplest is a tiny `"use client"` nav component.

### IN-04: Login wordmark is 20/600, UI-SPEC assigns Display 28/600

**File:** `app/login/page.tsx:15-17`
**Issue:** The typography table assigns «Учёт техники» (login wordmark) to the Display role: `text-[28px] tracking-[-0.02em]`, 600. The normalized page keeps the pre-phase `text-xl`. The card page correctly implements Display for the employee name, so the role exists and works — only the login screen misses it.
**Fix:** `className="text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] text-ink"`.

### IN-05: Motion contract gaps — segmented pill does not slide; list rows lack press feedback

**File:** `app/(app)/employees/page.tsx:62-88` (segmented control) and `app/(app)/employees/page.tsx:120-133` (list rows)
**Issue:** UI-SPEC Visual Details: «Segmented control: active white pill slides 200ms ease-out» and «every button/row gets `active:scale-[0.97]`». The segmented control is a static two-link swap (color transition only), and list-row links have hover feedback but no `active:` press response. Buttons and the logout control do implement press feedback correctly.
**Fix:** Acceptable to record as a conscious simplification, or implement the pill as an absolutely positioned `span` translated by filter state (needs a client component), and add `active:scale-[0.98]`-style feedback to rows (scale on full-width rows: prefer `active:bg-black/[0.04]` if scale looks wrong — but then note the deviation).

### IN-06: Combobox selected checkmark renders in ink, not the reserved accent

**File:** `app/(app)/employees/employee-dialog.tsx:161-165` using `components/ui/combobox.tsx:147-159`
**Issue:** UI-SPEC accent reserve #3: «Combobox: checkmark and highlight of the selected department row» in `#0071E3`. The `CheckIcon` inherits the item text color: ink (#1D1D1F) normally, white under `data-highlighted`. No accent ever reaches the checkmark.
**Fix:** Add a class targeting the indicator in `ComboboxItem` usage or in `combobox.tsx`: `data-selected:**:text-accent` on the item (keeping white under highlight), e.g. extend the item className with `data-[selected]:[&_[data-slot=combobox-item-indicator]]:text-accent`.

### IN-07: `shadcn` CLI installed as a runtime dependency

**File:** `package.json` (dependencies)
**Issue:** `shadcn` is a code-generator CLI; it landed in `dependencies`, so it ships into the production `npm install --omit=dev` image for zero benefit.
**Fix:** `npm pkg set dependencies.shadcn= && npm pkg set devDependencies.shadcn="^4.19.1"` (move to devDependencies; keep `@base-ui/react` and friends in dependencies — those are runtime).

### IN-08: Dead generated components `badge.tsx` and `textarea.tsx`

**File:** `components/ui/badge.tsx`, `components/ui/textarea.tsx`
**Issue:** Installed by the phase's `shadcn add` batch, imported nowhere (the «В архиве» badge is a hand-styled span per the UI-SPEC, and `InputGroupTextarea` is unused too). Dead code today; additionally `badge.tsx`'s default variant is solid accent (`bg-primary`) — an easy future misuse of the reserved accent if someone reaches for it in phase 3+.
**Fix:** Either delete both files until needed, or leave with a one-line comment in the phase SUMMARY noting they are pre-installed but unused; never use `Badge` default variant for non-accent pills.

### IN-09: `<Input>` default shrinks to 14px on desktop — a trap for phases 3-6

**File:** `components/ui/input.tsx:12` (`… text-base … md:text-sm`)
**Issue:** The generated default drops inputs to `text-sm` at `md:`. Both current usages (name field, combobox trigger) pass `text-base md:text-base`, so the 16px contract holds today — but the next bare `<Input>` (device form, phase 3) will silently violate «text inputs 16px prevents iOS input zoom».
**Fix:** Change the generated default to `md:text-base` in `input.tsx` (this file is already project-customized), removing the need for per-usage overrides.

## Verification performed

- `npx tsc --noEmit` — clean.
- `npx vitest run tests/employees-queries.test.ts tests/ru.test.ts` — 21/21 pass.
- Greps: no `font-medium` or half-step spacing classes (`*-1.5`/`*-2.5`) in `app/` (phase-authored code); no `prefers-color-scheme` block; no English visible labels; no `dangerouslySetInnerHTML`/`eval`; no hardcoded secrets; no debug artifacts; no `DELETE`/`.delete(` on `employees`.
- API cross-checks against installed packages: `filter?: null | …` confirmed valid on `@base-ui/react` `Combobox.Root` (disables internal filtering as commented); `SessionPayload {userId}` / cookie name `session` / 30-day TTL in the smoke script match `lib/session.ts`; `isActive` is an integer column so the `=== 0 / === 1` comparisons are correct.

---

_Reviewed: 2026-09-01T18:36:31Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
