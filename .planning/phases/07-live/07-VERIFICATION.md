---
phase: 07-live
verified: 2026-09-16T04:29:05Z
status: human_needed
score: 7/11 must-haves verified
behavior_unverified: 4
overrides_applied: 0
behavior_unverified_items:
  - truth: "SC 1 — live debounce filtering where fast typing and fast deletion lose no characters and eat no spaces (G-5-1/G-5-2 class not reproduced)"
    test: "On /employees, type «Ёлкин Пётр» in one fast stream then delete everything; repeat «aspire 5 » (trailing space) then full delete on /devices"
    expected: "No characters lost, no spaces eaten; final URL carries the complete final query; list matches the final query"
    why_human: "Keystroke-race behavior is browser-only — UI test runners are forbidden by REQUIREMENTS §Out of Scope (D-10); the state transition lives in the hook's echo/adoption effect and no automated test exercises it. Recorded UAT (07-03-SUMMARY.md, scenarios 1–2, post-10c3cee) claims PASS — this is a confirmation sign-off, not a redo."
  - truth: "SC 3 clause — browser Back/Forward and refresh preserve q AND adopt it into the input; «Сбросить поиск» click clears the input without a focus jump"
    test: "Search, press browser Back then Forward; F5; trigger a garbage query and click «Сбросить поиск»"
    expected: "q survives navigation; the input adopts the restored q on Back/Forward; reset click returns the list, clears the input, keeps the segment, no focus jump"
    why_human: "The clean-input adoption transition (lib/use-search-param.ts:80-107) is client-side state machinery; the server-side URL contract is autotested but the adoption transition is not. Recorded UAT scenarios 5–6 claim PASS — confirmation sign-off."
  - truth: "SC 4 clause / D-06 — during the list swap no spinner/skeleton appears, the input never disables, focus and text survive; 100-char query stays inside the field recipe (UI-SPEC long-text backstop)"
    test: "Mid-transition snapshot while typing on /employees; paste a 100-character string; trigger the «Ничего не найдено» state and inspect the card"
    expected: "0 spinners/skeletons, input enabled and focused throughout, field does not overflow, hint wraps inside the empty-state card"
    why_human: "Real-time rendering feel and visual layout are browser-only per D-10 and the UI-SPEC backstop. Recorded UAT scenarios 7 and 9 claim PASS — confirmation sign-off."
  - truth: "SC 5 — device search after the hook refactor is indistinguishable from before (Enter commits immediately, «%» literal, local edits win over URL)"
    test: "On /devices: type «100%» (Enter vs debounce), fast type/delete with a trailing space, type through a segment/filter navigation"
    expected: "«%» matches literally, Enter navigates immediately, trailing space survives, pending local edits are never clobbered by the URL"
    why_human: "Parity-of-feel after a refactor is a browser-only judgment per D-10; the structural half (untouched suites, byte-identical render, verbatim hook body) is verified below. Recorded UAT scenario 2 (post-G-7-1 re-verification) claims PASS — confirmation sign-off."
human_verification:
  - test: "Confirm the 9 recorded UAT scenarios (07-03-SUMMARY.md) — specifically the 4 behavior classes above: races on both lists, Back/Forward/reset adoption, no-blocking feel + long-text backstop, device parity"
    expected: "Operator confirms the recorded 9/9 PASS verdict reflects reality on the seeded dev DB (or re-runs the specific scenario that is in doubt)"
    why_human: "The verifier cannot re-exercise browser races/feel (no UI test runner allowed; no server start permitted in verification); executor-side UAT records are not accepted as proof, so a human sign-off closes the loop"
  - test: "Sign off prohibition 1: playwright ^1.62.1 in devDependencies is UAT tooling per the plan's own precondition, not a new app dependency or UI test runner"
    expected: "Confirmation that the D-10 boundary (no RTL/jest, zero runtime deps) is respected"
    why_human: "Judgment-tier prohibition — the git diff proves only playwright was added to devDependencies, but whether that violates the spirit of REQUIREMENTS §Out of Scope is a human call"
  - test: "Sign off prohibition 3 deviation: G-7-1 fix (10c3cee) added ~20 guard lines to the moved reconciliation body (adopt branch gated on empty inFlight + re-arm guard)"
    expected: "Confirmation that the UAT-mandated race fix is an accepted deviation from «moved verbatim, never rewritten» (07-REVIEW diffed the body against base 34074e9: verbatim except the guard; devices re-verified in-browser post-fix)"
    why_human: "Judgment-tier prohibition — the fix was mandated by the phase's own acceptance loop and is documented, but the verbatim-prohibition is a human-owned constraint (D-07)"
---

# Phase 7: Live-поиск по сотрудникам — Verification Report

**Phase Goal:** Оператор находит сотрудника в справочнике за секунды — живым поиском по имени и отделу, с тем же фолдингом (Ё/ё, гомоглифы), что и у устройств; попутно извлекается общий debounce-хук, который переиспользуют Фаза 11 и поиск устройств.
**Verified:** 2026-09-16T04:29:05Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Merged from ROADMAP SC 1–5 (contract) + PLAN 07-01/07-02/07-03 frontmatter must_haves. Score counts ✓ VERIFIED only; ⚠️ items are present+wired but their asserted behavior class is browser-only by the project's own D-10 protocol (UI test runners forbidden by REQUIREMENTS §Out of Scope) and was exercised only in the executor-side UAT.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC 1: live debounce filter, no reload; fast typing/deletion lose no characters (G-5-1/G-5-2) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Hook present, substantive, wired (lib/use-search-param.ts:28-167 — 300 ms debounce → `router.replace` in `startTransition`, `commitNow` on Enter); both islands consume it. Race class not autotestable (D-10); recorded UAT scenarios 1–2 PASS post-10c3cee — needs human sign-off |
| 2 | SC 2: match by name AND department; «елкин» finds «Ёлкин»; homoglyphs С↔C on the same pipeline as devices | ✓ VERIFIED | Own full-suite run 341/341: tests/employee-search.test.ts:53 («елкин»→Ёлкин), :77 (department substring), homoglyph matrix 11 pairs × both directions :189-215 through the public `listEmployees` path; shared pipeline proven structurally — `normalizeNumber` + `norm()` UDF byte-untouched (git status empty on lib/normalize.mjs, db/index.ts) |
| 3 | SC 3: q lives in URL; back/forward/refresh/share preserve; new query resets pagination; links carry full params; ?page=999 clamps | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Server clauses all autotested (own run): builder semantics :125, :163-173 (q rides, page omitted on fresh push → reset), clamp test :324, parity walk :299, `buildEmployeesQuery` used by segments/pagination/reset (8 call sites in page.tsx, 0 `URLSearchParams`). Browser adoption clause (Back/Forward into input, reset clears input) — UAT scenarios 5–6 PASS recorded; needs human sign-off |
| 4 | SC 4 / D-08: garbage q shows «Ничего не найдено» + Ё/ё hint + «Сбросить поиск» (segment preserved), wins over both phase-2 states; nothing blocks typing | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Markup, precedence and href construction verified in code: page.tsx:113-133 — q-first ternary, copy exact, phase-2 headings byte-exact (:137,:146), reset href `buildEmployeesQuery({ filter, q: '' }, 1)` → `?filter=active`; no disabled/spinner anywhere in the island. Display + feel are browser class; UAT scenarios 6, 7, 9 PASS recorded; needs human sign-off |
| 5 | SC 5: device search behaves as before after the hook refactor | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Structural parity VERIFIED: tests/device-search.test.ts 26/26 green with the file byte-untouched (git status empty); DeviceSearchBox render byte-identical to source recipe (read); 07-REVIEW diffed the moved body against base 34074e9 — verbatim except the G-7-1 guard. Feel class browser-only; UAT scenario 2 PASS post-fix; needs human sign-off |
| 6 | Predicate semantics: every token ANDed, each token matches name OR department (D-03/D-04) | ✓ VERIFIED | db/queries/employees.ts:58-72 (`and(...tokens.map(or(name, dept)))`); tests :67 («пётр бух»), :274 («анна ит» twin discriminator) green in own run |
| 7 | Ё/ё-fold on BOTH sides of every LIKE; fold lives in the predicate, normalize/UDF untouched (D-01) | ✓ VERIFIED | JS fold `normalizeNumber(raw).replaceAll('Ё','E')` (:59) + SQL `replace(replace(norm(col),'Ё','E'),'ё','e')` on both arms (:67-68); LIKE patterns bound as parameters with `escape '\\'`; lib/normalize.mjs and db/index.ts git-clean. SUMMARY's fold-target correction (Latin E, not Cyrillic Е) confirmed in code and covered by the SC 2 test |
| 8 | listEmployees: count and rows share ONE where + innerJoin departments; clamp into [1, pages]; ruSortKey + id sort, no ranking (D-04) | ✓ VERIFIED | :88-117 — single `where` composed once, `innerJoin` on both count and rows, clamp :102, `orderBy(ruSortKey, asc(id))` :113; tests :299 (parity walk), :324 (clamp), :352 (sort stability) green in own run |
| 9 | Hostile URLs degrade to defaults, never a 500 (T-07-04) | ✓ VERIFIED | parseEmployeesSearchParams :27-34 (enum fallback, trim, 100-char cap); page :38-39 integer guard; tests :104, :144, :154 green in own run; requireSession() remains the first page action (:29) |
| 10 | D-08 surface: q-gated subtitle «Найдено: {pluralEmployees(total)}»; all links through the ONE builder | ✓ VERIFIED | page.tsx:59-61 (q-only trigger, q-empty branch byte-exact), `pluralEmployees` imported and used (:6,:60); segments :78,:89, pagination :187,:200, reset :128 — all `buildEmployeesQuery`; 0 `URLSearchParams` in the page |
| 11 | 07-03: full automated gate green before UAT | ✓ VERIFIED | Re-run by verifier at HEAD: `npx vitest run` 341/341 (20 files), `npm run build` green (/employees route compiled), `npm run lint` 0 errors. Note: repo-wide lint shows 6 warnings, of which exactly 1 is in a phase-7 file (lib/use-search-param.ts:144 exhaustive-deps — the reviewed IN-01, line shifted by the G-7-1 fix); the other 5 are pre-existing in files this phase did not touch (app/(app)/page.tsx, tests/dashboard-queries.test.ts, tests/devices-queries.test.ts) — the SUMMARY's «1 warning» claim is accurate for phase files only |

**Score:** 7/11 truths verified (4 present, behavior-unverified — browser-only class per D-10, covered by the recorded executor UAT, routed to human sign-off)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/use-search-param.ts` | useDebouncedSearchQuery({q, target, buildQuery}) → {value, setValue, commitNow} | ✓ VERIFIED | 167 lines, substantive; export proven at :28 (`export function useDebouncedSearchQuery<T extends object>`). The tool's verify.artifacts reported "Missing export" — false negative: the tool's regex misses generic/line-wrapped signatures; grep confirms the export verbatim |
| `app/(app)/employees/query-params.ts` | parseEmployeesSearchParams + buildEmployeesQuery + EmployeeFilters | ✓ VERIFIED | 46 lines, pure module, all three exports grep-proven (:16,:27,:40) |
| `db/queries/employees.ts` | exported employeeSearchPredicate + listEmployees optional q with count/rows parity | ✓ VERIFIED | Export at :58, 2 occurrences (definition + use in listEmployees :88) |
| `app/(app)/employees/search-box.tsx` | EmployeeSearchBox — the page's only client island | ✓ VERIFIED | 'use client', flat props, imports hook + builder itself, no `<form>`, maxLength 100, exact UI-SPEC classes |
| `app/(app)/employees/page.tsx` | third empty state, subtitle variant, q-aware links | ✓ VERIFIED | Read in full — precedence ternary, reset link, subtitle variant, island mount :105 |
| `tests/employee-search.test.ts` | URL matrix + full predicate matrix | ✓ VERIFIED | 46 tests green in own full-suite run; homoglyph fixture referenced, not extended (git-clean) |
| `.planning/phases/07-live/07-03-SUMMARY.md` | UAT verdict per scenario + final gate outputs (plan 03 artifact) | ✓ VERIFIED | Exists; 9/9 scenario table + gate outputs recorded |

All 5 key links from 07-01 and both key links from 07-02: verified by `gsd-tools verify.key-links` (5/5 "Pattern found") and corroborated by direct code read (imports at devices/search-box.tsx:4, employees/search-box.tsx:4-5, page.tsx:5-10).

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| app/(app)/employees/page.tsx | rows, total, pages | `listEmployees({filter, page, pageSize, q})` — real drizzle queries with innerJoin against SQLite | Yes (SELECT with composed where; parameterized LIKE) | ✓ FLOWING |
| app/(app)/employees/search-box.tsx | value | hook state seeded from server-parsed `q` prop; pushes via `buildEmployeesQuery` → router.replace | Yes (URL is the store) | ✓ FLOWING |
| page.tsx → island props | q, filter | `parseEmployeesSearchParams(sp)` output | Yes (validated server echo) | ✓ FLOWING (no hollow props) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full suite (incl. 46 employee-search tests + 26 untouched device-search tests) | `npx vitest run` | 341/341 passed, 20 files, 2.2s | ✓ PASS |
| Production build (/employees route compiled) | `npm run build` | exit 0, route table emitted | ✓ PASS |
| Lint gate | `npm run lint` | 0 errors; 6 warnings repo-wide, 1 in phase files (documented IN-01) | ✓ PASS |
| Frozen surfaces byte-untouched | `git status --porcelain lib/normalize.mjs db/index.ts tests/device-search.test.ts tests/homoglyphs-fixture.ts "app/(app)/employees/loading.tsx" "app/(app)/employees/error.tsx"` | empty | ✓ PASS |
| Phase commits exist | `git log -1` × 5 | 71ec255, 71a7490, 8449c1a, 207bba5, 10c3cee all found; working tree has no uncommitted source changes (only planning config + playwright devDep, recorded) | ✓ PASS |
| Prohibition: no new npm deps / no UI test runner | `git diff package.json` | Only `playwright: ^1.62.1` added to devDependencies — the UAT tooling the plan's own precondition requires; no RTL/jest; zero runtime deps | ✓ PASS (judgment flag recorded) |
| Race/feel behaviors (SC 1, SC 3 adoption, SC 4 feel, SC 5 feel) | browser only — not runnable by verifier | Recorded UAT 9/9 PASS (executor-side) | ? SKIP → human sign-off |

Probe execution: SKIPPED — no probes declared in any 07-PLAN and no `scripts/*/tests/probe-*.sh` applies to this feature phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| FIND-05 | 07-01, 07-02, 07-03 (all three declare `[FIND-05]`) | Оператор находит сотрудника live-поиском по имени или отделу в справочнике — с фолдом Ё/ё и гомоглифов, как у устройств | ✓ SATISFIED (browser feel class pending human sign-off) | Truths 2, 6, 7, 8, 9, 10 automated-verified; REQUIREMENTS.md:12 marks FIND-05 `[x]`, traceability maps FIND-05 → Phase 7 Complete. No orphaned requirements: the traceability table maps only FIND-05 to Phase 7 and all plans claim it |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| lib/use-search-param.ts | 144 | react-hooks/exhaustive-deps warning (router dep) | ℹ️ Info | Documented IN-01 (rule cannot see Next router stability); recorded in WINDOWS.md and 07-REVIEW.md, windows_enforce: false |
| lib/use-search-param.ts | 71-164 | WR-01: push sites lack in-flight/no-op dedup (duplicate navigations; reset click can be reverted by a queued duplicate under server latency > debounce; double-Enter stale inFlight entry) | ⚠️ Warning (inherited, not a phase regression) | Inherited verbatim from v1.0 DeviceSearchBox (exists on /devices too); fixing it would change the reconciliation whose byte-parity SC 5/D-07 protects. Deferred with a concrete ~10-line patch in deferred-items.md, decision point flagged "before Phase 11 (⌘K inherits the hook)". Not a must-have failure: UAT 9/9 passed; SC 1 asserts the G-5-1/G-5-2 character-loss class, a different failure family |
| (app)/employees/employee-dialog.tsx | — | React duplicate-key console warning in department combobox | ℹ️ Info | Pre-existing v1.0 code, untouched this phase; console-only; logged to deferred-items.md backlog |

Debt-marker gate: no TBD/FIXME/XXX/TODO markers in any phase-modified file (the only grep hits are legitimate HTML `placeholder` attributes). No stubs: no empty returns, no placeholder JSX, no console-only handlers in any artifact.

### Human Verification Required

The 4 behavior-unverified truths share one root cause: the project's D-10 protocol (REQUIREMENTS §Out of Scope forbids UI test runners) assigns the keystroke-race/adoption/feel class to browser UAT. That UAT was executed in-phase by the orchestrator (Playwright MCP, seeded dev DB) and approved by the operator — 9/9 scenarios recorded PASS in 07-03-SUMMARY.md — but an executor-side record is not verifier proof. What remains is a human sign-off (or re-run of any scenario in doubt):

1. **Race scenarios on both lists** — fast type + fast delete «Ёлкин Пётр» on /employees and «aspire 5 » / «100%» on /devices; no character loss, no eaten spaces, URL tracks the final query.
2. **Adoption paths** — browser Back/Forward restores q and adopts it into the input; F5 preserves; «Сбросить поиск» clears the input without a focus jump and keeps the segment.
3. **No-blocking feel + long-text backstop** — mid-transition: no spinner/skeleton/disabled input, focus retained; 100-char input stays in the field; hint wraps inside the card.
4. **Device parity** — Enter commits immediately, «%» literal, trailing space survives, local edits outrank the URL.
5. **Prohibition sign-offs** — playwright devDep as UAT-only tooling; G-7-1 guard (+20 lines, commit 10c3cee) as the accepted deviation from the verbatim-move prohibition.

### Gaps Summary

No gaps. No truth FAILED, no artifact missing/stub, no key link unwired, no blocker anti-pattern. The single review warning (WR-01) is inherited v1.0 behavior whose fix is deliberately blocked by this phase's own frozen-behavior requirement (SC 5/D-07) and is logged with a concrete patch in `.planning/phases/07-live/deferred-items.md` — it does not contradict any phase must-have (the verbatim-preservation must-have was upheld by NOT fixing it). The goal — live employee search with the device-identical folding pipeline plus the extracted shared debounce hook — is achieved in code and by the automated gate; the residual human_needed status exists solely to close the browser-only behavior class with a human signature on top of the recorded 9/9 UAT.

---

_Verified: 2026-09-16T04:29:05Z_
_Verifier: Claude (gsd-verifier)_
