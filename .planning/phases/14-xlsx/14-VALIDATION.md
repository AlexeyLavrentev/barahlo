---
phase: 14
slug: xlsx
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-29
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (project standard since phase 5; 483 tests green at v1.2 close) |
| **Config file** | `vitest.config.mts` (existing) |
| **Quick run command** | `npx vitest run tests/device-xlsx.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30–60 s full suite; single file ~2–5 s |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/device-xlsx.test.ts` (or the task's own test file)
- **After every plan wave:** Run `npx vitest run` (full suite — parity baseline: 483+ tests must stay green)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled by planner — seed rows below) | | | | | | | | | |
| 14-01-T? | 01 | 1 | EXP-02 | T-14-01 (route auth) | requireSession-first on /api/devices/export-xlsx — 307/401 without session, never a data body | unit+route | `npx vitest run tests/device-xlsx.test.ts` | ❌ W0 | ⬜ pending |
| 14-01-T? | 01 | 1 | EXP-02 | — | 20-column cell-type map: diagonal Number, serials/inventory String '＠', dates Date, header labels imported from deviceCsvHeader | unit | `npx vitest run tests/device-xlsx.test.ts` | ❌ W0 | ⬜ pending |
| 14-0?-T? | 0? | 1 | EXP-02 | — | Parity rows: same DeviceExportRow input → same 20 values as buildDeviceCsv (label derivation shared) | unit | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/device-xlsx.test.ts` — stubs for EXP-02 (TDD RED before GREEN, project discipline)
- [ ] No framework install needed — vitest exists
- [ ] Standalone-Docker spike task runs BEFORE feature tasks (D-06) — its "test" is `next build` + standalone server + curl 200 with .xlsx content-type

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| RU-Excel opens file without «восстановить книгу»; «21,5» renders as number; «125 000» thousands format visible; dd.mm.yyyy dates | EXP-02 SC2/SC3 | Viewer-locale rendering is Excel-runtime behavior — unit tests can only pin cell types/formats | Download XLSX in Excel (Windows RU) → verify no repair dialog, diagonal sorts/SUMs, dates sort |
| Filename «устройства-ГГГГ-ММ-ДД.xlsx» displays correctly in Windows Chrome/Edge download | EXP-02 SC4 | RFC 5987 rendering is browser/OS behavior | Download from Windows Chrome + Edge → check Cyrillic filename intact |
| ⌘K palette XLSX row triggers native download | EXP-02 SC1 | Keyboard→click dispatch is browser behavior | Open palette, arrow to XLSX row, Enter → download starts |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
