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
| (заполняется планировщиком) | 01 | 1 | REG-06 | T-09-* | requireSession-first экшен; транзакция all-or-nothing | unit | `npx vitest run` | ✅ | ⬜ pending |

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
