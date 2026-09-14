---
phase: 3
slug: device-registry
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-02
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (established Phase 1) |
| **Config file** | `vitest.config.ts` (exists) |
| **Quick run command** | `npx vitest run --reporter=dot` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=dot`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-T1 | 01 | 1 | REG-01, REG-02 | T-03-01..04 | whitelist, normalized | unit/integration | `npx vitest run && npm run build && node scripts/smoke-devices.mjs && node scripts/smoke-employees.mjs` | ✅ | ⬜ pending |
| 03-02-T1 | 02 | 2 | REG-03 | T-03-02 | 404-инвариант | integration | `npm run build && node scripts/smoke-devices.mjs` | ✅ | ⬜ pending |
| 03-02-T2 | 02 | 2 | REG-03 | T-03-02 | edit-whitelist без typeKey | unit | `npx vitest run && npm run build && node scripts/smoke-devices.mjs` | ✅ | ⬜ pending |
| 03-02-T3 | 02 | 2 | REG-03 | T-03-03 | no-delete гейт | grep | `grep -rniE "\\bdelete\\b" db/queries/devices.ts "app/(app)/devices" \|\| true` + full suite | ✅ | ⬜ pending |

---

## Wave 0 Requirements

- [ ] None — infrastructure established in Phase 1

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Apple-aesthetic + dialog UX (typo/spacing) | UI-02 | Subjective visual judgment | /gsd-ui-review 3; side-by-side with UI-SPEC |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-02
