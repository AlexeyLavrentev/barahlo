---
status: complete
phase: 5-search-filters
source: [05-VERIFICATION.md]
started: 2026-09-04T20:45:00Z
updated: 2026-09-05T03:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Live-search feel
expected: Open /devices on a seeded dev DB, type a serial fragment from the first character (no Enter), retype mid-debounce, press Enter once — results update live ~300 ms after typing stops, no skeleton flash per keystroke, focus/value kept, Enter commits immediately.
result: issue
reported: "поле поиска в целом работает если вводить и удалять символы по одному с паузами. Если вводить символы или удалять их быстро то поле ведет себя странно, и либо не прописывает то что я пишу, либо не удаляет"
severity: major

### 2. Search-box reconciliation (CR-01)
expected: With a q active click «Сбросить фильтры», then use browser Back and Forward; also push a query with trailing spaces and let the server trim it. The input adopts the URL's q after reset/Back/Forward (empties on reset, restores on Back) and no re-push navigation loop starts.
result: pass

### 3. One-bar FilterBar on a narrow viewport
expected: Narrow the window under ~768 px; set a department with a very long name; type a 100-character query. The bar wraps to a second line without overflow, the long department name truncates with ellipsis in its sm:w-40 trigger, the long query renders in the flex-1 field without breaking the bar.
result: pass

### 4. Warranty colors on real data
expected: Open /devices, a device card with each warranty state, and an employee card with issued devices. Row line 2 « · гар. до dd.mm.yyyy» green (#248A3D) beyond 60 days / orange (#FF9500) in the inclusive window / red (#D70015) expired; card «Гарантия до» value colored, label untouched; «без гарантии» — no segment in lists, plain «—» on the card; text color only.
result: pass

### 5. CSV open test
expected: Download via «Скачать CSV» on a filtered view and open once in RU Excel or Numbers — Cyrillic intact (no mojibake), one column per field («;»), dates dd.mm.yyyy, a model starting with «=» opens as text (no formula execution).
result: pass

### 6. Reseed dev DB + felt UI-03 at scale
expected: ВНИМАНИЕ: `./data/app.db` — живая база твоего Docker-деплоя (реальные сотрудники/устройства UAT фаз 2–4, прод-пароль админа). НЕ делать `rm` вслепую. Безопасные варианты: (а) изолированный тест на отдельном порту: `DATABASE_PATH=/tmp/uat5-data/app.db npx drizzle-kit migrate && DATABASE_PATH=/tmp/uat5-data/app.db node scripts/seed.mjs` + `DATABASE_PATH=/tmp/uat5-data/app.db npx next start -p 3001` — 400 устройств (200/80/50/70), все 4 состояния гарантии, поиск/фильтры/пагинация «мгновенно» наощупь; или (б) если хочется на своей живой базе — ночной бэкап уже есть (cron), но решение и риск твои. Автоматический perf-гейт уже зелёный (0.76 мс @ 600 строк), этот пункт — про «мгновенно» наощупь.
result: pass

## Summary

total: 6
passed: 5
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-5-1
  truth: "Быстрый ввод/удаление символов в поиске не теряет keystrokes: инпут не откатывается к старому q из серверного эха, пока летит навигация"
  status: failed
  reason: "User reported: поле поиска в целом работает если вводить и удалять символы по одному с паузами. Если вводить символы или удалять их быстро то поле ведет себя странно, и либо не прописывает то что я пишу, либо не удаляет"
  severity: major
  test: 1
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis
