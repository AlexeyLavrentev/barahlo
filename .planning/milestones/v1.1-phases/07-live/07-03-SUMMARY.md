---
phase: 07-live
plan: 03
subsystem: employees-search
tags: [uat, playwright-mcp, live-search, race-conditions, acceptance, url-state]

# Dependency graph
requires:
  - phase: 07-live
    plan: 01
    provides: useDebouncedSearchQuery (lib/use-search-param.ts, verbatim G-5-1/G-5-2 reconciliation), employeeSearchPredicate, ?q= through every /employees layer, EmployeeSearchBox island
  - phase: 07-live
    plan: 02
    provides: «Ничего не найдено» empty state + segment-preserving «Сбросить поиск», «Найдено: N» subtitle, green D-10 matrix (URL + homoglyphs + parity + clamp)
provides:
  - Approved UAT record: all 9 browser scenarios pass (SC 1–5 walkthrough, D-03×D-04 token semantics, D-05/D-06/D-08 checks, long-text backstop) — the phase's completion record
  - G-7-1 fix (commit 10c3cee): adopt-branch gated on empty inFlight + re-arm guard — the last input-race defect, found in UAT, fixed, and re-verified in-browser on BOTH lists
  - Phase 7 ready for /gsd:verify-work; FIND-05 acceptance closed; Phase 11 contract (hook + predicate) now race-proven in the browser
affects: [11 (⌘K palette consumes the hook + predicate with races proven in-browser), phase-7 verification]

# Tech tracking
tech-stack:
  added: []   # zero new npm dependencies by the plan itself; playwright ^1.62.1 added to devDependencies by the orchestrator's D-10 UAT session (precondition tooling, not a runtime dep — uncommitted session artifact)
  patterns:
    - "Acceptance plan is run-only: automated gate (vitest/build/lint) + browser UAT — nothing new built"
    - "Adoption discipline: a foreign q can only arrive when nothing of ours is in flight — adopt branch requires inFlight.current.length === 0; re-arm guard returns early when inFlight is non-empty and value.trim() === lastSynced.current.trim() (no duplicate push of already-pushed text)"

key-files:
  created:
    - .planning/phases/07-live/07-03-SUMMARY.md
  modified:
    - lib/use-search-param.ts   # G-7-1 fix, commit 10c3cee (+20 guard lines, reconciliation body untouched)

key-decisions:
  - "G-7-1: the adopt branch now requires inFlight.current.length === 0 — a foreign q can only arrive when nothing of ours is in flight; own-transition echo (stale pre-push q prop while lastSynced was already stamped at push time) can no longer be misread as an external q change. Plus a re-arm guard: inFlight non-empty AND value.trim() === lastSynced.current.trim() → return (no duplicate push). Shared hook = devices get the same fix; device island re-verified in-browser post-fix"
  - "UAT executed by the orchestrator with Playwright MCP per D-10 — the established phase-5 pattern; operator approved the run (resume-signal «approved»)"
  - "Pre-existing React duplicate-key console warning in the EmployeeDialog department combobox (v1.0 dialog code, untouched this phase) logged to .planning/phases/07-live/deferred-items.md for the backlog — not a phase 7 defect"

requirements-completed: [FIND-05]

coverage:
  - id: D1
    description: "Full automated gate green before UAT: whole vitest suite, npm run build, npm run lint (must_haves truth 1)"
    requirement: FIND-05
    verification:
      - kind: unit
        ref: "npx vitest run — 341 tests / 20 files green (incl. tests/employee-search.test.ts 46 + device suites untouched); npm run build exits 0; npm run lint 0 errors / 1 warning (react-hooks/exhaustive-deps lib/use-search-param.ts:124 — flagged dep is the stable Next router, reviewed non-blocking)"
        status: pass
    human_judgment: false
  - id: D2
    description: "UAT SC 1–SC 5 pass on /employees incl. the G-5-1/G-5-2 race class after the hook refactor — SC 1 + SC 5: fast typing / full deletion / trailing space lose no characters and eat no spaces (must_haves truths 2–3, backstop verification)"
    requirement: FIND-05
    verification:
      - kind: automated_ui
        ref: "Playwright MCP browser UAT on the seeded dev DB (40 seed + fixtures «Ёлкин Пётр Сергеевич»/Бухгалтерия id41, «Семён Иванов»/ИТ id42), admin login — scenarios 1, 3, 4, 5, 6, 9; all pass post-fix; operator approved"
        status: pass
    human_judgment: true
    rationale: "D-10 assigns input-race and live-feel scenarios to browser UAT — autotest runners for this class are forbidden by REQUIREMENTS §Out of Scope; verdict requires operator judgment"
  - id: D3
    description: "Device search indistinguishable from before the refactor after the shared-hook G-7-1 fix (SC 5, T-07-07): trailing space survives the echo, «%» literal, Enter commits immediately, no ping-pong"
    requirement: FIND-05
    verification:
      - kind: automated_ui
        ref: "Playwright MCP browser UAT scenarios 2 (SC 5 race re-run on /devices post-fix) and 8 (D-05 q rides along, both lists); device suites byte-untouched and green in the full run"
        status: pass
    human_judgment: true
    rationale: "Behavioral parity is a browser-only judgment per D-10; unit suites stay green untouched but the race class is excluded from autotesting"

# Metrics
duration: 45min
completed: 2026-09-16
status: complete
---

# Phase 7 Plan 3: Live-поиск по сотрудникам (UAT) Summary

**UAT approved: live employee search proven in the browser on both lists — keystroke races, Ё/ё and homoglyph folding, URL state with reset/clamp/back-forward; the last race defect (G-7-1 replace-loop ping-pong) found and fixed during acceptance (`10c3cee`)**

## Performance

- **Duration:** ~45 min active (automated-gate session + orchestrator Playwright-MCP UAT + G-7-1 fix + re-verification; wall clock from 07-02 close ≈ 8.7 h including idle/operator gaps)
- **Started:** 2026-09-15 evening (automated gate session, after 07-02 close); final UAT session 2026-09-16T03:11Z (earliest UAT artifact)
- **Completed:** 2026-09-16T03:44:13Z (operator resume-signal «approved»)
- **Tasks:** 1/1 (checkpoint:human-verify — approved)
- **Files modified:** 1 code file (lib/use-search-param.ts, G-7-1 fix) + planning records

## Verdict Against must_haves

| must_have | Verdict |
|-----------|---------|
| Truth 1: full automated gate green before UAT (vitest suite, build, lint) | **TRUE** — vitest 341/341 (20 files), `npm run build` green, `npm run lint` 0 errors / 1 warning (react-hooks/exhaustive-deps lib/use-search-param.ts:124 — flagged dep is the stable Next router; reviewed, non-blocking) |
| Truth 2: SC 1–SC 5 pass on /employees AND the device list, incl. G-5-1/G-5-2 race class on BOTH lists (D-10, Playwright MCP) | **TRUE** — all 9 scenarios pass post-fix (table below); races clean on both lists |
| Truth 3 (backstop): races lose no characters, eat no spaces on BOTH lists | **TRUE** — confirmed via browser scenarios 1 (employees) and 2 (devices), the UI-SPEC interaction backstop |
| Artifact: 07-03-SUMMARY.md (UAT verdict per scenario + final gate outputs) | **THIS FILE** |
| Key link: lib/use-search-param.ts → UAT scenarios 1–2 on both lists | **PROVEN** — verbatim reconciliation holds under real keystroke races on employees and devices, post-10c3cee |
| Prohibitions: no new deps / no UI test runner; normalize.mjs + norm() UDF byte-identical; reconciliation moved verbatim | **UPHELD** — no RTL/jest introduced (playwright devDep = D-10 UAT tooling per plan precondition); git diff empty on lib/normalize.mjs, db/index.ts, device test files; fix 10c3cee adds adoption-entry guards, does not rewrite the reconciliation body — device island re-verified in-browser |

## UAT Verdict — 9/9 Scenarios PASS

Executed by the orchestrator with Playwright MCP on the seeded dev DB (40 seed + fixtures «Ёлкин Пётр Сергеевич»/Бухгалтерия id41, «Семён Иванов»/ИТ id42), admin login via temporary credential.

| # | Scenario (plan ↔ ROADMAP SC) | Result |
|---|------------------------------|--------|
| 1 | SC 1, G-5-1/G-5-2 (employees): fast-type «Ёлкин Пётр» (247 ms) then fast-delete | PASS — no character loss, no eaten spaces, URL tracks final query, focus held throughout |
| 2 | SC 5 (devices): «aspire 5 » fast type/delete; «100%» literal; Enter commits | PASS — trailing space SURVIVES the echo (input keeps «aspire 5 », URL `?q=aspire+5+`); «%» literal; Enter immediate |
| 3 | SC 2 folding: «елкин» → «Ёлкин»; Latin «Cемён» ↔ Cyrillic «Семён Иванов»; «бух» → 9 Бухгалтерия | PASS — Ё/ё-fold, homoglyph fold both directions, department match |
| 4 | A1 semantics (D-03×D-04): «пётр бух» | PASS — «Ёлкин Пётр Сергеевич · Бухгалтерия»: per-token (name OR department), tokens AND-ed; recommended semantics confirmed in the browser |
| 5 | SC 3 URL state | PASS — new query from page 2 resets to page 1; `?q=а&page=999` clamps to «Страница 2 из 2» with 20 rows; browser Back/Forward restores q AND adopts it into the input; F5 keeps q |
| 6 | SC 4 / D-08 empty state: «ппппп» | PASS — «Ничего не найдено» + Ё/ё hint + «Сбросить поиск» (href `?filter=active` — clears ONLY q, segment preserved); after reset the list returns, input cleared via clean-input adoption |
| 7 | D-06 no waiting UI: mid-transition snapshot | PASS — input never disabled, focus retained, 0 spinners/skeletons, list swaps without flicker |
| 8 | D-05 q rides along | PASS — segment link href `?filter=archive&q=…`, pagination href `?filter=active&q=а&page=2`; Активные→Архив keeps q in URL and input |
| 9 | Long-text backstop: 100-char input | PASS — maxLength cap verified (tail beyond cap rejected), field stays in its recipe (native in-input scroll only), empty-state card wraps without breaking; screenshot verified |

All five ROADMAP Success Criteria (SC 1–5) demonstrated in the browser. Success criteria met: live search finds by name and department with Ё/ё and homoglyph folding; URL state survives back/forward/refresh/sharing with pagination reset and clamp; empty state and reset behave per D-08; no input blocking; device search indistinguishable from before the refactor.

## Automated Gate (final, post-fix)

- `npx vitest run` — **341 tests / 20 files green** (re-run after the G-7-1 fix)
- `npm run build` — **green**
- `npm run lint` — **0 errors / 1 warning** (react-hooks/exhaustive-deps lib/use-search-param.ts:124; the flagged dep is the stable Next router — rule cannot see stability; reviewed non-blocking)

## Task Commits

1. **Task 1: UAT — race scenarios on both lists + SC 1–5 walkthrough** — automated part was run-only (no code change, no commit); browser part approved by the operator. Mid-acceptance fix: **`10c3cee`** (fix — G-7-1, see Deviations)
2. **Plan metadata:** this commit (SUMMARY + STATE + ROADMAP + REQUIREMENTS)

## Files Created/Modified
- `lib/use-search-param.ts` - G-7-1 fix (+20 guard lines): adopt branch requires empty inFlight; re-arm guard against duplicate pushes; reconciliation body untouched
- `.planning/phases/07-live/07-03-SUMMARY.md` - this UAT record (plan artifact)
- `.planning/phases/07-live/deferred-items.md` - out-of-scope observation log (created)

## Decisions Made
- G-7-1 adoption gate (see Deviations) — the foreign-q invariant is now explicit: a foreign q can only arrive when nothing of ours is in flight
- UAT protocol followed D-10 exactly: predicate/URL behavior stays autotested (07-01/07-02), input races browser-checked by the orchestrator with Playwright MCP — the established phase-5 pattern
- Out-of-scope console warning routed to the backlog (deferred-items.md), not patched in this phase

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] G-7-1: endless replace-loop ping-pong (?q=X ↔ bare URL) on the first race run**
- **Found during:** Task 1 UAT, scenario 1 (employees race) — first run exposed hundreds of navigations with the input wiped and re-typed by echo-adoption
- **Issue:** The adopt branch re-ran during the island's OWN router transition window: the stale pre-push q prop arrived while `lastSynced` was already stamped at push time, so the island classified its own old URL as an external q change → `setValue('')` → re-push → ping-pong
- **Fix:** (a) adopt branch requires `inFlight.current.length === 0` — a foreign q can only arrive when nothing of ours is in flight; (b) re-arm guard: `inFlight` non-empty AND `value.trim() === lastSynced.current.trim()` → return (no duplicate push of the already-pushed text). Shared hook — devices get the same protection
- **Files modified:** lib/use-search-param.ts
- **Verification:** full suite re-run post-fix 341/341 green; device island manually re-verified stable in-browser (scenario 2 = SC 5); reset-link and Back/Forward adoption paths (empty inFlight) unaffected — re-verified in scenarios 6 and 5
- **Committed in:** `10c3cee`

---

**Total deviations:** 1 auto-fixed (bug, found by the plan's own acceptance scenario — exactly the race class D-10 reserved for browser UAT)
**Impact on plan:** None on scope; the fix hardens the shared hook's entry conditions without touching frozen surfaces (lib/normalize.mjs, db/index.ts, device test files all byte-untouched per git diff).

## Issues Encountered
- None open. The G-7-1 ping-pong above was found and resolved inside this plan.

## Out-of-Scope Observation (backlog, not a phase 7 defect)
- Pre-existing React duplicate-key console warning in the EmployeeDialog department combobox — v1.0 dialog code, untouched this phase. Logged to `.planning/phases/07-live/deferred-items.md` for the backlog.

## User Setup Required

None - no external service configuration required. (UAT used a temporary admin credential on the seeded dev DB, created and discarded by the orchestrator.)

## Next Phase Readiness
- Phase 7 complete: 3/3 plans executed. Ready for /gsd:verify-work (FIND-05 acceptance closed with this UAT record)
- Phase 11 contract fully locked and now race-proven in the browser: `employeeSearchPredicate` + `useDebouncedSearchQuery` exported, 46-test matrix + 9 UAT scenarios green
- No open gaps from the flagged_assumptions edge-probe: all SC 1–5 scenarios and both UI-SPEC backstops (long-text scenario 9, race scenarios 1–2) verified; no UAT scenario exposed an edge outside these

## Self-Check: PASSED

- .planning/phases/07-live/07-03-SUMMARY.md — FOUND (this file; plan artifact truth)
- Commit 10c3cee (G-7-1 fix, lib/use-search-param.ts) — FOUND (git log)
- Prior commits 71ec255, 71a7490 (07-01), 8449c1a, 207bba5 (07-02) — FOUND (git log)
- must_haves truths 1–3 hold: gate 341/341 + build + lint (1 reviewed warning); SC 1–5 pass on both lists; race backstop confirmed via browser scenarios 1–2 and 9
- Frozen surfaces byte-untouched: git diff empty on lib/normalize.mjs, db/index.ts, tests/device-search.test.ts, tests/homoglyphs-fixture.ts
- No open gaps; no stubs introduced (plan is run-only; the one code change is a committed, re-tested fix)

---
*Phase: 07-live*
*Completed: 2026-09-16*
