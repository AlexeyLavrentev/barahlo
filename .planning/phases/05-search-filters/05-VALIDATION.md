---
phase: 5
slug: search-filters
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-04
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing project suite, temp-SQLite per test) |
| **Config file** | existing vitest config (project root) |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds (184 tests baseline — live-measure, baselines rot) |

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
| (seeded by planner — fill after PLAN.md files exist) | 01 | 1 | FIND-01..04, WAR-01, UI-03 | T-05-01 | CSV route behind requireSession; export path never public | unit+integration | `npx vitest run` | ⬜ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Homoglyph typing fixture (С↔C, О↔O, …) as shared test data — closes STATE.md blocker; fixture completeness proven, not assumed (RESEARCH §Validation Architecture)
- [ ] Warranty boundary fixtures: day 59/60/61 relative to MSK-today, NULL warrantyUntil
- [ ] Perf timing test for combined filters at ≥500 seeded rows (generous threshold; RESEARCH measured 0.9 ms @ 500)

*Existing vitest temp-SQLite infrastructure covers the rest.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live-search feel (debounce ~300 мс, «мгновенно») | UI-03 | Subjective latency feel | Type in search box on seeded dev DB; results update without Enter, no flicker |
| Filter bar layout on narrow viewport | UI-03/WAR-01 | Visual | Narrow browser window; controls stack, no overflow |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
