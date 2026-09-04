---
status: testing
phase: 5-search-filters
source: [05-VERIFICATION.md]
started: 2026-09-04T20:45:00Z
updated: 2026-09-04T20:45:00Z
---

## Current Test

number: 1
name: Live-search feel
expected: |
  Results update live ~300 ms after typing stops, no skeleton flash per keystroke, the input keeps focus and its value, Enter commits immediately.
awaiting: user response

## Tests

### 1. Live-search feel
expected: Open /devices on a seeded dev DB, type a serial fragment from the first character (no Enter), retype mid-debounce, press Enter once — results update live ~300 ms after typing stops, no skeleton flash per keystroke, focus/value kept, Enter commits immediately.
result: [pending]

### 2. Search-box reconciliation (CR-01)
expected: With a q active click «Сбросить фильтры», then use browser Back and Forward; also push a query with trailing spaces and let the server trim it. The input adopts the URL's q after reset/Back/Forward (empties on reset, restores on Back) and no re-push navigation loop starts.
result: [pending]

### 3. One-bar FilterBar on a narrow viewport
expected: Narrow the window under ~768 px; set a department with a very long name; type a 100-character query. The bar wraps to a second line without overflow, the long department name truncates with ellipsis in its sm:w-40 trigger, the long query renders in the flex-1 field without breaking the bar.
result: [pending]

### 4. Warranty colors on real data
expected: Open /devices, a device card with each warranty state, and an employee card with issued devices. Row line 2 « · гар. до dd.mm.yyyy» green (#248A3D) beyond 60 days / orange (#FF9500) in the inclusive window / red (#D70015) expired; card «Гарантия до» value colored, label untouched; «без гарантии» — no segment in lists, plain «—» on the card; text color only.
result: [pending]

### 5. CSV open test
expected: Download via «Скачать CSV» on a filtered view and open once in RU Excel or Numbers — Cyrillic intact (no mojibake), one column per field («;»), dates dd.mm.yyyy, a model starting with «=» opens as text (no formula execution).
result: [pending]

### 6. Reseed dev DB + felt UI-03 at scale
expected: `rm data/app.db` (+ WAL/SHM), `npx drizzle-kit migrate && DATABASE_PATH=./data/app.db node scripts/seed.mjs`, then page/filter/search /devices — ~400 devices (200/80/50/70), all four warranty states, paging/filtering/search feel instant.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
