---
phase: 01-foundation
verified: 2026-09-01T05:05:01Z
status: human_needed
score: 2/6 must-haves verified
behavior_unverified: 4
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 1/6
  gaps_closed:
    - "Неизвестный логин неотличим от неверного пароля (bcrypt.compare по фиктивному хешу той же cost) — закрыто коммитом 9246d7f: lib/dummy-hash.ts (cost-12), app/login/actions.ts (безусловное сравнение user?.passwordHash ?? DUMMY_HASH), tests/login-timing.test.ts (3 теста)"
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "SC1: любой адрес без сессии → страница входа; страницы, API, файлы недоступны без авторизации"
    test: "На живом сервере выполнить curl-матрицу README «Проверка периметра»: без сессии / → 307 на /login, /api/health → 307, /login → 200, /login-fake → 307"
    expected: "Редирект на /login для всех путей, кроме точного /login; ассеты (_next/static, _next/image, favicon.ico) доступны"
    why_human: "Нужен живой сервер; matcher-тесты проверяют конфиг, а не runtime-редирект; стек верификатором не запускается"
  - truth: "SC2: вход по логину+паролю — неверные не пускают (перебор ограничен), верные пускают; сессия переживает перезапуск браузера"
    test: "Браузерная приёмка плана 01-01: верные данные → каркас с «Выйти»; неверные → «Неверный логин или пароль»; 5 неудач → блок; перезапуск браузера → сессия жива"
    expected: "Поведение согласно must-have плана 01-01; HttpOnly-cookie на 30 дней"
    why_human: "E2E-путь Server Action тестом не покрыт; cookie-поведение реального браузера grep не видит"
  - truth: "SC4: бэкап создаётся автоматически по расписанию + восстановление отрепетировано хотя бы раз"
    test: "README шаги 2–3, 7–8: bash scripts/deploy.sh на сервере; crontab -l — ровно одна строка с scripts/backup.mjs; на следующее утро ./data/backups/<день>/ существует, integrity ok; серверная репетиция восстановления по процедуре"
    expected: "Расписание активно на сервере; копии появляются ежедневно; восстановление проходит"
    why_human: "Механизм поведенчески доказан (8 backup-тестов) и локальная репетиция исполнена (56504c8), но расписание активируется только деплоем на сервере (SSH — у оператора, D-08)"
  - truth: "SC5: приложение работает на внутреннем сервере одним контейнером; данные на томе переживают перезапуск"
    test: "README шаги 2, 9: docker compose up -d на сервере; :3000 отвечает; docker compose restart и down+up -d → учётка и данные на месте"
    expected: "Контейнер работает, стейт на томе переживает перезапуск"
    why_human: "Локальная контейнерная нога доказана (планы 04–05, in-container curl + restart-persistence), серверная — только на сервере"
prohibitions:  # ADR-550 D4: test-tier без проводного enforcement → unverified+flagged (fail-closed); judgment-tier → non-authoritative LLM-вердикт + flag
  unverified_flagged_count: 9
  human_review_recommended: true
  items:
    - statement: "01-01 P2: MUST NOT хранить/сравнивать пароль в открытом виде — только bcrypt cost 12"
      tier: test
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — единственные писатели password_hash: bcrypt.hash(password, 12) (create-admin.mjs:86, reset-admin.mjs:78); паттернов плейнтекст-сравнения в app/lib/scripts нет"
      enforcement: "нет выделенного теста"
    - statement: "01-01 P3: MUST NOT существовать веб-путь создания аккаунта/сброса пароля"
      tier: test
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — grep insert(users)/update(users) по app/ пуст; users трогают только CLI-скрипты"
      enforcement: "нет выделенного теста"
    - statement: "01-01 P5: MUST NOT полагаться на proxy как на единственную проверку — requireSession() в каждом мутирующем entry-point"
      tier: test
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied с известной Info-оговоркой — requireSession в app/(app)/page.tsx и app/api/health/route.ts; logout- action без guard-а (безвредно: деавторизует только собственную сессию)"
      enforcement: "нет выделенного теста"
    - statement: "01-02 P1: MUST NOT выполняться seed против production"
      tier: test
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — guard «must-run-first» в scripts/seed.mjs:9-10 (NODE_ENV=production → отказ)"
      enforcement: "нет выделенного теста"
    - statement: "01-02 P2: MUST NOT выводить введённый пароль в stdout/логи"
      tier: test
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — эхо ввода заглушено (WR-03, 8fe3a73); пароль живёт в промпте и хеше"
      enforcement: "нет выделенного теста"
    - statement: "01-04 P2: MUST NOT попадать в образ секретам и рабочим данным"
      tier: test
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — .dockerignore исключает data, .env, .planning, .claude (проверено содержимым)"
      enforcement: "нет выделенного теста"
    - statement: "01-04 P3: MUST NOT использоваться Alpine-база и разные Node-мажоры в стадиях"
      tier: test
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — один ARG NODE_VERSION=24.13.0-slim во всех трёх стадиях, alpine отсутствует, USER node"
      enforcement: "нет выделенного теста (docker build верификатором не запускается)"
    - statement: "01-02 P3: MUST NOT появляться автогенератор номеров как продуктовая возможность"
      tier: judgment
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — генерация только в seed-фикстурах (dev, D-11); в app/ генерации номеров нет"
      enforcement: "judgment — ручная проверка"
    - statement: "01-05 P1: MUST NOT выполнять репетицию восстановления на живом прод-томе под работающим контейнером"
      tier: judgment
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — выполненная репетиция локальная, по README-процедуре с остановленной стопкой (56504c8, README от 2026-09-01)"
      enforcement: "judgment — ручная проверка"
human_verification:
  - test: "Серверный деплой + расписание бэкапа (README «Приёмка фазы 1» шаги 2–3, 7): bash scripts/deploy.sh; crontab -l — ровно одна строка с scripts/backup.mjs; на следующее утро backups/<вчерашний день>/ существует и integrity ok"
    expected: "Приложение на :3000, cron установлен идемпотентно, ночная копия появляется"
    why_human: "SSH-доступ только у оператора (D-08); закрывает серверную ногу SC4 «по расписанию»"
  - test: "Браузерная приёмка входа (план 01-01 human-check): http://<server>:3000/ → редирект /login; верные данные → каркас с «Выйти»; перезапуск браузера → сессия жива"
    expected: "Редирект, вход, стойкость сессии (HttpOnly, 30 дней, lax)"
    why_human: "Реальный браузер + cookie-поведение; E2E Server Action тестом не покрыт"
  - test: "Негативный вход и перебор: неверный пароль → «Неверный логин или пароль»; 5 неудач → «Слишком много попыток…»; через 15 мин — снова можно; неизвестный логин отвечает за то же время, что неверный пароль"
    expected: "Generic-ошибка, блок на 5-й неудаче, окно истекает; timing неизвестного логина ≈ неверного пароля (код + тесты это обеспечивают)"
    why_human: "Живой end-to-end прогон Server Action"
  - test: "Curl-матрица периметра на сервере (README «Проверка периметра»): / → 307, /api/health → 307, /login → 200, /login-fake → 307"
    expected: "Default-deny работает на сервере так же, как в dev"
    why_human: "Нужен живой сервер"
  - test: "Серверная репетиция восстановления (README шаг 8): по процедуре «Восстановление (пошагово)» при остановленной стопке; integrity ok, учётка и контрольная запись на месте"
    expected: "Восстановление проходит; локальная репетиция 2026-09-01 — образец"
    why_human: "Состояние-переход на реальном томе сервера"
  - test: "Переживание перезапуска на сервере (SC5): docker compose restart и down+up -d → учётка и данные на месте, /login 200"
    expected: "Стейт на томе ./data:/app/data переживает перезапуск"
    why_human: "Локальное доказательство было; серверное — только на сервере"
  - test: "Обзор 9 помеченных prohibitions (см. frontmatter prohibitions): 7 test-tier без проводного enforcement + 2 judgment-tier; неавторитетные структурные вердикты — все «satisfied»"
    expected: "Человек подтверждает вердикты или заводит задачи (например, тест на guard seed-а и на содержимое PUBLIC_PATHS)"
    why_human: "Fail-closed протокол: тест-tier запрет без теста никогда не зелёный автоматически"
---

# Phase 1: Foundation — Verification Report

**Phase Goal:** Развёрнутый на внутреннем сервере каркас приложения, на котором данным можно доверять с первого дня: полная схема SQLite v1 (включая append-only `movements` и нормализованные номера), единый вход, авторизация на каждом маршруте, автоматические бэкапы с отрепетированным восстановлением.
**Verified:** 2026-09-01T05:05:01Z
**Status:** human_needed (0 провалов; серверная половина SC4–SC5 и живое поведение периметра/входа — спроектированная человеческая приёмка, README «Приёмка фазы 1», WINDOWS.md unrun-verify)
**Re-verification:** Yes — after gap closure (коммит 9246d7f)

## Re-verification Summary

Гэп предыдущего прогона (1 шт.) **закрыт и проверен независимо**. Регрессий не найдено: все ранее применённые фиксы (CR-01, CR-02, WR-01, WR-02, WR-03) на месте в коде, гарнитур 44/44 зелёный, все артефакты существуют и wired. Предыдущий warning «origin/main отстаёт на 6 коммитов» снят: `origin/main == main == 9246d7f` (`git rev-list --count origin/main..main` → 0). Предыдущий warning «README расходится с deploy.sh» снят: строки 156–157 теперь `git pull` → `npm ci`, как в скрипте.

## MVP-Mode Process Note (не гэп)

ROADMAP помечает фазу `mode: mvp`, но цель фазы не в формате User Story («As a …, I want to …, so that ….») — таблица «User Flow Coverage» поверх такой цели не строится. Верификация выполнена стандартным goal-backward методом по 5 success criteria дорожной карты. Расхождение уже эскалировано владельцу в предыдущем прогоне; фиксируется как процессная заметка: при желании — `/gsd mvp-phase 1` и re-verify.

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                                                                                | Status                         | Evidence                                                                                                                                                                                                                                                                          |
| -- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | SC1: Любой адрес без сессии → страница входа; страницы, API, файлы (будущие фото) недоступны без авторизации                                                           | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `proxy.ts` — default-deny: PUBLIC_PATHS = точный `/login`, matcher исключает только ассеты (7 matcher-тестов зелёные: ассеты вне периметра, `/login-fake`, `/api/health`, `/` внутри); `requireSession()` вторым слоем в `app/(app)/page.tsx` и `app/api/health/route.ts`. Живой 307-редирект верификатором не воспроизведён → Human items 2, 4 |
| 2  | SC2: Вход по логину+паролю: неверные не пускают (перебор ограничен), верные пускают; сессия переживает перезапуск браузера                                              | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Примитивы поведенчески протестированы и зелёные: session roundtrip/tamper/expiry/пустой-cookie (7), rate-limit 5-я неудача/окно/prune (5), timing-parity (3). E2E Server Action логин тестом не покрыт; браузерная стойкость — человек → Human items 2–3                                                                 |
| 3  | SC3: Все данные в одном SQLite-файле; первая миграция — полная схема v1: устройства, сотрудники, append-only movements, вложения, нормализованные номера с индексами   | ✓ VERIFIED                     | 8 schema-тестов зелёные (поведенческие: реальная БД из миграции — 7 таблиц, 4 device_types, UNIQUE serial/inventory_normalized с коллизиями, CHECK статуса, FK RESTRICT, INSERT ok + UPDATE/DELETE рвутся триггерами RAISE ABORT). Миграция `drizzle/0000_amusing_talon.sql` на месте; прагмы WAL/foreign_keys/busy_timeout в `db/index.ts` |
| 4  | SC4: Бэкап БД и загрузок создаётся автоматически по расписанию + восстановление отрепетировано хотя бы раз                                                             | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Механизм поведенчески доказан: 8 backup-тестов зелёные (снимок под WAL ловит -wal-коммиты, integrity_check копии, uploads, ротация ровно 30, идемпотентность дня, CR-02 retry, exit 1+stderr). Репетиция восстановления исполнена и задокументирована (README от 2026-09-01, шаги 1–9; commit 56504c8). НО расписание нигде не активно: `deploy.sh` на сервере не прогонялся, cron ставится им → Human items 1, 5 |
| 5  | SC5: Приложение работает на внутреннем сервере одним контейнером; данные на примонтированном томе переживают перезапуск                                                | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Артефакты верифицированы: Dockerfile (3 стадии, один ARG 24.13.0-slim, USER node, расширения better-sqlite3), compose.yml (3000:3000, env_file, `./data:/app/data`, unless-stopped), .dockerignore (data/.env/.planning/.claude). Локальная контейнерная половина доказана в планах 04–05; серверная — оператор → Human items 1, 6 |
| 6  | План 01-01: неизвестный логин неотличим от неверного пароля — bcrypt.compare по фиктивному хешу той же cost (гэп предыдущего прогона)                                 | ✓ VERIFIED                     | **Гэп закрыт (9246d7f), проверено независимо.** `app/login/actions.ts:47-50` — безусловное `bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)`, короткое замыкание исчезло; `!user \|\| !passwordOk` — единый путь отказа с одинаковым `recordFailure()` и ровно одним generic-текстом; `lib/dummy-hash.ts` — предвычисленный cost-12 хеш. `tests/login-timing.test.ts` 3/3 зелёные: `?? DUMMY_HASH` в источнике + старый short-circuit отсутствует (регресс-guard), хеш валиден и cost-12, не матчит произвольный пароль. Поведенческий спот-чек верификатора: compareSync по dummy 210.7ms vs реальному cost-12 хешу 212.7ms — неразличимо |

**Score:** 2/6 truths verified (4 present, behavior-unverified; 0 failed)

### Required Artifacts (quick regression — существование + базовая sanity; полный прогон 04:48)

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `proxy.ts` | default-deny периметр | ✓ VERIFIED | verifySession wired; PUBLIC_PATHS точный `/login`; matcher без api/uploads |
| `lib/session.ts` | jose-сессия, валидация AUTH_SECRET | ✓ VERIFIED | CR-01 fix на месте (MIN_SECRET_LENGTH=32, throw при первом использовании); 7 тестов зелёные |
| `lib/rate-limit.ts` | 5/15мин fixed window | ✓ VERIFIED | WR-01 fix на месте (prune в checkRateLimit:18-19); 5 тестов зелёные |
| `lib/auth.ts` | requireSession — второй слой | ✓ VERIFIED | В `app/(app)/page.tsx` и `app/api/health/route.ts` |
| `lib/normalize.mjs` / `.ts` | единая нормализация, 11 гомоглифов | ✓ VERIFIED | 6 тестов зелёные; wired в seed (import:6) |
| `lib/dummy-hash.ts` | cost-12 фиктивный хеш | ✓ VERIFIED | Новый (9246d7f); hashSync cost 12 при загрузке модуля; 3 теста |
| `db/schema.ts` + `drizzle/0000_amusing_talon.sql` | полная схема v1 | ✓ VERIFIED | 8 schema-тестов зелёные (триггеры RAISE(ABORT), UNIQUE normalized, CHECK, FK RESTRICT) |
| `db/index.ts` | drizzle + прагмы | ✓ VERIFIED | WAL/foreign_keys/busy_timeout (строки 5-7) |
| `app/login/{page,login-form,actions}.tsx/ts` | вход | ✓ VERIFIED | zod → rate-limit → DB → безусловный bcrypt; useActionState wired; generic-ошибка |
| `app/(app)/{page,actions}.tsx/ts` | защищённый каркас + logout | ✓ VERIFIED | requireSession + destroySession; экраны «фазы 2–6» — граница фазы, не стаб |
| `app/api/health/route.ts` | API за периметром | ✓ VERIFIED | requireSession внутри GET |
| `scripts/create-admin.mjs` / `reset-admin.mjs` | CLI-only аккаунт (D-02/D-13) | ✓ VERIFIED | bcrypt cost 12 (строки 86/78); mute эха (WR-03) |
| `scripts/seed.mjs` | dev-фикстуры (D-11) | ✓ VERIFIED | Guard production (строки 9-10); normalize wired |
| `scripts/backup.mjs` | ночной бэкап (D-05/06/07/14) | ✓ VERIFIED | CR-02 fix на месте (rmSync:94); cpSync только для uploads:79; 8 тестов зелёные |
| `scripts/deploy.sh` | одна команда деплоя (D-10) | ✓ VERIFIED | WR-02 порядок git pull → npm ci; cron `0 2 * * *` идемпотентно; bash -n OK |
| `Dockerfile` / `compose.yml` / `.dockerignore` | standalone-контейнер + том | ✓ VERIFIED | Один ARG 24.13.0-slim × 3 стадии, USER node; том и env_file; секреты вне контекста |
| `README.md` | quickstart, периметр, runbook, деплой, «Приёмка фазы 1» | ✓ VERIFIED | deploy-порядок синхронизирован со скриптом (156-157); репетиция отмечена 2026-09-01; чек-лист 2–8 не отмечены — по замыслу |
| `tests/*` (7 файлов) | тестовый гарнитур | ✓ VERIFIED | 44/44 в прогоне верификатора, включая login-timing 3/3 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `proxy.ts` | `lib/session.ts` | verifySession(SESSION_COOKIE) | ✓ WIRED | proxy.ts:3,11 + matcher-тесты |
| `app/login/actions.ts` | `lib/rate-limit.ts` | checkRateLimit до БД/bcrypt | ✓ WIRED | строки 34 → 37 → 47 |
| `app/login/actions.ts` | `lib/dummy-hash.ts` | `user?.passwordHash ?? DUMMY_HASH` | ✓ WIRED | новый линк (9246d7f), строки 8, 47-50 |
| `app/login/actions.ts` | `db/schema.ts` | select users by login | ✓ WIRED | drizzle eq(users.login) |
| `app/login/login-form.tsx` | `app/login/actions.ts` | useActionState(login) | ✓ WIRED | строка 7 |
| `db/index.ts` | `process.env.DATABASE_PATH` | new Database + прагмы | ✓ WIRED | foreign_keys = ON |
| `scripts/seed.mjs` | `lib/normalize.mjs` | import normalizeSerial/Inventory | ✓ WIRED | строка 6 |
| `scripts/reset-admin.mjs` | `users` | UPDATE password_hash WHERE id=1 | ✓ WIRED | строка 79 |
| `scripts/backup.mjs` | `DATA_DIR` / `db.backup()` | online backup API | ✓ WIRED | 8 тестов; cpSync только uploads |
| `compose.yml` | `./data:/app/data` | volumes | ✓ WIRED | строка 8 |
| `Dockerfile` | `node_modules/better-sqlite3`, `bcryptjs` | COPY в runner | ✓ WIRED | + USER node |
| `scripts/deploy.sh` | `scripts/backup.mjs` | cron `0 2 * * *` (строка 43) | ✓ WIRED | идемпотентная установка |
| `scripts/deploy.sh` | `drizzle/` | host-side drizzle-kit migrate | ✓ WIRED | никогда push |
| `git push` | `origin` | origin/main | ✓ WIRED | **снят предыдущий PARTIAL:** origin/main == main == 9246d7f, rev-list 0 |

### Data-Flow Trace (Level 4)

N/A — фаза не содержит UI, рендерящего динамические данные из БД (экраны — фазы 2–6). Единственный динамический стейт — `state.error` формы логина через useActionState — wired и рендерится.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Полный тестовый набор (один прогон) | `npx vitest run` | 7 файлов, 44/44 зелёные (schema 8, backup 8, session 7, normalize 6, proxy-matcher 7, rate-limit 5, **login-timing 3**) | ✓ PASS |
| Timing-parity (гэп 1) | node compareSync, cost 12 | dummy-hash 210.7ms vs реальный cost-12 хеш 212.7ms — неразличимо | ✓ PASS |
| Синхронизация canonical remote | `git rev-list --count origin/main..main` | 0 — все фиксы, включая 9246d7f, на origin | ✓ PASS |
| Синтаксис deploy.sh | `bash -n scripts/deploy.sh` | OK | ✓ PASS |
| Живая curl-матрица периметра | curl localhost:3000 | Стек не запущен — запускать сервисы верификатору нельзя | ? SKIP → Human items 2, 4 |

### Probe Execution

SKIPPED — проектных проб (`scripts/*/tests/probe-*.sh`) нет, PLAN/SUMMARY проб не декларируют.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
| ----------- | -------------- | ----------- | ------ | -------- |
| ACC-01 | 01-01, 01-02 | Вход по логину+паролю (один аккаунт, session cookie) | ✓ SATISFIED | Форма+Server Action+jose-сессия 30d; rate-limit и timing-parity протестированы; браузерный уровень → Human items 2–3 |
| ACC-02 | 01-01, 01-04, 01-05 | Все страницы, uploads и API заблокированы без аутентификации | ✓ SATISFIED | Default-deny proxy + requireSession вторым слоем; matcher-тесты зелёные; живая матрица → Human items 2, 4 |
| ACC-03 | 01-01, 01-02, 01-03, 01-04, 01-05 | Данные в одном SQLite + автоматический бэкап-рутина | ✓ SATISFIED | Единый app.db на томе; backup.mjs протестирован; репетиция исполнена; расписание на сервере → Human items 1, 5 |

Орфанированных требований нет: REQUIREMENTS.md отображает на фазу ровно ACC-01..03, и все три объявлены во frontmatter планов (01-01: ACC-01..03; 01-02: ACC-01,03; 01-03: ACC-03; 01-04: ACC-02,03; 01-05: ACC-02,03).

### Prohibition Verification (ADR-550 D4)

**Wired enforcement найден — 6 запретов VERIFIED:** 01-01 P1 generic-ответ (login-timing тесты), 01-01 P4 allowlist (proxy-matcher: ассеты вне, `/login-fake`/`/api/health`/`/` внутри периметра), 01-01 P6 append-only movements (schema-тесты: UPDATE/DELETE → RAISE ABORT), 01-03 P1 без копирования живых файлов БД (backup-тест «captures commits still living in -wal» — дискриминатор db.backup vs cp + cpSync только для uploads), 01-03 P2 fail-loudly (backup-тест: exit 1 + stderr), 01-04 P1 без новых публичных маршрутов (proxy-matcher /api/health).

**9 запретов flagged (unverified, fail-closed)** — 7 test-tier без проводного enforcement + 2 judgment-tier; неавторитетные структурные вердикты все «satisfied», полный список в frontmatter `prohibitions`. Никогда не зелёные автоматически → Human item 7.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | Гэпов и регрессий не найдено | — | — |
| `scripts/deploy.sh` | 16 | echo «корпоративный GitLab, D-15» — канонический remote с 2026-09-01 приватный GitHub (решение владельца задокументировано в README:133 и WINDOWS item 3) | ℹ️ Info | Косметика: README синхронизирован, echo — нет |
| `app/(app)/actions.ts` | 6 | logout без requireSession | ℹ️ Info | Безвредно: действие только деавторизует собственную сессию; strict-буква запрета P5 шире |
| `scripts/seed.mjs` + `Dockerfile` | — | seed.mjs в контейнере падает ERR_MODULE_NOT_FOUND (review IN-03) | ℹ️ Info | Seed в прод запрещён by design; мёртвый груз в образе |
| `db/schema.ts` | 121, 143 | event_type/kind без CHECK (review IN-01) | ℹ️ Info | Запретить в следующей миграции — append-only не даст почистить мусор |
| `data/backups/` | — | Пуста: физический артефакт репетиции удалён при последующих прогонах | ℹ️ Info | Доказательство — README-лог 2026-09-01 + commit 56504c8; до серверной приёмки копий нет |

Debt-marker gate: TBD/FIXME/XXX/HACK в файлах фазы — 0 (совпадение «XXXX» в seed.mjs:82 — литерал формата серийника `SN-XXXXNN`, не маркер долга). Стабов нет. Предыдущие warnings (unpushed fixes, README deploy-order) — **сняты**.

### Deferred Items

Нет — ни один из открытых предметов не покрывается целями/критериями фаз 2–6 (Step 9b проверен: фазы 2–6 — сотрудники/реестр/перемещения/поиск/дашборд; серверной приёмки, auth-механики и backup-расписания там нет). Серверная приёмка — спроектированный human follow-up, tracked WINDOWS.md item 4 (unrun-verify).

### Human Verification Required

Спроектированная end-of-phase приёмка (human_verify_mode, README «Приёмка фазы 1», WINDOWS.md unrun-verify) + флаги prohibitions:

1. **Серверный деплой + расписание** (README шаги 2–3, 7): `bash scripts/deploy.sh`; `crontab -l` — ровно одна строка с `scripts/backup.mjs`; на следующее утро `./data/backups/<вчерашний день>/` существует и integrity ok. Закрывает серверную ногу SC4.
2. **Браузерная приёмка входа** (план 01-01 human-check): `/` → редирект `/login`; верные данные → каркас с «Выйти»; перезапуск браузера → сессия жива.
3. **Негативный вход и перебор**: неверный пароль → «Неверный логин или пароль»; 5 неудач → блок; через 15 мин — снова можно; неизвестный логин отвечает за то же время, что неверный пароль.
4. **Curl-матрица периметра на сервере** (README «Проверка периметра»): `/` → 307, `/api/health` → 307, `/login` → 200, `/login-fake` → 307.
5. **Серверная репетиция восстановления** (README шаг 8): по процедуре «Восстановление (пошагово)» при остановленной стопке; integrity ok, учётка и контрольная запись на месте.
6. **Переживание перезапуска на сервере** (SC5): `docker compose restart` и `down`+`up -d` → учётка и данные на месте, `/login` 200.
7. **Обзор 9 помеченных prohibitions** (frontmatter `prohibitions`): подтвердить структурные вердикты («satisfied») или завести задачи (кандидаты: тест на seed-guard, тест на содержимое PUBLIC_PATHS).

### Gaps Summary

Гэпов нет. Гэп предыдущего прогона закрыт коммитом 9246d7f и подтверждён независимо: безусловный bcrypt.compare по предвычисленному cost-12 dummy-хешу (полное чтение actions.ts — иных путей мимо сравнения нет), регресс-тест против возврата short-circuit, поведенческий спот-чек верификатора (210.7ms vs 212.7ms — неразличимо), гарнитур 44/44 зелёный. Оба warning-а предыдущего прогона сняты: origin/main синхронизирован (0 впереди), README deploy-порядок совпадает со скриптом.

Кодовая основа фазы крепкая: все 5 review-фиксов (CR-01, CR-02, WR-01, WR-02, WR-03) на месте в коде и покрыты регресс-тестами, append-only/нормализация/периметр поведенчески протестированы, запреты с проводным enforcement — зелёные.

Статус `human_needed`, а не `passed`, по двум причинам: (а) 4 истины — present-but-behavior-unverified (живой редирект периметра, E2E-логин, активное расписание бэкапа, серверное переживание перезапуска) — это спроектированная серверная приёмка оператора (SSH у оператора, D-08; чек-лист в README делает её проверяемой; WINDOWS.md item 4); (б) 9 запретов помечены fail-closed протоколом как непроверенные автоматикой. Процессная заметка: `mode: mvp` при не-User-Story цели — эскалировано ранее, не гэп.

---

_Verified: 2026-09-01T05:05:01Z_
_Verifier: Claude (gsd-verifier)_
