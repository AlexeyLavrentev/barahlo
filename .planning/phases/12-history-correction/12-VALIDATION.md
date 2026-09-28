---
phase: 12
slug: history-correction
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-28
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (project standard since phase 1) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/movement-schema.test.ts tests/12-replay.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15–30 seconds (425 tests in v1.1) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run` (full suite — fast enough, catches regressions in untouched flows: bulk, clone, dispose)
- **After every plan wave:** Full suite + `npx tsc --noEmit` + `npx next build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | HIST-03 | T-12-02 | replay в одной tx — reject = ноль записей | unit | `npx vitest run tests/12-replay.test.ts` | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | HIST-01 | — | editMovement валидирует eventType по keystone-словарю | unit | `npx vitest run tests/movement-schema.test.ts` | ✅ | ⬜ pending |
| 12-01-03 | 01 | 1 | HIST-03 | — | удаление последней «выдачи» → in_stock/null | unit | `npx vitest run tests/12-replay.test.ts` | ❌ W0 | ⬜ pending |
| 12-01-04 | 01 | 1 | SC12-5 | T-12-01 | миграция 0002 DROP TRIGGER; runner применяет | unit | `npx vitest run tests/migration.test.ts` | ❌ W0 | ⬜ pending |
| 12-0X-XX | 0X | X | HIST-01/02 | — | action requireSession-first, zod strictObject | unit | `npx vitest run` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Map уточняется планом (планировщик подставит реальные Task ID); жёсткое правило: каждый replay/валидационный инвариант из SC3/SC4 получает именованный тест.*

---

## Wave 0 Requirements

- [ ] `tests/12-replay.test.ts` — матрица replay-валидации (валидные/невалидные цепочки, старт in_stock, received-семантика A2, disposed-ветка D-06)
- [ ] Миграция 0002 подхватывается `tests/helpers.ts applyMigrations` автоматически (RESEARCH: probe-verified)

*Existing infrastructure (helpers.ts, temp-db fixtures) covers the rest.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Диалог правки: предфилл даты в DISPLAY_TZ, отправка, позиция записи в таймлайне | HIST-01 | браузерная истина (прецедент UAT фаз 5–11) | UAT-сценарий: открыть карточку → «Исправить» → сменить дату/сотрудника → таймлайн пересортировался |
| Подтверждение удаления показывает текст записи | HIST-02 | визуальный контракт D-07 | UAT-сценарий: «Удалить» → текст записи в диалоге → отмена/подтверждение |
| Удаление записи «Списание» возвращает устройство на склад (отмена списания) | D-06 | сквозной сценарий через UI | UAT-сценарий: списать → удалить disposed-запись → статус in_stock |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
