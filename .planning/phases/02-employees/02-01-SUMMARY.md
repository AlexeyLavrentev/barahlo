---
phase: 02
plan: 01
subsystem: employees + design-system
tags: [shadcn, base-ui, design-tokens, employees, server-actions, sqlite, pagination, russian-ui, tracer]
requires:
  - "Фаза 1: схема employees/departments (0000), requireSession, proxy-периметр, vitest-гарнитур"
provides:
  - "Дизайн-система: components.json + components/ui/{button,input,label,badge,dialog,combobox} (Base UI), lib/utils cn()"
  - "Токены UI-SPEC в app/globals.css (@theme): page/surface/ink/ink-secondary/hairline/accent/destructive + системный шрифт + light-only + reduced-motion/transparency"
  - "Шелл app/(app)/layout.tsx — sticky 48px бар (Учёт техники / Сотрудники / Выйти), контент max-w-3xl"
  - "db/queries/employees.ts — listEmployees/getEmployee/listDepartments/resolveDepartmentId/createEmployee/updateEmployee/setEmployeeArchived (чистые sync-функции)"
  - "lib/ru.ts — pluralEmployees (Intl.PluralRules('ru')), ruCollator"
  - "GET /employees (?filter=active|archive&page=N) — RSC-список 20/стр + диалог создания сотрудника (Server Actions + refresh)"
  - "scripts/smoke-employees.mjs — E2E: 307→/login без cookie, 200 + зонд с minted jose-cookie"
affects: [02-02, 02-03, phases 3-6 (дизайн-система, queries-конвенция, plural/collator)]
tech-stack:
  added:
    - "shadcn 4.19.1 (CLI, style base-nova) + @base-ui/react 1.7.0 + lucide-react 1.39.0"
    - "clsx, tailwind-merge, class-variance-authority, tw-animate-css (конвенция shadcn cn/cva)"
  patterns:
    - "queries-модуль: чистые sync-функции над db из @/db, без framework-импортов → тестируется на temp-БД через db.$client"
    - "Server Action = requireSession → zod safeParse → queries → refresh() → {ok}"
    - "RU-сортировка в SQL: replace(replace(name,'Ё','Е'),'ё','е') + id-tiebreaker; Intl.Collator('ru') — только клиент"
    - "Пресс-фидбек active:scale-[0.97] duration-100 ease-out; веса только 400/600"
key-files:
  created:
    - components.json
    - components/ui/button.tsx
    - components/ui/input.tsx
    - components/ui/label.tsx
    - components/ui/badge.tsx
    - components/ui/dialog.tsx
    - components/ui/combobox.tsx
    - components/ui/input-group.tsx
    - components/ui/textarea.tsx
    - lib/utils.ts
    - "app/(app)/layout.tsx"
    - "app/(app)/employees/page.tsx"
    - "app/(app)/employees/actions.ts"
    - "app/(app)/employees/employee-dialog.tsx"
    - db/queries/employees.ts
    - lib/ru.ts
    - scripts/smoke-employees.mjs
    - tests/employees-queries.test.ts
    - tests/ru.test.ts
  modified:
    - app/globals.css
    - app/layout.tsx
    - "app/(app)/page.tsx"
    - package.json
    - package-lock.json
decisions:
  - "shadcn init v4.19.1 с -b base ТРЕБУЕТ именованный пресет (nova…rhea) — взят дефолтный nova; каждый токен затем перекрыт UI-SPEC в globals.css, light-only сохранён (отклонение зафиксировано)"
  - "Нативный Base UI combobox подтверждён (--dry-run): ComboboxList/Item принимают произвольных детей → закреплённый «Создать „X“» ложится чисто; фолбэк popover+command не понадобился"
  - "Семантика shadcn ретаргетнута на палитру UI-SPEC: --primary/--ring/--accent = #0071E3 — сгенерированные компоненты наследуют контракт вместо борьбы с ним"
  - "Диалог отделения — пока текстовый Input имени отдела (контракт departmentName не меняется; combobox в 02-03 — чистая UI-замена)"
  - "smoke-скрипт исполняет миграцию сам: сегменты 0000 начинаются с комментариев (-- триггеры/сид) — сначала чистка комментариев, потом exec"
metrics:
  duration: "25 min"
  completed: 2026-09-01
  tasks: 2
  files: 22
status: complete
---

# Phase 02 Plan 01: Tracer — дизайн-система + «диалог → действие → SQLite → список» Summary

Дизайн-система (shadcn Base UI + 7 токенов UI-SPEC + системный шрифт + шелл 48px) и полный вертикальный срез: клиентский диалог → Server Action (requireSession + zod + refresh) → транзакция SQLite (отдел+сотрудник атомарно, UNIQUE-гонка) → RSC-список 20/стр с русской Ё-сортировкой, плюралами и пагинацией; доказано 65 тестами (21 новых) и smoke-скриптом (307 периметр / 200 рендер).

## What Was Built

- **Задача 2 (авто, коммит 07de120):** `npx shadcn init -b base` (CLI v4.19.1; см. отклонение про пресет) + `add -y button input label badge dialog combobox` (+ input-group/textarea транзитивно; @base-ui/react и lucide-react поставил CLI, руками не ставились). `--dry-run` подтвердил нативный combobox (Combobox/Content/List/Item с произвольными детьми) — фолбэк popover+command не нужен, проверка `[ -f components/ui/combobox.tsx ]` зелёная без правок. globals.css: 7 токенов UI-SPEC в `@theme` (Tailwind эмитит их на :root → работают и `var()`, и утилиты bg-page/text-ink/…), системный шрифт-стек в --font-sans, Geist Sans удалён (latin-only, нет кириллицы), Geist Mono сохранён как --font-mono, тёмной media-схемы нет (light-only; инертный `.dark`-класс shadcn оставлен), global-блоки prefers-reduced-motion (кроссфейды ≤200ms, transform не тронут — Base UI позиционирует попапы трансформами) и prefers-reduced-transparency (.app-bar сплошной белый). Семантика shadcn ретаргетнута (--primary/--ring/--accent = #0071E3, радиусы 8/16px) и компоненты приведены к контракту: кнопки — веса 400/600, hover #0077ED, active:scale-[0.97], новый size xl (h-11); диалог — scrim 0.3, панель rounded-2xl, 200ms zoom-96 туда-обратно, заголовок 20/600, футер без серой полосы; label — 400. Шелл `app/(app)/layout.tsx`: await requireSession() + sticky h-12 bg-white/70 backdrop-blur-md border-black/5, «Учёт техники / Сотрудники / Выйти» (существующий logout), контент mx-auto max-w-3xl px-4 md:px-6 py-8. `app/(app)/page.tsx` → redirect('/employees').
- **Задача 3 (tracer, TDD):** RED `ca796a4` — 2 тест-файла (21 кейс) падают на отсутствующих модулях. GREEN `a37cfee`: `db/queries/employees.ts` — первый queries-модуль (чистые sync-функции, ноль framework-импортов): listEmployees (innerJoin, фильтр active|archive, RU sort-key replace Ё/ё→Е/е + id-tiebreaker, limit/offset, кламп страницы в [1, pages], отдельный count()), getEmployee, listDepartments, resolveDepartmentId (select → insert returning → catch SQLITE_CONSTRAINT_UNIQUE → re-select), createEmployee/updateEmployee (одна синхронная db.transaction: отдел+сотрудник атомарно; update на чужой id не создаёт строк), setEmployeeArchived — удаляющего пути нет нигде (EMP-03). `lib/ru.ts` — pluralEmployees + ruCollator. `employees/actions.ts` — create/update/setEmployeeArchivedAction: requireSession первой строкой, zod-whitelists ({name 1..100, departmentName 1..80} / {id} / {id, archived-enum}), русские полевые ошибки из копи-таблицы, generic «Не удалось сохранить…», refresh() перед {ok}. `employees/page.tsx` — RSC: await searchParams (Promise), фильтр через enum, page через Number+clamp, счётчик pluralEmployees, segmented «Активные/Архив» (полный query-string, сброс страницы), карточка rounded-2xl ring-hairline со строками min-h-11 «имя · отдел» (truncate+title, ChevronRight 16 #C7C7CC), «Назад/Далее/Страница N из M». `employee-dialog.tsx` — useActionState, Dialog max-w-md p-6, поля Имя/Отдел (текстовый Input с контрактом departmentName), ошибки #D70015 под полем + role=alert, закрытие по state-ok (новая идентичность объекта на каждый ответ действия). `scripts/smoke-employees.mjs` — temp-БД ← 0000 (сегменты с комментариями чистятся перед exec) + зонд «Смок Сотрудник» → next start :3117 → 307/Location-/login без cookie, SignJWT {userId:1} HS256 → 200 + зонд в HTML; exit 0.

## TDD Gate Compliance

- `test(02-01)` RED `ca796a4` предшествует `feat(02-01)` GREEN `a37cfee` — ворота соблюдены (2 файла красные на отсутствующих модулях → 21 зелёный).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shadcn init -b base требует именованный пресет (research A2 неверен для CLI 4.19.1)**
- **Found during:** Task 2 (`npx shadcn@latest init -b base -y`)
- **Issue:** CLI v4.19.1 интерактивно требует пресет (nova/vega/maia/…/rhea); `-p none` и `-p ""` отклоняются («Invalid preset»). Research-допущение «init с -b base непрерывен и без пресета» не соответствует установленной версии.
- **Fix:** `-p nova` (дефолт CLI; Lucide/Geist — иконки совпадают с UI-SPEC, шрифт всё равно перекрывается системным стеком). Контракт не пострадал: каждый токен перекрыт UI-SPEC в globals.css (что план и предписывал), светлая тема сохранена, `prefers-color-scheme` = 0. Инертный `.dark`-блок shadcn оставлен (класс нигде не активируется; удаление ломает dark:-варианты в сгенерированном коде).
- **Files modified:** components.json (style base-nova), app/globals.css
- **Commit:** 07de120

**2. [Rule 2 - Contract] Сгенерированные компоненты приведены к UI-SPEC (веса/ховер/пресс/радиусы/scrim)**
- **Found during:** Task 2
- **Issue:** сток nova тянет font-medium (вес 500 — запрещён контрактом), hover:bg-primary/80 (вместо #0077ED), h-8 без 44px-CTA, диалог bg-black/10 + rounded-xl (14px) + 100ms, футер с серой полосой.
- **Fix:** button.tsx (веса 400/600 по вариантам, hover #0077ED, active:scale-[0.97] duration-100 ease-out, size xl = h-11), dialog.tsx (scrim 0.3, rounded-2xl, 200ms zoom-96 симметрично, title text-xl font-semibold tracking-tight, футер без полосы), label.tsx (400 — form labels по UI-SPEC это 14/400). Остальные компоненты (badge/chip) правятся на местах использования в 02-02/02-03.
- **Files modified:** components/ui/{button,dialog,label}.tsx
- **Commit:** 07de120

**3. [Rule 3 - Blocking] Локальный .env указывал DATABASE_PATH=/app/data/app.db (docker-путь) — сборка падала на collect page data**
- **Found during:** Task 3 (`npm run build`: «Cannot open database because the directory does not exist»)
- **Issue:** /employees — первая RSC-страница, импортирующая @/db на уровне модуля; db/index.ts открывает БД при импорте, а локальный .env содержал docker-путь /app/data (на macOS каталога нет). Фаза 1 не спотыкалась: /login не импортирует db в server-модуле.
- **Fix:** .env приведён к локальным дефолтам .env.example (DATABASE_PATH=./data/app.db, DATA_DIR=./data). Файл gitignored — в коммит не входит. Прод-путь в Docker задаётся env контейнера и не зависит от этого файла.
- **Files modified:** .env (локально, без коммита)
- **Commit:** — (environment fix)

**4. [Rule 1 - Bug] smoke-скрипт пропускал сегменты миграции, начинающиеся с комментария**
- **Found during:** Task 3, до запуска (проверка 0000_amusing_talon.sql)
- **Issue:** сегменты после `--> statement-breakpoint` открываются комментарием («-- Append-only guards…», «-- Seed device_types») перед настоящим statement — наивный skip-by-first-line выбросил бы триггеры и сид.
- **Fix:** чистка строк-комментариев внутри сегмента, exec остатка.
- **Files modified:** scripts/smoke-employees.mjs
- **Commit:** a37cfee

**5. [Rule 1 - Bug] lib/ru.ts: TS7053 на индексации EMPLOYEE_FORMS типом LDMLPluralRule**
- **Found during:** Task 3 (npm run build)
- **Issue:** Intl.LDMLPluralRule включает zero/two/other — карта без них не проходит strict-индексацию.
- **Fix:** Record<Intl.LDMLPluralRule, string> с полным набором ключей (для 'ru' выбираются только one/few/many).
- **Files modified:** lib/ru.ts
- **Commit:** a37cfee

### Осознанные промежуточные состояния (по плану, не отклонения)
- Ссылки строк ведут на /employees/[id], которого ещё нет (404 до 02-02); пустые состояния и combobox отдела — 02-03; рестайл логина — 02-03. Проверка `[ -f components/ui/combobox.tsx ]` из acceptance прошла как есть — условная правка чека не понадобилась (нативный combobox выбран).

## Verification Results

- `npx vitest run` → **65/65 зелёные** (44 базовых + employees-queries 13 + ru 8)
- `npm run build` → зелёный; маршрут /employees зарегистрирован (ƒ dynamic)
- `node scripts/smoke-employees.mjs` → exit 0: без cookie 307 → /login; с minted-cookie 200 и «Смок Сотрудник» в HTML
- Гейты дизайна: `--color-accent: #0071E3` / `--color-page: #F5F5F7` в globals.css; prefers-color-scheme = 0; в app/(app)/ нет font-medium и полушаговых py/px/mt/mb-.5
- Tracer-гейт после GREEN-коммита: вит.test(2 файла) + build + smoke повторно — всё зелёное

## Known Stubs

Нет. Диалог создания полностью функционален (текстовый Input отдела — осознанный контрактный шаг к combobox 02-03, данные идут через тот же resolveDepartmentId).

## Authentication Gates

Не встречались (Task 1 — плановый blocking-human чекпоинт легитимности пакетов, одобрен пользователем до старта).

## Deferred Issues

- Локальный .env был переключён на docker-пути когда-то до этой сессии (вероятно, тесты деплоя 01-04): стоит однажды решить, где каноничное место локальных значений (сейчас восстановлены дефолты .env.example).
- `shadcn` npm-пакет CLI поставил себя в runtime-dependencies (его конвенция); при желании можно перенести в devDependencies в фазе чистки.

## Self-Check: PASSED

- Файлы: components.json, components/ui/* (8), app/(app)/layout.tsx, app/(app)/employees/{page,actions,employee-dialog}.tsx, db/queries/employees.ts, lib/ru.ts, scripts/smoke-employees.mjs, tests/{employees-queries,ru}.test.ts — FOUND
- Коммиты: 07de120, ca796a4, a37cfee — FOUND в git log
