# Deferred Items — Phase 7 (07-live)

Out-of-scope discoveries logged during execution (SCOPE BOUNDARY: pre-existing issues in files not touched by this phase are recorded, not fixed).

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v1.0 defect (console) | React duplicate-key console warning in the EmployeeDialog department combobox — pre-existing v1.0 dialog code, untouched in phase 7; surfaced during 07-03 UAT (D-06 mid-transition console snapshot). Cosmetic (console-only), no functional impact observed. | Backlog — candidate for the next touch of the employee dialog | 2026-09-16 (07-03 UAT) |

## WR-01 — hook push dedup (from 07-REVIEW.md, 2026-09-16)

- **What:** useDebouncedSearchQuery push sites never dedup identical in-flight/server-held text. Proven consequences: interleaved echoes fire duplicate navigations (a queued duplicate can silently revert «Сбросить поиск»); double-Enter leaves a stale inFlight entry that gates off the adopt branch; a synced trailing space makes every segment switch fire a redundant navigation.
- **Origin:** inherited verbatim from v1.0 DeviceSearchBox (exists on /devices too) — NOT a phase-7 regression.
- **Why deferred:** fixing changes the shared reconciliation whose byte-parity is protected by SC 5 / D-07 (locked: «устройства как раньше», реконсиляция не переписывается). UAT 9/9 passed; the defect needs specific timing (server latency > debounce, double-Enter, synced trailing space).
- **Concrete patch:** in 07-REVIEW.md WR-01 (includes() guard at both push sites, absorb-all-matching echoes, trim-aware no-op skip). ~10 lines + tests.
- **When:** explicit decision — e.g. before Phase 11 (⌘K palette inherits the hook, D-07 reversibility: costly).
