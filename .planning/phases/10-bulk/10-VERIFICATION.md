---
phase: 10-bulk
verified: 2026-09-18T04:53:09Z
status: passed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
gaps: []
---

# Phase 10: Bulk-выдача и приём — Verification Report

**Phase Goal:** Партия техники выдаётся одному сотруднику (или принимается на склад) одним диалогом вместо N походов по карточкам; оператор всегда точно знает, сколько единиц записано, а сколько заблокировано — и почему.
**Verified:** 2026-09-18T04:53:09Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Roadmap SC 1–4 merge 1:1 onto PLAN truths 1–4 (+3 plan-specific truths); all verified against actual code.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Чекбоксы на КАЖДОЙ строке + tri-state «выбрать страницу» + панель «Выбрано: N» (только N>0) с «Выдать»/«Принять»/«Снять выделение» (SC 1, D-01) | ✓ VERIFIED | `app/(app)/devices/device-bulk.tsx`: RowCheckbox рендерится в каждой строке (page.tsx:182, внутри `rows.map`), HeaderTriState controlled tri-state (checked=`size===rows.length`, indeterminate=`size>0 && !all`), FloatingPanel в блоке `selected.size > 0` (device-bulk.tsx:106–136) с тремя кнопками; UAT сценарий 1 pass |
| 2 | Один диалог на партию: «Выдать» — один EmployeePicker; «Принять» — без поля сотрудника; общая дата (today prefill + max) и один комментарий (SC 2, D-04) | ✓ VERIFIED | `bulk-dialogs.tsx`: BulkAssignForm содержит EmployeePicker (L312–318), BulkAcceptForm — не содержит (только OccurredAtField/CommentField, L444–449); оба диалога имеют ровно один OccurredAtField + один CommentField на партию; UAT сценарий 4: «combobox отсутствует» |
| 3 | Всё-или-ничего: одна неeligible единица → ноль записей + blocker-строка «модель · инвентарник · статус» (SC 3, D-02/D-03) | ✓ VERIFIED | `db/queries/movements.ts:378–394` (assign) и `436–459` (accept): in-tx SELECT-превалидация по inArray, blockers с model/status/'not_found' возвращаются ДО первого UPDATE; BlockerView (bulk-dialogs.tsx:215–248) role="alert" + data-bulk-blockers; тест «смесь eligible/неeligible → blockers, НОЛЬ записей» — PASS (запущен при верификации); UAT сценарий 3 pass |
| 4 | Успех пишет ровно одно movement-событие на единицу с общими occurredAt/комментарием; отчёт «Записано: N» со строкой на единицу — не тост, не редирект (SC 4, D-05/D-06) | ✓ VERIFIED | movements.ts: guard-UPDATE цикл + INSERT per id, один `occurredAt = occurredOf(event)` на партию (L395, L460); экшен вызывает `occurredAtFromDate` ОДИН раз (actions.ts:712, 744); отчёт «Записано: {results.length}» + data-bulk-report вместо полей (bulk-dialogs.tsx:272–299, 403–433); тест «happy path: ровно N событий с общими occurredAt и комментарием» в сьюте; UAT сценарий 2: movements 672/673 — один occurred_at, общий комментарий |
| 5 | Выделение сбрасывается ТОЛЬКО после подтверждённого успеха; ошибки и blockers нетронуты (SC 4, D-06) | ✓ VERIFIED | `useClearOnOk` — единственная точка clear(): `if (state.ok) onOk()` (bulk-dialogs.tsx:205–209); при blockers/state.error форма рендерится с echo, clear() не вызывается; UAT сценарий 3: «выделение „Выбрано: 2" сохранилось» при blocker |
| 6 | Любая навигация растворяет выделение — selection строго page-scoped (D-01, Out of Scope) | ✓ VERIFIED | page.tsx:164 `<DeviceBulkProvider key={buildDevicesQuery(filters, current)}>` — то же выражение, что пагинация; query-params.ts НЕ содержит selection/deviceIds (grep — 0 совпадений, client-only); UAT сценарий 5: «Далее» → ?page=2 → панель=0 |
| 7 | Повторный клик не создаёт дублей: pending-disabled + guard-UPDATE (0 rows → throw → полный откат) (SC 4, D-03) | ✓ VERIFIED | movements.ts:407/476 `if (upd.changes === 0) throw { code: 'ILLEGAL_TRANSITION' }` внутри db.transaction → полный откат; bulk-dialogs.tsx:340/464 `disabled={pending}`; тест «in-batch дубликат id → ILLEGAL_TRANSITION, полный откат» — PASS (запущен при верификации); тест «повторный вызов после успеха → blockers» в сьюте; UAT сценарий 7: ровно 2 movement на двойной клик |

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `app/(app)/devices/device-bulk.tsx` | Provider-остров: Set, RowCheckbox, HeaderTriState, FloatingPanel, key-reset | ✓ VERIFIED | NEW, 203 строки; 'use client'; первый createContext; data-device-select/panel/count иглы на месте |
| `app/(app)/devices/bulk-dialogs.tsx` | BulkAssignDialog/BulkAcceptDialog (WR-01 split), blocker-вью, success-отчёт | ✓ VERIFIED | NEW, 496 строк; data-bulk-blockers/report; hidden deviceIds ×N |
| `components/ui/checkbox.tsx` | Indeterminate-глиф MinusIcon + data-indeterminate accent | ✓ VERIFIED | L29 условный глиф; data-indeterminate классы в строке Root (L17); WIRED — импортируется device-bulk.tsx |
| `app/(app)/devices/actions.ts` | bulkAssignDevicesAction/bulkAcceptDevicesAction + BulkFormState | ✓ VERIFIED | L662–754; requireSession первой строкой (L700, L733); BulkFormState с blockers/results |
| `db/queries/movements.ts` | bulkAssignDevices/bulkAcceptDevices — одна tx, SELECT-превалидация, union | ✓ VERIFIED | L373–423, L432–494; BulkBlocker/BulkOutcome union (L359–362) |
| `lib/movement-schema.ts` | bulkAssignSchema/bulkAcceptSchema (deviceIds 1..20, strictObject) | ✓ VERIFIED | L180–209; min(1)/max(20); оба в movementSchemas; bulkAccept БЕЗ employeeId |
| `app/(app)/devices/page.tsx` | [RowCheckbox][Link] sibling-строки, header-strip, provider key-wrap | ✓ VERIFIED | L163–262; li — два ребёнка: RowCheckbox и Link (L181–190) |
| `tests/movements-queries.test.ts` | Bulk-матрица (превалидация, откат, N событий, repeat-guard, EMPLOYEE_INACTIVE) | ✓ VERIFIED | describe L705 (7 тестов assign) + L825 (4 теста accept) |
| `tests/movement-schema.test.ts` | Границы deviceIds + reject employeeId в bulkAccept | ✓ VERIFIED | describe L118: 0/-1/1.5/'abc' reject, 20 pass/21 reject, дубли pass, инъекция reject, будущая дата reject |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| page.tsx | device-bulk.tsx | `key={buildDevicesQuery(filters, current)}` — key-reset | ✓ WIRED | L164; query-params selection'ом не расширен |
| Панель/диалог | actions.ts | hidden deviceIds ×N → formData.getAll → дедуп Set → zod → bulk-функция | ✓ WIRED | bulk-dialogs L305–307/437–439 → bulkPayload `new Set(formData.getAll('deviceIds'))` (actions.ts:687) → safeParse(movementSchemas.bulkAssign/bulkAccept) |
| movements.ts | bulk-dialogs.tsx | union {ok:false, blockers} → BulkFormState.blockers → role="alert" | ✓ WIRED | actions.ts:720/751 `if (!outcome.ok) return { blockers, values }` → BlockerView role="alert" (L227) |
| guard-UPDATE | catch в экшене | `.changes===0 → throw {code:'ILLEGAL_TRANSITION'}` → полный откат → копи-таблица | ✓ WIRED | throw внутри db.transaction ( movements.ts:407/476) → catch → BULK_*_ERROR (actions.ts:715–718/747–750), {code} наружу не течёт |
| state.ok | provider.clear() | useClearOnOk — единственная точка сброса | ✓ WIRED | bulk-dialogs.tsx:205–209 `if (state.ok) onOk()`; onOk=clear из device-bulk.tsx:140–154 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| FloatingPanel | `selected` Set | Клиентские клики RowCheckbox → toggle | Да (ids реальных строк) | ✓ FLOWING |
| BlockerView / success-отчёт | state.blockers/results | SQL-превалидация в tx (модель/статус из БД) + results из INSERT-цикла | Да (данные из devices/movements) | ✓ FLOWING |
| EmployeePicker | `employees` | `listActiveEmployees()` (page.tsx пропс) | Да (SQL-список) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Всё-или-ничего с откатом | `npx vitest run tests/movements-queries.test.ts -t "смесь eligible/неeligible"` | 1 passed, 63 skipped | ✓ PASS |
| Repeat-guard: in-batch дубликат → полный откат | `npx vitest run tests/movements-queries.test.ts -t "in-batch дубликат id"` | 1 passed, 63 skipped | ✓ PASS |
| Границы схем deviceIds/strictObject | `npx vitest run tests/movement-schema.test.ts -t "deviceIds bounds"` | 6 passed, 10 skipped | ✓ PASS |

Executor-reported full suite: 409/409 (коммит-цепочка 8ae36a2..f87d662 подтверждена git log).

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| (none declared) | — | Проект не имеет scripts/*/tests/probe-*.sh конвенции; фаза не декларирует probes — роль пробы выполнял UAT-гейт (10-UAT.md) | SKIPPED (n/a) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| MOVE-06 | 10-01-PLAN | Выдача выбранных устройств одному сотруднику / приём на склад одним диалогом: page-scoped выбор, all-or-nothing с превалидацией, отчёт по каждой единице | ✓ SATISFIED | Все 7 истин VERIFIED; REQUIREMENTS.md: `[x] MOVE-06`, трассировка «MOVE-06 \| Phase 10 \| Complete» |

Orphaned requirements: none — REQUIREMENTS.md maps only MOVE-06 to Phase 10, and the plan declares `requirements: [MOVE-06]`.

### Prohibitions (must-NOT checks)

| Prohibition | Verification | Status |
| ----------- | ------------ | ------ |
| Никакого cross-page «выбрать всё» / переживания выделения | Judgment: selection живёт только в client-острове; query-params.ts без selection-параметров (grep 0); key-reset по buildDevicesQuery | ✓ VERIFIED |
| Никаких новых npm-зависимостей | Evidence: `git diff 667ab57..HEAD -- package.json` пуст | ✓ VERIFIED |
| Клиент не дизейблит триггеры по статусам строк | Judgment: device-bulk.tsx не содержит disabled по row.status; единственный disabled — pending сабмита (D-02) | ✓ VERIFIED |
| Чекбокс никогда не вложен в Link | Judgment: page.tsx L181–190 — `<li>` с двумя детьми RowCheckbox и Link (сиблинги) | ✓ VERIFIED |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | TBD/FIXME/XXX/TODO/HACK — 0 совпадений во всех 9 файлах фазы | — | — |
| bulk-dialogs.tsx | 120, 195 | `placeholder=` — атрибуты HTML-инпутов (копирайт, не заглушки) | ℹ️ Info | None |

### Human Verification Required

None outstanding. Task 3 (checkpoint:human-verify) выполнен оркестратором через Playwright MCP — 8/8 сценариев pass, 0 issues, владелец подписал «pass» (`.planning/phases/10-bulk/10-UAT.md`, коммит `0e48e69`, прецедент фаз 7–9). Browser-backstop-строки покрыты UAT-файлом и повторно на human_needed не маршрутизируются. Серверные behavior-инварианты (откат, repeat-guard, общий occurredAt) закреплены запущенными при верификации тестами.

## Gaps Summary

Нет. Фаза доставлена по всем слоям: selection-остров с key-reset (D-01), один диалог на партию без поля сотрудника для «Принять» (D-04), транзакция всё-или-ничего с in-tx SELECT-превалидацией и union-блокерами (D-02/D-03), по одному событию на единицу с общими occurredAt/комментарием (D-06), отчёт «Записано: N» и blocker-строки «модель · инвентарник · статус» (D-05). Копирайт-контракт дословно. Ни одной новой зависимости, ни одной миграции. MOVE-06 закрыт; UAT 8/8.

---

_Verified: 2026-09-18T04:53:09Z_
_Verifier: Claude (gsd-verifier)_
