---
phase: 03
plan: 01
subsystem: devices + device-schema
tags: [device-registry, keystone, device-schema, zod-whitelist, normalized-numbers, unique-constraints, pagination, russian-ui, tracer, tdd]
requires:
  - "Фаза 1: таблица devices (typed-колонки, UNIQUE serial/inventory normalized, CHECK статусов), device_types seed в 0000, lib/normalize.mjs"
  - "Фаза 2: дизайн-система (dialog/button/input/textarea/label), queries-конвенция, requireSession, zod-action-паттерн, smoke-скрипт-образец"
provides:
  - "lib/device-schema.ts — keystone (D-02): DEVICE_TYPES (4 типа, ru-имена), typeFields(typeKey) по field-таблице UI-SPEC, buildZodSchema(typeKey) strict-зод; единственный источник полей для формы и валидации (фаза 5 прочитает для фильтров)"
  - "db/queries/devices.ts — listDevices({type,page,pageSize})→{rows,total,page,pages} (join employees, RU-sort по модели + id), getDevice(id), createDevice/updateDevice — normalized-пара на каждой мутации, NULL-пара при пустом инвентарнике, UNIQUE → {code: serialNormalized|inventoryNormalized}; пути удаления нет"
  - "GET /devices (?type=…&page=N) — guard-first RSC: two-line rows (модель+пилюля / тип·серийник·инвентарник·держатель, mono-номера, truncate+title), dropdown-фильтр типа, пагинация 20 full-query-string, пустые состояния, pluralDevices-метка"
  - "Диалог «Новое устройство» — client island: тип-Select из typeConfigs-пропсов, пер-типовая секция key={typeKey} (reset без useEffect), скрытые inputs для select-значений, подсказка D-04 у периферии, скролл-тело с прижатым футером"
  - "app/(app)/devices/actions.ts — createDeviceAction/updateDeviceAction: requireSession первой строкой, zod = общие границы + strict per-type, whitelist без custody-колонок (grep status|currentEmployeeId = 0), edit не читает typeKey, UNIQUE-копи из UI-SPEC, refresh()"
  - "components/ui/{select,checkbox} (shadcn официальный реестр, без barrel-импортов); lib/ru.ts +pluralDevices"
  - "Навигация «Устройства» · «Сотрудники» с active-state (app/(app)/nav.tsx, usePathname); (app)/page.tsx → redirect('/devices')"
  - "scripts/smoke-devices.mjs — E2E: 307 без cookie, 200+зонд+CTA+пилюля, / → /devices, фильтр/clamp/enum-fallback матрица"
affects: [03-02 (карточка + edit-диалог от тех же queries/schema), фазы 4-6 (custody-действия поверх периметра whitelist; фильтры фазы 5 читают device_schema)]
tech-stack:
  added:
    - "shadcn select, checkbox (официальный реестр; Base UI primitives уже в зависимостях — новых пакетов нет)"
  patterns:
    - "keystone-модуль: поля + zod из одного источника; клиент получает только сериализуемые конфиги полей (server-serialization), zod-половина остаётся серверной"
    - "условные поля формы: remount секции по key={typeKey} вместо useEffect (rerender-derived-state-no-effect)"
    - "UNIQUE-коллизия → queries бросают {code: колонка} → action маппит на русскую копи-таблицу (бизнес-условие, не 500)"
    - "пер-типовый whitelist: типовые поля чужого типа не читаются из FormData вовсе (typeFields как обходчик whitelist)"
    - "select без нативной отправки формы → явный скрытый input с выбранным значением (урок combobox фазы 2)"
key-files:
  created:
    - lib/device-schema.ts
    - db/queries/devices.ts
    - "app/(app)/devices/page.tsx"
    - "app/(app)/devices/actions.ts"
    - "app/(app)/devices/device-dialog.tsx"
    - "app/(app)/devices/type-filter.tsx"
    - "app/(app)/devices/loading.tsx"
    - "app/(app)/devices/error.tsx"
    - "app/(app)/nav.tsx"
    - components/ui/select.tsx
    - components/ui/checkbox.tsx
    - scripts/smoke-devices.mjs
    - tests/device-schema.test.ts
    - tests/devices-queries.test.ts
  modified:
    - lib/ru.ts
    - "app/(app)/layout.tsx"
    - "app/(app)/page.tsx"
requirements-addressed: [REG-01, REG-02]
decisions:
  - "Сортировка списка — RU-сортировка по модели + id-tiebreaker (план-тест Ё-сортировки — обязательный acceptance), несмотря на «newest first» в Defaults UI-SPEC: план исполняемый контракт, UI-SPEC-дефолт перекрыт"
  - "zod-границы общих полей — по плану (модель 1..200, серийник 1..100, инвентарник 1..80); input maxLength 80 — по field-таблице UI-SPEC: схема строже UI только в сторону тампера"
  - "Фильтр-остров и навигационный остров вынесены в отдельные client-файлы (type-filter.tsx, nav.tsx): RSC не знает pathname, а active-state навигации требует usePathname"
  - "ramUpgraded пишется всегда для ноутбука (unchecked = 0): Base UI checkbox с name шлёт 'on' только в отмеченном состоянии — action маппит на 0/1"
  - "smoke-ассерт пагинации по статичным словам («Страница»/«Назад»/«Далее»): SSR-HTML режет интерполяции <!-- --> маркерами, «Страница 1 из» не является непрерывной строкой"
deviations:
  - "Нет — план исполнен полностью; type-filter.tsx и nav.tsx добавлены в рамках wildcard 'app/(app)/devices/*' и задачи «nav+active-state» (frontmatter files_modified их не перечислял — зафиксировано здесь)"
self-check:
  - "npx vitest run: 96 passed / 96 (базлайн 65 + 31 новых: schema-контракт + queries с UNIQUE/NULL/RU-sort); TDD: test(03-01) RED ebbd089 → feat(03-01) GREEN d4f4137"
  - "npm run build: exit 0, route table содержит /devices"
  - "node scripts/smoke-devices.mjs: exit 0 (307 периметр, 200+зонд, / → /devices, фильтр+clamp+enum-fallback)"
  - "node scripts/smoke-employees.mjs: exit 0 (регрессии нет)"
  - "grep-гейты: status|currentEmployeeId в devices/actions.ts = 0; h-[60px] в loading.tsx = 6 (≥1); barrel-импортов в select/checkbox нет; normalize-запись в обеих мутациях (×4 в queries)"
status: complete
---

# Phase 03 Plan 01: Tracer — device_schema + queries + список + диалог создания Summary

Вертикальный срез реестра устройств: keystone-модуль `device_schema` (единственный источник полей и валидации) → queries с normalized-инвариантами и UNIQUE-маппингом → guard-first RSC-список с фильтром по типу и пагинацией → диалог создания с пер-типовыми полями; периметр REG-04 (статус/держатель вне whitelist) под grep-гейтом; доказано 96 тестами (31 новый, TDD RED→GREEN) и smoke-скриптом.

## What Was Built

- **TDD (RED `ebbd089`):** `tests/device-schema.test.ts` (12 кейсов) — ровно 4 типа с ru-именами, точные наборы typeFields по field-таблице UI-SPEC (laptop: ramGb/ramUpgraded/ssdGb; monitor: screenDiagonal + свободный panelType max 40; dock: portCount; peripheral: обязательный peripheralKind с 5 фиксированными опциями), strict-whitelist buildZodSchema (чужие пер-типовые ключи отвергаются, положительные целые, диагональ с дробью, порт ≥ 1). `tests/devices-queries.test.ts` (19 кейсов) — normalized-пара пишется всегда (гомоглиф «С123»=«C123» → дубль через {code}), пустой инвентарник → NULL/NULL, update пересчитывает оба normalized и не трогает тип/статус, listDevices: фильтр по типу, clamp 0/-3/99, Ё-сортировка после Е, в модуле нет delete-пути.
- **GREEN `d4f4137`:** `lib/device-schema.ts` — иммутабельный чистый модуль без Next-импортов: `DEVICE_TYPES as const`, `typeFields()` (конфиги с label/type/required/group/options/maxLength/step/placeholder), `buildZodSchema()` через `z.strictObject` (trim остаётся action'у), `isDeviceTypeKey()` для серверной валидации параметров. `db/queries/devices.ts` — чистые sync-функции над db из @/db: listDevices (leftJoin сотрудников для держателя, count+clamp, replace Ё/ё→Е/е + id), getDevice, createDevice/updateDevice с `inventoryPair()` (пустая строка никогда не попадает в UNIQUE-индекс) и `uniqueCodeOf()` (SQLITE_CONSTRAINT_UNIQUE → {code} по имени колонки). `lib/ru.ts` — pluralDevices (Intl.PluralRules('ru')).
- **UI `15f8dcd`:** `actions.ts` — create/update действия: requireSession первой строкой (T-03-01), typeKey против DEVICE_TYPES до полей, payload собирается только из whitelist-ключей (commonPayload + typedPayload по typeFields), strict-схема = общие границы + buildZodSchema(typeKey), fieldErrors по копи-таблице UI-SPEC (число/дата/модель/серийник/вид), UNIQUE-коды → «Устройство с таким серийным/инвентарным номером уже есть», refresh() перед {ok}. `page.tsx` — searchParams Promise → enum+clamp, счётчик pluralDevices отражает фильтр, two-line rows со всеми шестью колонками D-05 (mono серийник/инвентарник, пилюля статуса, truncate+title), два пустых состояния, пагинация full-query-string. `device-dialog.tsx` — тип-Select с placeholder «Выберите тип», пер-типовая секция из typeConfigs-пропсов с key={typeKey}, поля типа рендерятся TypedField-свитчем (text/number/select/checkbox), скрытые inputs для typeKey и peripheralKind, подсказка D-04, футер «Не сохранять»/«Добавить устройство»/«Сохранение…». `type-filter.tsx` — Select-остров с router.push полного query string и сбросом на страницу 1. `nav.tsx`/`layout.tsx` — «Устройства» · «Сотрудники» с active-state; `page.tsx` → redirect('/devices'). `loading.tsx` (5 × h-[60px]) и `error.tsx` (retry-проп) в списочном сегменте (404-инвариант (card) не тронут — карточка в плане 03-02).

## TDD Gate Compliance

- `test(03-01)` RED `ebbd089` (2 файла, падение на отсутствующих модулях) предшествует `feat(03-01)` GREEN `d4f4137` — ворота соблюдены; UI-слой `15f8dcd` зафиксирован после зелёного полного набора (96/96).

## Verification Evidence

- `npx vitest run` → 96 passed (11 файлов), включая 31 новый кейс.
- `npm run build` → exit 0; в route table: `ƒ /devices`.
- `node scripts/smoke-devices.mjs` → exit 0: «307 → /login без cookie; 200 + „Смок Устройство“ + CTA + пилюля с cookie; / → 307 на /devices; фильтр type=laptop + „1 устройство“; type=zzz → все типы; page=99 клампится».
- `node scripts/smoke-employees.mjs` → exit 0 (сотрудники не регрессировали, включая nav-замену в шелле).
- Греп-гейты плана: whitelist без custody-колонок (0 совпадений), скелетоны h-[60px] (6), normalize в обеих мутациях (4), без barrel-импортов.
