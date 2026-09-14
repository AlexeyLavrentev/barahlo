---
phase: 02
fixed_at: 2026-09-01T18:53:51Z
review_path: .planning/phases/02-employees/02-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-09-01T18:53:51Z
**Source review:** .planning/phases/02-employees/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (Warning tier only; no Criticals exist, Info untouched per scope)
- Fixed: 3
- Skipped: 0

**Final verification:** `npx vitest run` 65/65 pass · `npm run build` exit 0 (`/_not-found` route now in the build table) · `node scripts/smoke-employees.mjs` exit 0 (incl. the new Russian-404 assertion)

## Fixed Issues

### WR-01: Dialog error state is stale after close/reopen

**Files modified:** `app/(app)/employees/employee-dialog.tsx`, `app/(app)/employees/archive-confirm-dialog.tsx`
**Commit:** 294878c
**Status:** fixed — requires human verification (state-reset semantics; verified structurally + via build/tests, not by interactive dialog exercise)
**Applied fix:** Moved `useActionState` (+ the combobox `inputValue` state and all derived option-list values) out of the long-lived dialog wrappers into new inner per-session components (`EmployeeDialogForm`, `ArchiveConfirmForm`) rendered inside `DialogContent`. Root-caused against the installed Base UI 1.7: `DialogPortal` returns `null` once `mounted` flips false, and `mounted` stays true through the 200ms exit transition (`useOpenChangeComplete` → `forceUnmount`) — so children of `DialogContent` unmount after every close animation and remount fresh on open. Deliberately did NOT use the review's literal `{open ? <Form/> : null}` conditional: that would unmount the form instantly on close and leave an empty panel during the exit animation, regressing the UI-SPEC motion contract («enter and exit along the same path»). `onOpenChange`'s inputValue reset became unnecessary (fresh mount initializes from `employee?.department ?? ''`). ok-close effect now calls a `useCallback`-stable `onDone` so the effect still fires per action response only. All UI-SPEC copy, roles, and hidden-input behavior preserved verbatim.

### WR-02: `notFound()` falls through to Next's default English 404

**Files modified:** `app/not-found.tsx` (new), `scripts/smoke-employees.mjs`
**Commit:** 34bc64f
**Status:** fixed
**Applied fix:** Added the root `app/not-found.tsx` boundary (Next 16.3.3 file convention verified against `node_modules/next/dist/docs/` — also catches unmatched URLs app-wide). Mirrors the login screen's established quiet card: `min-h-svh` centered on `bg-page`, `rounded-2xl bg-white p-8 shadow-sm ring-1 ring-hairline`, Heading role 20/600 «Страница не найдена», body «Проверьте адрес или вернитесь к списку.» (Label role, secondary ink), metadata title «Страница не найдена». One deliberate adaptation of the reviewer's snippet: the back link «← Сотрудники» uses the card page's secondary style (`text-sm text-ink-secondary hover:text-ink`), NOT `text-accent` — UI-SPEC reserves the accent for CTA/focus/combobox only («never accent text on gray»). Extended the smoke 404 matrix to assert «Страница не найдена» is present in both 404 bodies (garbage + unknown ids).

### WR-03: `components.json` records the nova preset despite UI-SPEC `preset: none`

**Files modified:** `.planning/phases/02-employees/02-03-SUMMARY.md` (Note appended; `components.json` left unchanged)
**Commit:** 8fea0cc
**Status:** fixed via the review's option (a) — accepted deviation recorded; option (b) was attempted first and empirically rejected
**Applied fix:** Set `"style": "base"` and dropped `menuColor`/`menuAccent`, then ran the prescribed verification: `npx shadcn@4.19.1 add badge --dry-run` failed — the preset-free style does not exist in the v4 registry (`https://ui.shadcn.com/r/styles/base/badge.json` → 404; probing confirmed `base`, `base-default`, `base-neutral` all 404 while `base-nova` → 200; the registry's own styles index lists only legacy Radix-era `new-york`/`default`). The CLI config shape cannot express "Base UI, preset none", so per the do-not-fight-the-tool fallback the components.json change was rolled back with `git checkout --` (verified clean) and the accepted deviation documented as a Note in 02-03-SUMMARY.md: tokens remain dictated by `app/globals.css` (`@theme`), nova flavor was hand-overridden in phase-02 generated files, and future `shadcn add` output needs a post-generation UI-SPEC check. `app/globals.css` confirmed untouched throughout.

## Skipped Issues

None — all in-scope findings were fixed.

## Verification Log

- `npx tsc --noEmit` (worktree): only `app/layout.tsx:18 LayoutProps` — a Next-generated type from `.next/types/routes.d.ts`, absent in a fresh worktree; environmental, not introduced (file untouched; the final build regenerates and validates it).
- `npx vitest run`: 65/65 pass (9 files).
- `npm run build`: exit 0; route table now includes `/_not-found` (Static).
- `node scripts/smoke-employees.mjs`: exit 0 — perimeter 307, list render, card render, 404 matrix with Russian page, archive/unarchive badge cycle.

---

_Fixed: 2026-09-01T18:53:51Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
