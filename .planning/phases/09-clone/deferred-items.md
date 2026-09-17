# Phase 9 — Deferred / recorded findings

- **IN-01** (09-REVIEW, info): query-level «нераспознанный старт → все копии NULL-серия» не запинен тестом — поведение по спеке (SC 3/D-02), тест-пин при случае.
- **IN-02** (09-REVIEW, info): N=100 boundary и rollback-on-failure раннера не покрыты тестами напрямую (транзакционный rollback покрыт через clone-queries).
- **IN-03** (09-REVIEW, info): scripts/migrate.mjs CLI-хвост — `process.argv[1]` undefined кидает; необработанная ошибка открытия БД в CLI. Косметика хост-скрипта.
- **WR-01** исправлен c4b2e2d (Number.isSafeInteger гвард, 09-REVIEW-FIX.md: «requires human verification» — logic-guard, верифицируется тестами 8/8).
