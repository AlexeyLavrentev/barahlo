---
phase: 05-search-filters
plan: 06
subsystem: ui
tags: [react, controlled-input, debounce, reconciliation, router-replace, client-island]

# Dependency graph
requires:
  - phase: 05-search-filters (plans 01–05)
    provides: DeviceSearchBox island (D-01/D-02), query-params.ts server trim/parse, CR-01 reconciliation (be80413), 5/6 green UAT
provides:
  - Search-box reconciliation with local priority: fast typing/deleting never loses keystrokes or rolls back (G-5-1)
  - Own-echo absorption via inFlight ref (exact + trimmed match) — trimmed-echo normalization and no nav loop preserved
  - Push-time lastSynced stamping (debounce callback + commitNow) — no adopt window between arm and echo
affects: [uat retest (Test 1), any future island with URL reconciliation]

# Tech tracking
tech-stack:
  added: [] # zero new packages (T-05-SC honored)
  patterns:
    - "Reconciliation with local priority: URL adopted only on clean input (value === lastSynced); dirty input always re-arms the debounce"
    - "Own-echo classification via inFlight ref of pushed values, shift-capped at 4"

key-files:
  created:
    - .planning/phases/05-search-filters/05-06-SUMMARY.md
    - .planning/phases/05-search-filters/deferred-items.md
  modified:
    - app/(app)/devices/search-box.tsx

key-decisions:
  - "G-5-1 fix shape: local edits win over URL — adopt q only when value === lastSynced.current && q !== lastSynced.current; dirty input never adopts, re-arms instead (UAT missing items 1–2)"
  - "lastSynced is stamped at PUSH time (inside the setTimeout callback and commitNow), not at debounce-arm time — the arm-time stamp was the confirmed root cause (debug session .planning/debug/search-input-keystroke-loss.md)"
  - "inFlight ref (string[], cap 4, shift oldest) classifies the island's own echoes — exact or trimmed match (server trims q) — absorbed silently so text typed during flight survives; commitNow registers the same way (UAT missing item 3)"

patterns-established:
  - "Island URL-reconciliation invariant: the effect never returns with value !== q and no timer armed — every early return leaves value === q or falls through to re-arm"
  - "Push-time anchoring: sync anchors are stamped when the network request leaves, not when its timer is set"

requirements-completed: [FIND-01]

coverage:
  - id: D1
    description: "Search-box reconciliation with local priority — fast typing/deleting loses no keystrokes, own echoes absorbed, trim normalization and reset/Back/Forward adoption preserved"
    requirement: FIND-01
    verification:
      - kind: unit
        ref: "npx vitest run — 278 tests / 18 files green (final run; pre-existing flaky attachments test logged to deferred-items.md)"
        status: pass
      - kind: other
        ref: "npm run lint — 0 errors; structural gates: clean-check value === lastSynced.current, trim-match q === p.trim(), inFlight ref used in effect + commitNow (grep ≥4) — STRUCTURE-OK"
        status: pass
    human_judgment: false
  - id: D2
    description: "Manual retest of UAT Test 1 (fast input/deletion, mid-flight typing, Enter echo) + Test 2 regression on dev server"
    verification: []
    human_judgment: true
    rationale: "vitest cannot render client islands (no component harness in repo — node-env DB-only); the keystroke-loss behavior is only observable in a real browser against the dev server. Owner runs «Manual retest (UAT Test 1)» below at end-of-phase verification."

# Metrics
duration: 12min
completed: 2026-09-04
status: complete
---

# Phase 5 Plan 06: G-5-1 Search-Input Keystroke Loss Summary

**Search-box reconciliation inverted to local-priority: clean-input-only URL adoption, push-time lastSynced stamping, and inFlight own-echo absorption — fast typing/deleting no longer loses keystrokes or rolls back (G-5-1), CR-01 behaviors preserved.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-04T22:29:47Z
- **Completed:** 2026-09-04T22:41:30Z
- **Tasks:** 2
- **Files modified:** 1 production file (+2 planning docs)

## Accomplishments

- Gap G-5-1 (major, the only UAT failure of phase 5) closed in code: the confirmed root cause — `lastSynced` stamped at debounce-arm time making every keystroke in the arm→echo window look like an external q change, with the adopt branch clobbering fresher input and returning without re-arm — is dead.
- Reconciliation effect rewritten with strict branch order: mount guard → own-echo absorption (inFlight, exact-or-trim match) → clean-input-only external adoption → no-op guard → debounce arm with push-time stamping.
- `commitNow` (Enter) registers its push in the same inFlight ref, so the echo of an immediate commit cannot roll back text typed while the navigation is in flight.
- Zero new packages, single production file changed, UI-SPEC:127 contract fully preserved (300 ms debounce, `router.replace(scroll:false)` in `startTransition`, Enter commit, re-type cancels timer, `value===q` no-op guard, markup/maxLength/placeholder untouched).

## Task Commits

Each task was committed atomically:

1. **Task 1: Реконсиляция SearchBox с локальным приоритетом** - `74eb0d9` (fix)
2. **Task 2: Регрессионный прогон + SUMMARY** - `docs(05-06)` commit (this file + deferred-items.md)

## Regression Checklist (Task 2)

1. `npx vitest run` — **278 tests / 18 files green**. Targeted re-run of `tests/device-search.test.ts` (26) + `tests/normalize.test.ts` (6): **32/32 green** — the FIND-01/FIND-04 matrix is untouched (the fix changed only client reconciliation, no db/query-params layers).
2. `npm run lint` — **0 errors** (exit 0). Three *pre-existing* warnings in `tests/devices-queries.test.ts` (unused `wIn30`/`wIn60`/`wPast`) — file untouched by this plan, logged to [deferred-items.md](./deferred-items.md), not fixed per scope-boundary rule.
3. Fix committed: `74eb0d9 fix(05-06): search-box reconciliation — local edits win, own echoes absorbed (G-5-1)`.
4. Pre-existing **flaky test discovered** (not caused by this plan): `tests/attachments-queries.test.ts > deleteAttachment removes the row AND both disk files` fails intermittently (~2 of 5 runs) on a disk-unlink visibility race; no test imports search-box code. Logged to [deferred-items.md](./deferred-items.md) with suggested owner action. Suite passes on re-run.

## Gap → Root Cause → Fix

**Gap G-5-1 (UAT Test 1, severity major):** быстрый ввод/удаление символов в поиске /devices терял keystrokes или откатывал удаления.

**Корневая причина** (подтверждена debug-сессией [.planning/debug/search-input-keystroke-loss.md](../../debug/search-input-keystroke-loss.md)): CR-01-эффект реконсиляции принимал ЛЮБУЮ разницу q-пропа от `lastSynced` за внешнюю навигацию, но `lastSynced` штамповался при **взводе** дебаунса (строка 57) — до прихода эха. Всё окно взвод→эхо (≥300 мс по дизайну) каждое нажатие выглядело внешним изменением: adopt-ветка затирала свежий ввод `setValue(q)` и делала return без перевзвода таймера — текст не только откатывался, он больше не уходил пушем. `commitNow` имел то же окно в полёте.

**Форма фикса** (три пункта UAT missing + две адаптации планирования):

1. **Clean-check адаптация** (UAT missing 1): URL принимается в инпут только при чистом инпуте — `value === lastSynced.current && q !== lastSynced.current`.
2. **Перевзвод при грязном инпуте** (UAT missing 2): при `value !== lastSynced.current` адаптации НЕТ никогда — более новый текст уйдёт пушем; `current` в пуше свежий из пропса, так что сброс OTHER-фильтров не откатывается.
3. **Защита commitNow** (UAT missing 3): Enter-пуш регистрируется в том же `inFlight` — эхо немедленного коммита не откатывает текст, набранный в полёте.
4. **Адаптация планирования — штамб в момент пуша:** `lastSynced` пишется внутри setTimeout-колбэка / `commitNow`, а не при взводе (голый clean-check не закрывал сценарий D: более новое нажатие перештамбовывало якорь, и эхо СТАРОГО пуша адаптировалось поверх свежего текста).
5. **Адаптация планирования — inFlight-абсорбция:** собственные эхо классифицируются рефом значений пушей (точное ИЛИ trim-совпадение — сервер триммит q в query-params.ts; maxLength 100 делает серверный cap недостижимым из инпута) и абсорбируются молча; `setValue(q)` только если инпут не трогали с момента пуша — Test-2 trim-нормализация сохранена.

**Инвариант веток:** ни один ранний return не оставляет `value !== q` без взведённого таймера (именно так старая adopt-ветка теряла текст навсегда).

## Key Traces (A–D из debug-сессии — все сходятся на новом коде)

- **A. Быстрое «a»+«b» @80 мс:** ни одного adopt (q === lastSynced на каждом ране), один push «ab» — символы не теряются (раньше финал был «» без единой навигации).
- **B. Медленный ввод @500 мс:** эхо lands между клавишами, q === lastSynced, no adopt — работает как раньше.
- **C. Быстрый delete из «abc»:** adopt не срабатывает, удаления не откатываются (раньше откат к «abc»).
- **D. Печать в полёте:** push «a» @300 → «b» @320 (грязный → перевзвод) → эхо «a» @350 — своё (матчит inFlight), setValue НЕ вызывается, инпут остаётся «ab», перевзвод толкает «ab» (раньше финал «a»).
- **Trim-эхо (Test 2, CR-01):** push «abc » → эхо «abc» матчит trim → инпут «abc», без повторного пуша — петля мертва.
- **Сброс при чистом инпуте (Test 2):** q="" не матчит inFlight (пуст), value === lastSynced → adopt, инпут пустеет; Back/Forward восстанавливают.

## Manual retest (UAT Test 1)

Выполняет владелец при end-of-phase верификации на dev-сервере, на /devices с сид-базой. **До этого прогона план не считается закрытым по truth G-5-1.**

- **(а) Быстрый ввод:** быстрыми нажатиями (без пауз) набрать фрагмент серийника с первого символа — каждый символ виден, откатов нет; результаты обновляются ~300 мс после остановки, без skeleton-вспышек.
- **(б) Быстрое удаление:** так же быстро стереть часть набранного — удаления не откатываются.
- **(в) Перечитывание до дебаунса:** начать перечитывать до срабатывания 300 мс — пуш уходит один, с финальным текстом.
- **(г) Enter + печать в полёте:** нажать Enter и продолжить печатать, пока летит навигация — эхо не откатывает ввод.
- **(д) Регресс Test 2 (CR-01) — обязателен:** «Сбросить фильтры» опустошает инпут; Back/Forward восстанавливают q; push запроса с хвостовым пробелом нормализует инпут до тримнутого; навигационной петли нет.

## Files Created/Modified

- `app/(app)/devices/search-box.tsx` - the only production file: reconciliation effect rewritten (mount guard → own-echo absorption → clean-input adoption → no-op guard → arm with push-time stamping), `inFlight` ref added, `commitNow` registers pushes the same way; props/markup/debounce interval unchanged
- `.planning/phases/05-search-filters/05-06-SUMMARY.md` - this file
- `.planning/phases/05-search-filters/deferred-items.md` - out-of-scope discoveries (pre-existing lint warnings, flaky attachments test)

## Decisions Made

- Fix implemented exactly per the plan's branch semantics (see «Форма фикса») — no redesign; scope-forbidden moves avoided (no debounce interval change, no `<form action>`, no new packages, no nav counters/queues).
- Out-of-scope lint warnings and the flaky attachments test were logged to deferred-items.md instead of being fixed (executor scope-boundary rule: pre-existing issues in unrelated files).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Intermittent vitest failure during the regression loop (attachments delete test, disk-unlink race) — diagnosed as pre-existing and unrelated (no test imports search-box; suite green on re-run), logged to deferred-items.md. Did not block the plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 5 UAT is 5/6 green with G-5-1 fixed in code — closing the gap needs only the owner's «Manual retest (UAT Test 1)» above (item д is the mandatory Test-2 regression).
- The reconciliation pattern (local priority + inFlight own-echo absorption + push-time anchors) is the reference for any future island that reconciles a controlled input against URL state.

## Self-Check: PASSED

- Files exist: `app/(app)/devices/search-box.tsx`, `05-06-SUMMARY.md`, `deferred-items.md`
- Commits exist: `74eb0d9` (Task 1 fix), `8e7d718` (Task 2 docs), `97a7e38` (planning state docs)

---
*Phase: 05-search-filters*
*Completed: 2026-09-04*
