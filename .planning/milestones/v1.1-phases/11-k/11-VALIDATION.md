---
phase: 11
slug: k
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-18
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (project standard) |
| **Config file** | `vitest.config.mts` (existing) |
| **Quick run command** | `npx vitest run tests/palette-route.test.ts tests/employees-queries.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~40 seconds (409+ тестов) |

---

## Sampling Rate

- **After every task commit:** Run план-специфичные тест-файлы
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 40 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01 T1 (tracer) | 01 | 1 | FIND-06 | T-11-01/02 | requireSession-first роут, компоновка предикатов (parity SC 2), LIMIT 6+6, no-store | unit (db) | `npx vitest run tests/palette-queries.test.ts && npx tsc --noEmit` | ❌ → создаётся задачей T1 | ⬜ pending |
| 11-01 T2 (D-08) | 01 | 1 | FIND-06 | T-11-02 | shaping дублей query-параметров в массивы (pure-хелпер), dedup пушей хука | unit | `npx vitest run tests/search-params-record.test.ts tests/device-search.test.ts tests/employee-search.test.ts && npx tsc --noEmit` | ❌ → создаётся задачей T2 | ⬜ pending |
| 11-01 T3 | 01 | 1 | FIND-06 | T-11-03/04/05 | content-type-гвард (307→login), AbortController, инертность хоткея (клиент) | build+suite | `npx tsc --noEmit && npm run build && npx vitest run` | ✅ (тесты T1) | ⬜ pending |
| 11-01 T4 (UAT) | 01 | 1 | FIND-06 | — | SC 1–4 браузерные истины (гейт-чекпоинт) | manual (Playwright MCP) | — (checkpoint:human-verify) | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements (vitest + temp-SQLite; сотрудники/устройства фикстуры есть).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ⌘K на русской раскладке, ↑↓/Enter/Esc, группы/лимиты, «Показать все», бейдж архива, инертность при диалоге, «Скачать ведомость» | FIND-06 / SC 1–4 | Браузерные истины (прецедент фаз 7–10) | UAT оркестратором (Playwright MCP): press ⌘K → ввод «елк» → Ёлкин найден → Enter → карточка; Esc; повторный ⌘K; диалог открыт → ⌘K инертен; пункт CSV |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 40s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
