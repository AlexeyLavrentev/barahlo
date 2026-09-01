---
phase: 01
slug: foundation
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-09-01
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Браузер ↔ приложение | единственный оператор из офисной LAN, plain HTTP (D-04) | учётные данные, сессия-cookie |
| proxy.ts ↔ защищённая зона | default-deny периметр + requireSession() во втором слое | все маршруты, включая /api/* |
| Приложение ↔ SQLite (volume) | единственный файл данных ./data/app.db, WAL | устройства, сотрудники, movements (append-only) |
| cron/CLI ↔ каталог данных | фоновые скрипты пишут рядом с живой БД | бэкап-копии |
| Рабочая станция ↔ remote | приватный GitHub (решение владельца 2026-09-01, замена GitLab из D-15 — интенция D-15 сохранена) | код + .planning/, без .env и data/ |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-01-01 | Spoofing | app/login/actions.ts | high | mitigate | rate-limit 5/15мин до bcrypt и БД (D-03); generic-ошибка; dummy-hash тайминг-паритет (9246d7f) | closed |
| T-01-02 | Info Disclosure / EoP | proxy.ts + requireSession | high | mitigate | default-deny matcher; requireSession в странице/действии/роуте; curl-матрица 307/200 | closed |
| T-01-03 | Spoofing | lib/session.ts cookie | medium | mitigate | HttpOnly + SameSite=Lax + HS256 jose; AUTH_SECRET ≥32 с валидацией (CR-01, 693a5ce) | closed |
| T-01-04 | Tampering (CSRF) | login Server Action | medium | mitigate | SameSite=Lax + same-origin Origin-проверка Server Actions | closed |
| T-01-05 | Tampering | db-запросы | medium | mitigate | только параметризованные Drizzle-запросы; db.exec — доверенные миграции | closed |
| T-01-06 | Repudiation | movements | high | mitigate | триггеры RAISE(ABORT) на UPDATE/DELETE; тест schema.test.ts | closed |
| T-01-07 | DoS | rate-limit in-memory | low | accept | один пользователь, доверенная LAN; сброс рестартом задокументирован | closed |
| T-01-SC | Tampering | npm-зависимости | medium | mitigate | Package Legitimacy Audit (VERIFIED/Approved); версии pinned, lockfile в git | closed |
| T-02-01 | Spoofing | scripts/reset-admin.mjs | medium | mitigate | интерактивный запуск на сервере; bcrypt cost 12; минимум 8 символов | closed |
| T-02-02 | Info Disclosure | CLI-вывод | low | mitigate | эхо пароля заглушено (WR-03, 8fe3a73; pty-проверено); хеш не выводится | closed |
| T-02-03 | Tampering | seed против прода | medium | mitigate | двойной guard: NODE_ENV=production → exit 1; непустая база → exit 1 | closed |
| T-02-SC | Tampering | новые зависимости | low | accept | faker отклонён; PRNG-генератор 10 строк в seed.mjs | closed |
| T-03-01 | Destruction (A) | scripts/backup.mjs | high | mitigate | db.backup() online API + integrity_check копии exit 1 (D-14); cleanup частичной папки (CR-02, f702ab4) | closed |
| T-03-02 | Destruction (A) | ротация | medium | mitigate | удаление только внутри backups/, старше 30 свежих; тест границы | closed |
| T-03-03 | Info Disclosure | stdout/stderr | low | mitigate | только пути и статусы; секретов нет | closed |
| T-03-04 | DoS | забитый диск тома | low | accept | 30 копий = единицы МБ; мониторинг диска вне рамок фазы | closed |
| T-04-01 | Info Disclosure / EoP | периметр в контейнере | high | mitigate | тот же proxy+requireSession; curl-матрица в контейнере (307/200) | closed |
| T-04-02 | Tampering | supply chain при сборке | medium | mitigate | audit пакетов; npm ci по lockfile; без postinstall у ключевых пакетов | closed |
| T-04-03 | EoP | процесс в контейнере | medium | mitigate | USER node (uid 1000) + chown /app/data | closed |
| T-04-04 | Info Disclosure | секреты в образе | medium | mitigate | .env и data/ в .dockerignore; AUTH_SECRET только в .env на сервере | closed |
| T-04-05 | Destruction (A) | том ./data при пересборке | high | mitigate | rebuild не касается ./data; generate+migrate, никогда push | closed |
| T-04-06 | DoS | cron при лежащей стопке | low | accept | host-cron падает громко в вывод cron | closed |
| T-05-01 | Destruction (A) | репетиция на проде | high | mitigate | запрет на живом томе под контейнером; локальная репетиция 2026-09-01 пройдена (56504c8); серверная — по README шаг 8 | closed |
| T-05-02 | Info Disclosure | код в remote | medium | mitigate | приватный репозиторий; .env/data/ в .gitignore+.dockerignore; .planning/ не попадает в публичные зеркала | closed |
| T-05-03 | Repudiation | расхождение README с реальностью | medium | mitigate | расхождения чинятся тем же коммитом (deploy-порядок исправлен) | closed |
| T-05-SC | Tampering | push не в тот remote | low | accept | явный URL; ошибка авторизации возвращается человеку | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-01-07 | in-memory rate-limit сбрасывается рестартом; один пользователь в доверенной LAN | Владелец (дискреция D-03, CONTEXT.md) | 2026-08-31 |
| AR-02 | T-02-SC | без новых зависимостей; собственный PRNG в seed | План 01-02 (accept) | 2026-08-31 |
| AR-03 | T-03-04 | забитый диск тома — мониторинг вне рамок фазы | План 01-03 (accept) | 2026-08-31 |
| AR-04 | T-04-06 | cron при лежащей стопке падает громко | План 01-04 (accept) | 2026-08-31 |
| AR-05 | T-05-SC | push только в явно заданный remote | План 01-05 (accept) | 2026-08-31 |
| AR-06 | T-05-02 | remote — приватный GitHub вместо GitLab из D-15; интенция (приватность) сохранена, решении владельца от 2026-09-01 | Владелец | 2026-09-01 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-01 | 26 | 26 | 0 | orchestrator (L1 grep-depth, ASVS 1; подтверждения: vitest 44/44, gsd-verifier (2 прогона), gsd-code-fixer (CR-01/02, WR-01..03), gsd-code-reviewer, UAT 7/7) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-01
