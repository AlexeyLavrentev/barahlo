---
phase: 9
slug: clone
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-16
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (project standard) |
| **Config file** | `vitest.config.mts` (existing) |
| **Quick run command** | `npx vitest run tests/devices-queries.test.ts tests/device-schema.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~35 seconds (full suite, 370+ тестов) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/devices-queries.test.ts` (+ план-специфичные файлы)
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 35 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01 T1 (миграция + runner) | 01 | 1 | REG-06 / D-08 | T-09-05 | runner применяет 0001 только с FK OFF до BEGIN; идемпотентен | unit (temp db) | `npx vitest run tests/schema.test.ts tests/migrate-runner.test.ts` | ❌ Wave 0 (schema.test.ts ✅ расширить; migrate-runner.test.ts новый) | ⬜ pending |
| 09-01 T2 (ядро клона) | 01 | 1 | REG-06 / SC 1–4 | T-09-01, T-09-02 | статус/holder не из payload; N≤100 в ядре не нужен (zod в экшене); транзакция all-or-nothing | unit (temp db) | `npx vitest run tests/inventory-increment.test.ts tests/clone-queries.test.ts` | ❌ Wave 0 (оба новых) | ⬜ pending |
| 09-01 T3 (экшен + диалог) | 01 | 1 | REG-06 / D-01..D-07 | T-09-01..T-09-04 | requireSession-first; zod-белый список 3 полей (count 1..100); '' → null; коллизия → поле | build + suite | `npm run build && npx vitest run` | ✅ (build; suite зелёный) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements (vitest + temp-SQLite helpers; миграционный runner верифицируется research-probe'ом, тесты раннера — в плане).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Кнопка «Дублировать» видна, диалог открывается, N копий появляются в реестре «на складе» | REG-06 / SC 1–2 | Компонентного раннера в репо нет (прецедент фаз 2–8); браузерная проверка оркестратором в UAT (Playwright MCP) | Открыть карточку → «Дублировать» → N=2 → подтвердить → проверить реестр |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 35s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
