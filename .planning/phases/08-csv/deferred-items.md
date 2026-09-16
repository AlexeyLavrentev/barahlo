# Phase 8: Deferred Items

Out-of-scope discoveries recorded during execution (executor scope boundary:
pre-existing issues in files this phase did not touch are not auto-fixed).

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| lint-warning | `app/(app)/page.tsx:22` — `'DEVICE_STATUS_KEYS' is defined but never used` (file last touched c572e47, 2026-09-14 — до фазы 8) | open | 2026-09-16 |
| lint-warning | `tests/dashboard-queries.test.ts:54` — `'addDaysUtc' is assigned a value but never used` (file last touched 5b1c6af, 2026-09-14 — до фазы 8) | open | 2026-09-16 |
| lint-warning | `tests/devices-queries.test.ts:282-285` — `'wIn30'/'wIn60'/'wPast'` assigned but never used (file last touched 10cb3ee, 2026-09-04 — до фазы 8) | open | 2026-09-16 |

Заметка: на закрытии фазы 7 гейт репортировал «0 ошибок / 1 предупреждение»
(exhaustive-deps, use-search-param — уже в WINDOWS.md #7). Пять unused-vars
предупреждений существуют в файлах, фазой 8 не тронутых; ESLint-конфиг/счётчик
фазы 7 их не репортил. Дефект фазы 8 не является — 0 errors, exit 0.

## WR-01 (08-REVIEW.md, warning) — defer

Дублированный query-параметр (`?type=laptop&type=monitor`): route берёт `Object.fromEntries(searchParams)` (последнее значение), страница передаёт массивы в общий парсер (деградация в inactive-сентинел) → на malformed URL CSV ≠ страница. Предсуществующая строка фазы 5 (route.ts:43, фазой не менялась); фикс — шейпинг массивов до `parseDevicesSearchParams` в route.ts. Решение до Фазы 11 (вместе с WR-01 фазы 7 — dedup пушей хука).
