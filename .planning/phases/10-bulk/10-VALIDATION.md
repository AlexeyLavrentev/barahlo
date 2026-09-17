---
phase: 10
slug: bulk
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-17
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (project standard) |
| **Config file** | `vitest.config.mts` (existing) |
| **Quick run command** | `npx vitest run tests/movements-queries.test.ts tests/bulk-queries.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~40 seconds (full suite, 392+ тестов) |

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
| (заполняется планировщиком) | 01 | 1 | MOVE-06 | T-10-* | превалидация в tx, всё-или-ничего, guard против дублей | unit | `npx vitest run` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements (vitest + temp-SQLite; movement-фикстуры из movements-queries тестов).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Чекбоксы, tri-state шапка, плавающая панель, диалог партии, отчёт, сброс выделения | MOVE-06 / SC 1–4 | Компонентного раннера нет; браузерные истины (прецедент фаз 2–9) | UAT оркестратором (Playwright MCP): выделить 2-3 строки → панель → Выдать сотруднику → отчёт; Принять; blocker-кейс |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 40s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
