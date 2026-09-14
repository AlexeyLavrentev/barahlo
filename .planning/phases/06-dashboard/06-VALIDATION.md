---
phase: 6
slug: dashboard
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-14
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing project suite, temp-SQLite per test) |
| **Config file** | existing vitest config (project root) |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds (278 tests baseline — live-measure, baselines rot) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01 T1 | 06-01 | 1 | DASH-01, DASH-03 | T-06-01 | `/` behind requireSession; smoke «/» needle rewritten in the same task | integration | `npm run build && node scripts/smoke-devices.mjs && npx vitest run` | ⬜ W0 | ⬜ pending |
| 06-02 T1 | 06-02 | 2 | DASH-02 | T-06-01 | гарантийные счётчики = те же предикаты, что фильтры | integration | `npx vitest run && npm run build && node scripts/smoke-devices.mjs` | ⬜ W0 | ⬜ pending |
| 06-02 T2 | 06-02 | 2 | DASH-01, DASH-02, DASH-03 | — | parity-тесты: счётчики == listDevices totals; TZ-граница; feed ordering | unit (Wave 0) | `npx vitest run tests/dashboard-queries.test.ts && npx vitest run` | ⬜ W0 | ⬜ pending |
| 06-02 T3 | 06-02 | 2 | DASH-01..03 | — | smoke-dashboard периметр `/` | smoke | `npm run build && node scripts/smoke-dashboard.mjs` | ⬜ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Parity fixtures: dashboard counters (type/status tiles, warranty presets) MUST equal `listDevices` totals under identical filters — no-drift proof for D-04 invariant
- [ ] Feed ordering fixture: occurredAt DESC + id tiebreaker stability; null from/to (received, in-stock) renders
- [ ] TZ boundary fixture: MSK-today boundary in warranty counters matches lib/warranty.ts displayTodayUtc (CR-01 recipe)

*Existing vitest temp-SQLite infrastructure covers the rest.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dashboard visual hierarchy (tiles grid, blocks) | DASH-01 | Visual | Open / on seeded DB; tiles row + two blocks per UI-SPEC |
| Deep-link targets land on pre-filtered lists | DASH-02/03 | Cross-page navigation feel | Click each tile/warranty counter; list opens filtered |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
