# Phase 14 Deferred Items

## Out-of-scope discoveries

- **2026-10-01 (plan 14-02):** 6 предсуществующих lint-предупреждений (0 ошибок) в файлах вне скоупа плана: `tests/dashboard-queries.test.ts` (wIn30/wIn60/wPast unused), `tests/devices-queries.test.ts`, `app/(app)/page.tsx`, `lib/use-search-param.ts`. Возникли в фазах 6–7, XLSX-планом не трогались — гейт `npm run lint` зелёный (0 errors). Фикс — отдельная уборка вне v1.3.
