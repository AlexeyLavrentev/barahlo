---
phase: 4
slug: custody-photos
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-03
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from 04-RESEARCH.md «## Validation Architecture» (test map authored by researcher).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.11 (installed; sharp runs in node env) |
| **Config file** | `vitest.config.ts` (exists) |
| **Quick run command** | `npx vitest run --reporter=dot` |
| **Full suite command** | `npx vitest run && npm run build` |
| **Estimated runtime** | ~20 seconds (sharp adds a few) |

---

## Sampling Rate

- **After every task commit:** `npx vitest run --reporter=dot`
- **After every plan wave:** `npx vitest run && npm run build`
- **Before `/gsd-verify-work`:** Full suite + build green
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-T1 | 01 | 1 | MOVE-01/03 | T-04-01 | guard rejects non-in_stock, no side effects | unit/integration | `npx vitest run tests/movements-queries.test.ts -t 'assign'` | ❌ W0 | ⬜ pending |
| 04-01-T1 | 01 | 1 | MOVE-02/04 | T-04-02 | correct from/to; atomic; RAISE on UPDATE/DELETE | unit/integration | `npx vitest run tests/movements-queries.test.ts -t 'return'` | ❌ W0 | ⬜ pending |
| 04-01-T1 | 01 | 1 | MOVE-04/D-01 | T-04-03 | occurredAt DESC + id; backdated; alias names | unit/integration | `npx vitest run tests/movements-queries.test.ts -t 'timeline'` | ❌ W0 | ⬜ pending |
| 04-01-T1 | 01 | 1 | MOVE-05/D-07 | T-04-04 | N events one tx; failure rolls back ALL | unit/integration | `npx vitest run tests/movements-queries.test.ts -t 'return-all'` | ❌ W0 | ⬜ pending |
| 04-01-T1 | 01 | 1 | EMP-02 | — | assigned-only by holder, batched | unit/integration | `npx vitest run tests/movements-queries.test.ts -t 'issued'` | ❌ W0 | ⬜ pending |
| 04-02-T2 | 02 | 2 | REG-04/D-03 | T-04-05 | all 7 transitions reject from disposed | unit/integration | `npx vitest run tests/movements-queries.test.ts -t 'disposed'` | ❌ W0 | ⬜ pending |
| 04-03-T1 | 03 | 3 | REG-05/D-05/D-06 | T-04-06..08 | 8-cap; EXIF/GPS/ICC stripped; no enlargement; garbage rejected | unit/integration | `npx vitest run tests/attachments-queries.test.ts` | ❌ W0 | ⬜ pending |
| 04-03-T1 | 03 | 3 | REG-05/ACC-02 | T-04-06 | no cookie → 401/redirect; with cookie → 200 | smoke | `node scripts/smoke-custody.mjs` | ❌ W0 | ⬜ pending |

*(Task IDs finalize when plans exist; planner maps rows to concrete task IDs.)*

---

## Wave 0 Requirements

- [ ] `npm install sharp@0.35.4` — ТОЛЬКО после checkpoint:human-verify (SUS churn; официальный repo, no postinstall)
- [ ] `tests/movements-queries.test.ts` — MOVE/REG-04/EMP-02 (helpers: createTempDb/applyMigrations)
- [ ] `tests/attachments-queries.test.ts` — cap, thumbnails, sharp pipeline
- [ ] `lib/movement-schema.ts` + `lib/photos.ts` — чистые модули до тестов (Pitfall 7: никаких next/headers в тестируемом)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Диалоги выдачи/приёма/передачи/ремонта/списания: echo values, копи, порядок полей | MOVE-01..03/D-01 | Interactive/visual | UAT против 04-UI-SPEC |
| Таймлайн/фотогрид/лайтбокс визуал | MOVE-04/REG-05 | Visual | UAT + /gsd-ui-review 4 |
| Фото с телефона (capture, HEIC→JPEG) | REG-05 | Нужен реальный телефон | Открыть карточку с телефона, приложить фото |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-03 (seeded from researcher test map; planner maps task IDs)
