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
| **Framework** | vitest (project standard since phase 5; baseline = live `npx vitest run` output at execute time — ~413 it/test across 27 files statically at plan time; plans pin 341+ prior tests green) |
| **Config file** | `vitest.config.ts` (existing, live-verified) |
| **Quick run command** | `npx vitest run tests/xlsx-export.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30–60 s full suite; single file ~2–5 s |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/xlsx-export.test.ts` (or the task's own test file)
- **After every plan wave:** Run `npx vitest run` (full suite — parity baseline: all prior tests stay green; plans pin 341+ prior tests)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-T1 | 01 | 1 | EXP-02 | T-14-02 (supply chain) | Exact pin write-excel-file 4.1.1 (no caret), server code imports only nested write-excel-file/node entry | install/config CLI | `node -p "require('./node_modules/write-excel-file/package.json').version" \| grep -qx "4.1.1"` | ✅ (package.json) | ⬜ pending |
| 14-01-T2 | 01 | 1 | EXP-02 | T-14-01 (route auth), T-14-03 | requireSession-first GET /api/devices/export-xlsx (never a data body without session); pure lib — no server-only / next/* imports; XLSX MIME headers | typecheck + grep | `npx tsc --noEmit && grep -n "await requireSession()" app/api/devices/export-xlsx/route.ts` | ✅ after task | ⬜ pending |
| 14-01-T3 | 01 | 1 | EXP-02 | T-14-01, T-14-04 | Standalone spike (D-06): unauthorized ≠ 5xx and ≠ 200; authorized = 200 + PK bytes; serverExternalPackages verdict recorded | e2e spike | `grep -q "PK" .planning/phases/14-xlsx/spike-standalone.md && grep -Eq "200" .planning/phases/14-xlsx/spike-standalone.md` | ✅ after task | ⬜ pending |
| 14-02-T1 | 02 | 2 | EXP-02 | T-14-08 | RED: matrix pin fails against minimal 14-01 lib (no cell types/formats/notes slice) — inverted gate, run must exit non-zero | unit (RED gate) | `! npx vitest run tests/xlsx-export.test.ts` | ❌ W0 (created by this task) | ⬜ pending |
| 14-02-T2 | 02 | 2 | EXP-02 | T-14-05/06/07/08 | GREEN: 20-column typed matrix (String/Number/Date only, no Formula), header parity vs deviceCsvHeader, headers pin, row-count parity, warranty frozen-clock; full suite green | unit + full suite | `npx vitest run tests/xlsx-export.test.ts && npx vitest run` | ✅ after 14-02-T1 | ⬜ pending |
| 14-03-T1 | 03 | 3 | EXP-02 | — | UI surfaces: «Скачать XLSX» anchor in filter-bar + «Скачать ведомость XLSX» palette row; CSV surfaces byte-untouched | typecheck + build + grep | `npx tsc --noEmit && npm run build && grep -c "export-xlsx" "app/(app)/devices/filter-bar.tsx" components/command-palette.tsx` | ✅ (edits existing files) | ⬜ pending |
| 14-03-T2 | 03 | 3 | EXP-02 | T-14-01, T-14-09 | Manual UAT: real RU-Excel opens without repair dialog, typed cells, Cyrillic RFC 5987 filename, palette Enter download, session gate | manual UAT (checkpoint:human-verify) | — see Manual-Only Verifications | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/xlsx-export.test.ts` — created RED-first as 14-02 Task 1 (inverted-gate RED before GREEN, project discipline — serves the Wave 0 role, no separate stub task)
- [ ] No framework install needed — vitest exists
- [ ] Standalone spike task runs in Wave 1 BEFORE feature build-out (D-06, 14-01 Task 3) — its "test" is `next build` + standalone server + curl 200 with .xlsx content-type

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
