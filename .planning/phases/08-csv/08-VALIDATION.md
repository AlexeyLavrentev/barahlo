---
phase: 8
slug: csv
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-16
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (project standard, фаза 5–7) |
| **Config file** | `vitest.config.mts` (existing) |
| **Quick run command** | `npx vitest run tests/csv-export.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds (full, 341+ тестов) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/csv-export.test.ts tests/warranty.test.ts tests/devices-queries.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (заполняется планировщиком) | 01 | 1 | EXP-01 | T-08-01 | новые ячейки под esc()-гвардом (CWE-1236) | unit | `npx vitest run tests/csv-export.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements (vitest + temp-SQLite helpers отлажены в фазах 5–7; файлы `tests/csv-export.test.ts`, `tests/warranty.test.ts`, `tests/devices-queries.test.ts` существуют и расширяются, не создаются).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Файл открывается в RU-Excel: «Диагональ, ″» с десятичной запятой читается числом, не датой | EXP-01 / SC 3 | Поведение локали Excel не воспроизводится vitest | Скачать CSV на dev-инстансе, открыть в Excel/Numbers, проверить колонку «Диагональ, ″» (21,5 ≠ 21.май) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
