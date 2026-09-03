---
phase: 03-device-registry
verified: 2026-09-02T10:57:27Z
status: passed
score: 11/14 must-haves verified
behavior_unverified: 3
overrides_applied: 0
overrides: []
re_verification: null
gaps: []
deferred:

  - truth: "Статус и держатель меняются только действиями выдачи/возврата/ремонта/списания (сейчас — только просмотр: пилюля/строка в списке и карточке)"
    addressed_in: "Phase 4"
    evidence: "ROADMAP SC4: «состояние меняется только действиями… (строятся в Фазе 4)»; REQUIREMENTS.md: REG-04, MOVE-01..05 → Phase 4"

  - truth: "Секция карточки «История перемещений» — placeholder «Здесь появится история выдач и возвратов.»"
    addressed_in: "Phase 4"
    evidence: "REQUIREMENTS.md: MOVE-04 (append-only timeline) → Phase 4; план 03-02 задачa 1 прямо назначает placeholder фазе 4"

  - truth: "Секция карточки «Фото» — placeholder «Здесь появятся фотографии устройства.»"
    addressed_in: "Phase 4"
    evidence: "REQUIREMENTS.md: REG-05 (фото на карточке) → Phase 4; план 03-02 — placeholder по UI-SPEC «Card placeholders»"

  - truth: "Поиска по списку устройств нет (ни клиентского, ни серверного)"
    addressed_in: "Phase 5"
    evidence: "REQUIREMENTS.md: FIND-01..04 → Phase 5; граница фазы 3 зафиксирована в CONTEXT deferred"

  - truth: "Гарантия до — без цветовой семантики (нейтральная строка карточки)"
    addressed_in: "Phase 5"
    evidence: "REQUIREMENTS.md: WAR-01 → Phase 5; комментарий в (card)/devices/[id]/page.tsx:267 и UI-SPEC"
behavior_unverified_items:

  - truth: "SC1: пользователь создаёт устройство любого из 4 типов через диалог — форма показывает поля именно этого типа; смена типа меняет набор и сбрасывает значения"
    test: "В браузере: «Добавить устройство» → выбрать каждый из 4 типов → наблюдать пер-типовую секцию; сменить тип повторно → вернуть ноутбук, заполнить, сохранить"
    expected: "Секция «Характеристики типа» показывает поля выбранного типа (ноутбук: RAM/флаг/SSD; монитор: диагональ/матрица; док: порты; периферия: обязательный «Вид» + подсказка D-04 у серийника); после смены типа значения предыдущего типа не наследуются; после сохранения диалог закрывается, устройство в списке без F5, счётчик обновлён"
    why_human: "Клиентский раундтрип useActionState → Server Action → refresh() и динамический ре-рендер по key={typeKey} ни одним автотестом не проведены; smoke-зонд создаётся прямой DB-вставкой мимо диалога"

  - truth: "Диалог: интерактивное поведение пер-типовой секции (remount по key при смене типа, скрытые inputs select-значений, дважды-сабмит невозможен)"
    test: "В диалоге выбрать «Периферия» → выбрать «Вид» → сменить тип на «Монитор» и обратно → сохранить; попытаться двойным кликом отправить форму"
    expected: "Выбор «Вида» не теряется и не протекает в чужой тип; после смены типа select «Вид» пуст; кнопка disabled на «Сохранение…» — повторный сабмит невозможен"
    why_human: "Remount-семантика и состояние портала наблюдаются только в живом браузере; код присутствует и структурно верен, но интерактив не упражнен"

  - truth: "Длинные модель/серийник не ломают двухстрочную строку списка и диалог (long-text backstop — заявлен планом ручным UAT)"
    test: "Создать устройство с моделью 200 символов и серийником 100 символов; открыть список и диалог редактирования"
    expected: "Обе линии строки обрезаются с многоточием, высота строки не меняется, max-w-md диалога не ломается; полные данные в title-атрибуте и на карточке"
    why_human: "Held-out визуальный тест из UI Considerations; grep доказывает truncate+title, но не поведение при реальных 200+100 символах"
human_verification:

  - test: "Интерактивный проход SC1: «Добавить устройство» → по очереди все 4 типа (проверить набор полей каждого), сменить тип повторно, создать ноутбук (RAM/флаг/SSD) → список"
    expected: "Пер-типовая секция следует за типом и сбрасывается при смене; подсказка «У периферии серийника может не быть…» только у периферии; после сохранения — устройство в списке без перезагрузки, счётчик «N устройств» отражает фильтр"
    why_human: "Клиентский раундтрип диалог → action → refresh автотестами не покрыт; smoke идёт мимо UI прямой DB-вставкой"

  - test: "Интерактивный проход SC2: карточка созданного устройства → «Редактировать» → проверить предзаполнение всех полей (включая select «Вид» и чекбокс RAM) и статичный (не select) тип → изменить модель и пер-типовое значение → «Сохранить изменения»; затем попытаться создать устройство с серийником существующего"
    expected: "Все поля предзаполнены; тип — статичный текст без поля ввода; карточка отражает правки без F5; дубль серийника — «Устройство с таким серийным номером уже есть» под полем, не 500 и не generic"
    why_human: "Edit-раундтрип и маппинг UNIQUE-кода в живом диалоге — интерактивные пути; updateDevice/schema-инварианты покрыты тестами, UI-проход — нет"

  - test: "Backstop длинного текста: модель 200 символов + серийник 100 символов в строке списка и в диалоге"
    expected: "Truncate с многоточием на обеих линиях, высота строки 44px+ стабильна, диалог не ломается; полные данные в title и на карточке"
    why_human: "Визуальный held-out тест UI Considerations, объявлен планом ручным"

  - test: "Визуальная сверка новых экранов с 03-UI-SPEC (список, фильтр, карточка, диалог create/edit, пустые состояния, скелетон)"
    expected: "Соответствие контракту: two-line rows с mono-номерами и пилюлей, dropdown-фильтр без акцента на триггере, группы карточки по рецепту, edit-кнопка — secondary, footer диалога прижат"
    why_human: "Субъективное визуальное свойство; автогрепы доказывают копи и классы, но не качество"
prohibitions:
  unverified_flagged_count: 5
  human_review_recommended: true
  items:

    - statement: "03-01 P1: MUST NOT быть поля статуса/держателя в zod-whitelist или форме (REG-04 — только custody-действия фазы 4)"
      tier: test
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — schema-тест «rejects custody columns — status/holder change only via phase 4 actions» зелёный (deviceUpdateSchema strictObject отвергает оба ключа); в device-dialog нет полей status/holder ни в одном режиме; grep status|currentEmployeeId по actions.ts — единственное попадание — строка-комментарий:230"
      enforcement: "модульный тест device-schema (прямой негативный); в CI вне vitest не проводан"

    - statement: "03-01 P2: MUST NOT использовать drizzle-kit push (новых миграций нет)"
      tier: test
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — package.json не содержит push; git log по db/ и drizzle/ после 7c1df40 — только queries/UI/tests; схема devices не менялась"
      enforcement: "нет выделенного теста"

    - statement: "03-01 P3: MUST NOT быть клиентской пагинации или клиентского поиска (D-05, серверные списки)"
      tier: test
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — listDevices: where/orderBy/limit/offset в SQL (тест 20-страничной нарезки + clamp зелёный); type-filter.tsx только router.push полного query string; поискового инпута на /devices нет"
      enforcement: "косвенно тестом пагинации; выделенного негативного теста нет"

    - statement: "03-02 P1: MUST NOT быть удаляющего пути устройства (архив-семантика — статус через фазу 4)"
      tier: test
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — гейт воспроизведён верификатором: grep -rniE '\\bdelete\\b' по db/queries/devices.ts и app/(app)/devices = 0; модульный тест 'exposes no delete/remove capability at module level' зелёный; кнопки удаления нет"
      enforcement: "модульный тест + греп-гейт; в CI вне vitest не проводан"

    - statement: "03-02 P2: MUST NOT быть loading.tsx внутри (card) group (404-инвариант d0ceff8)"
      tier: test
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — файл app/(app)/(card)/devices/[id]/loading.tsx отсутствует (проверено); smoke-матрица 404 на 99999/abc с русской страницей зелёная на свежей сборке"
      enforcement: "файловый гейт + smoke-ассерт; отдельного теста нет"
---

# Phase 3: Device Registry — Verification Report

**Phase Goal:** Техника вносится в реестр: четыре фиксированных типа с наборами полей на тип (keystone-модуль `device_schema.ts` — единый источник форм, валидации и будущих фильтров), редактирование, быстрые серверные списки. Сердце приложения и фундамент фаз 4–6.
**Verified:** 2026-09-02T10:57:27Z
**Status:** human_needed
**Re-verification:** No — initial verification

## MVP-Mode Process Note (не гэп)

ROADMAP помечает фазу `mode: mvp`, но цель фазы не в формате User Story — `user-story.validate` вернул `valid: false`. Таблица «User Flow Coverage» поверх такой цели не строится; верификация выполнена стандартным goal-backward методом по 4 success criteria дорожной карты. Идентичное расхождение уже зафиксировано процессными заметками в фазах 1 и 2 (01-/02-VERIFICATION.md): при желании — `/gsd mvp-phase 3` и re-verify.

## Goal Achievement

### Observable Truths

Roadmap SC — контракт; план-специфичные must_haves добавляют детали, дедупликация против SC выполнена (T16→SC2, T17→SC4, T9→SC4).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: создаёт устройство любого из 4 типов — форма показывает поля именно этого типа; карточка видит общие поля | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Серверная половина поведенчески доказана: createDevice любого типа (тесты), карточка зонда рендерит все общие поля группами (smoke: 200 + группы + плейсхолдеры). Не доказан интерактивный раундтрип диалога (диалог → action → refresh) и живой ре-рендер пер-типовой секции — smoke идёт мимо UI прямой DB-вставкой. См. Human Verification #1 |
| 2 | SC2: редактирует все поля; набор полей и валидация жёстко определяются типом, enforced приложением | ✓ VERIFIED | Инварианты под тестами (в полном зелёном прогоне): deviceUpdateSchema строгий — подменённый typeKey/custody-ключи отвергаются, чужие пер-типовые ключи отвергаются; updateDevice пересчитывает оба normalized, не трогает тип/статус, неизвестный id → false без вставок; edit-диалог: тип — статичный текст без hidden-input (dialog:293-298, 323-333), typeKey берётся только из existing.typeKey (actions:232). Интерактивный edit-проход — Human Verification #2 |
| 3 | SC3: реестр листается по типам с серверной пагинацией — быстрый на старте | ✓ VERIFIED | listDevices: SQL where/orderBy/limit/offset + count + clamp (тесты: 20-строчная нарезка, clamp 0/-3/99, фильтр по типу, Ё-сортировка); smoke: type=laptop → 200 + «1 устройство», type=zzz → все типы, page=99 клампится; пагинация-ссылки через buildQuery (полный query-string); индекс devices_type_status_idx в схеме |
| 4 | SC4: статус и владелец не редактируются в форме устройства | ✓ VERIFIED | В диалоге нет полей status/держатель ни в одном режиме; CommonFields/buildZodSchema/deviceSaveSchema/deviceUpdateSchema не содержат custody-ключей; schema-тест «rejects custody columns» зелёный; updateDevice не принимает их по сигнатуре; actions.ts не читает их из FormData (единственный grep-хит — комментарий:230) |
| 5 | Список /devices: двухстрочные строки (модель+пилюля / тип·серийник·инвентарник·держатель), обе линии truncate+title, фильтр валидируется против 4 типов, пагинация 20 с clamp и full-query-string links | ✓ VERIFIED | page.tsx:112-149 (обе линии truncate, title-конкатенация, mono-номера, все 6 колонок D-05); enum-валидация isDeviceTypeKey (чужое = all, smoke-ассерт); clamp в listDevices + ссылочная математика по current/pages; smoke-матрица фильтра/clamp зелёная |
| 6 | Диалог: select типа рендерит пер-типовые поля из device_schema; смена типа сбрасывает значения (key={typeKey}); серийник обязателен; подсказка D-04 у периферии | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Механизм на месте и structural-верен: typeConfigs=DEVICE_TYPES (сер. конфиги), секция `key={config.key}` (remount без useEffect — dialog:416-417), hidden inputs для typeKey и select-значений (dialog:204, 328), serialNumber min(1) в CommonFields (обязателен всем типам, schema-тесты), D-04-подсказка условна typeKey==='peripheral' (dialog:370-376). Интерактивное поведение (reset значений, живой ре-рендер) браузером не упражнено — Human Verification #1/#2 |
| 7 | Создание пишет serialNormalized/inventoryNormalized; пустой инвентарник → NULL-пара; UNIQUE → русская копи, не generic | ✓ VERIFIED | Тесты: гомоглиф «С123»=«C123» → дубль через {code}; пустой инвентарник → NULL/NULL; дубль инвентарника → {code: inventoryNormalized}; actions: uniqueFieldError маппит коды на копи UI-SPEC («Устройство с таким серийным/инвентарным номером уже есть»); queries: inventoryPair + uniqueCodeOf |
| 8 | create/update-действия: requireSession() первой строкой, zod-whitelist по typeFields(typeKey), refresh() перед {ok} | ✓ VERIFIED | actions:195/223 — requireSession первой строкой обоих действий; typeKey валидируется до полей; payload только из commonPayload+typedPayload (обходчик whitelist — typeFields); deviceSaveSchema/deviceUpdateSchema из keystone; refresh() в 214/249; fieldErrors по копи-таблице |
| 9 | Длинные модель/серийник не ломают строку и диалог (long-text backstop, заявлен ручным UAT) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Контракт в коде: truncate+title на обеих линиях, max-w-md диалога; behavior при 200+100 символах не упражнен — план объявил это held-out ручным тестом. Human Verification #3 |
| 10 | Метка «N устройств» (pluralDevices, Intl.PluralRules('ru')) отражает активный фильтр | ✓ VERIFIED | lib/ru.ts:34 wired в page.tsx:62 (total отфильтрованного count); smoke-ассерт: type=laptop → «1 устройство» в HTML; прямая проба верификатора: 1 устройство / 2 устройства / 5 устройств / 21 устройство — формы верны. Выделенного unit-теста pluralDevices нет (в отличие от pluralEmployees) — приемлемо: поведение доказано smoke-ассертом через HTTP |
| 11 | Probe-грани REG-02: adjacency (гомоглиф-нормализация), empty (NULL-пара), ordering (порядок полей = field table UI-SPEC), idempotency (pending-disable; повторный дубль → UNIQUE copy), concurrency (один insert, UNIQUE арбитр) | ✓ VERIFIED | adjacency/empty — тесты (строки 67/78 devices-queries); ordering — PER_TYPE_FIELDS порядок дословно совпадает с канонической field-таблицей UI-SPEC (laptop ramGb→ramUpgraded→ssdGb; monitor diagonal→panelType; dock portCount; peripheral required «Вид», 5 опций по порядку) + schema-тесты; idempotency — Button disabled={pending} (dialog:513) + дубль через action → русская копи; concurrency — один insert без зависимых строк, UNIQUE-обработка обеих колонок |
| 12 | Карточка /devices/[id]: группы (Основное / Характеристики типа / Закупка), только свои пер-типовые поля, пустые — прочерк; «История»/«Фото» — placeholder (D-06) | ✓ VERIFIED | (card)/devices/[id]/page.tsx: группы в фиксированном порядке, typeFields(device.typeKey) — только свои поля (247-255), Value-прочерк для пустых (139-144), плейсхолдеры дословно UI-SPEC (273-278); smoke: карточка 200 + группы + плейсхолдеры фазы 4 + edit-остров. Порядок групп (Осн→Хар→Зак) — задокументированное плановое перекрытие порядка перечисления в абзаце UI-SPEC (03-02-SUMMARY decisions) |
| 13 | Мусорный id → русская not-found (404-инвариант, (card) без loading.tsx) | ✓ VERIFIED | z.coerce.int().positive() → notFound() ДО any-SQL (page:27,174-177); getDevice → notFound(); smoke: 404 + «Страница не найдена» на 99999 и abc; loading.tsx в (card)-группе отсутствует (гейт воспроизведён) |
| 14 | Probe-грани REG-03: edit не меняет typeKey (zod не принимает); update несуществующего id → 0 строк + generic; группы в фиксированном порядке | ✓ VERIFIED | Тесты: «rejects an injected typeKey», «returns false for an unknown id without creating anything» (no-update И no-insert), порядок групп фиксирован в JSX кода и совпадает с must_have плана |

**Score:** 11/14 truths verified (3 present, behavior-unverified — все три маршрутизированы в Human Verification)

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Статус/держатель — только просмотр; действия изменения состояния | Phase 4 | ROADMAP SC4; REQUIREMENTS.md REG-04, MOVE-01..05 → Phase 4 |
| 2 | Секция «История перемещений» — placeholder | Phase 4 | MOVE-04 → Phase 4; план 03-02 назначает placeholder |
| 3 | Секция «Фото» — placeholder | Phase 4 | REG-05 → Phase 4 |
| 4 | Поиска в списке нет | Phase 5 | FIND-01..04 → Phase 5; CONTEXT deferred |
| 5 | Гарантия до — без цветовой семантики | Phase 5 | WAR-01 → Phase 5 |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/device-schema.ts` | Keystone D-02: DEVICE_TYPES (4, ru-имена), typeFields, buildZodSchema, deviceSaveSchema/deviceUpdateSchema, словари отображения | ✓ VERIFIED | 189 строк, чистый иммутабельный модуль без Next-импортов; строгость z.strictObject — тампер-гейт; общий источник форм, валидации и карточки (фаза 5 прочитает для фильтров) |
| `db/queries/devices.ts` | listDevices {rows,total,page,pages}, getDevice, createDevice/updateDevice — normalized + UNIQUE catch, без delete-пути | ✓ VERIFIED | 233 строки, чистые sync-функции; ruSortKey Ё→Е + id tiebreaker; inventoryPair/uniqueCodeOf; normalize ×8 |
| `app/(app)/devices/page.tsx` | Guard-first RSC-список: enum+integer-guard+clamp, two-line rows, пустые состояния, пагинация | ✓ VERIFIED | requireSession, WR-01 integer guard (Number.isInteger), две ветки пустых состояний дословно UI-SPEC, buildQuery |
| `app/(app)/devices/actions.ts` | create/update действия: requireSession → whitelist → zod → queries → refresh | ✓ VERIFIED | UNIQUE-копи, fieldErrors, SAVE_ERROR generic fallback; typeKey в update только из БД |
| `app/(app)/devices/device-dialog.tsx` | Один компонент, create+edit: key-reset секции, hidden inputs, edit read-only тип, data-device-edit-id | ✓ VERIFIED | 573 строки; DeviceDialogDevice — плоский сериализуемый снапшот; WR-01 inner-form в портале |
| `app/(app)/devices/type-filter.tsx` | Filter-остров: полный query-string, сброс страницы | ✓ VERIFIED | 5 опций, router.push `?type&page=1` |
| `app/(app)/devices/{loading,error}.tsx` | Скелетон 5×h-[60px] + retry-граница | ✓ VERIFIED | h-[60px] ×6 (≥1 гейт), motion-safe:animate-pulse; { error, retry } |
| `app/(app)/(card)/devices/[id]/page.tsx` | Карточка группами + 404-инвариант + edit-остров | ✓ VERIFIED | zod-id → notFound до SQL; Intl-форматтеры в UTC на уровне модуля; dialogDeviceOf — плоский снапшот |
| `app/(app)/(card)/devices/[id]/error.tsx` | Русская граница карточки | ✓ VERIFIED | «Не удалось загрузить карточку устройства» + «Попробовать снова» |
| `app/(app)/nav.tsx` + `layout.tsx` | Нав «Устройства» · «Сотрудники» с active-state | ✓ VERIFIED | Клиент-остров usePathname, aria-current; AppNav в шелле |
| `app/(app)/page.tsx` | Redirect / → /devices | ✓ VERIFIED | redirect в RSC до рендера; smoke-ассерт 307 → /devices |
| `components/ui/{select,checkbox}.tsx` | shadcn, без barrel-импортов | ✓ VERIFIED | 201+29 строк, прямые импорты файлов, barrel-ов нет |
| `lib/ru.ts` (+pluralDevices) | Русские плюралы «устройство/устройства/устройств» | ✓ VERIFIED | Intl.PluralRules('ru'); wired в список; smoke-ассерт «1 устройство» |
| `tests/device-schema.test.ts` + `tests/devices-queries.test.ts` | Schema-контракт + queries-инварианты | ✓ VERIFIED | 19 + 17 кейсов, зелёные в полном прогоне 102/102 |
| `scripts/smoke-devices.mjs` | E2E: периметр/список/фильтр/clamp/карточка/404-матрица/edit-остров | ✓ VERIFIED | Исполнен верификатором на свежей сборке, exit 0 |

Примечание к `verify.artifacts`: запрос вернул 3 ложных «File not found» по glob/составным путям frontmatter (`app/(app)/devices/*`, `tests/… + tests/…`, суффикс «(edit-режим)») — все три vérифицированы вручную (см. таблицу выше); реальных отсутствующих артефактов нет.

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| device-dialog.tsx | lib/device-schema.ts | typeFields-рендер из typeConfigs + buildZodSchema-валидация | WIRED | Импорт DeviceField/DeviceTypeConfig (dialog:25-28); рендер config.fields (421-428); серверная половина — deviceSaveSchema/deviceUpdateSchema в actions. gsd-tools дал false-negative: паттерн «device_schema» (подчёркивание) не матчит файл `device-schema.ts` (дефис) — wiring подтверждён вручную |
| db/queries/devices.ts | lib/normalize.ts | normalizeSerial/normalizeInventory в обеих мутациях | WIRED | Импорт (строка 4); serialNormalized в create:172/update:210, inventoryPair в обеих; gsd-tools VERIFIED |
| (card)/devices/[id]/page.tsx | lib/device-schema.ts | typeFields(typeKey) для группировки | WIRED | Импорт (строка 11), вызов typeFields(device.typeKey):182 → секция «Характеристики типа». gsd-tools false-negative: в from-пути frontmatter пропущен префикс app/(app)/ — файл существует, wiring ручной проверкой |
| devices/page.tsx | db/queries/devices.ts | await searchParams → listDevices | WIRED | page:49; данные реально рендерятся (smoke: зонд в HTML списка) |
| device-dialog.tsx | devices/actions.ts | useActionState по режиму → create/updateDeviceAction | WIRED | dialog:268-271; ok-эффект закрывает диалог после refresh() |
| (card) page | device-dialog.tsx (edit) | device={dialogDeviceOf(device)} | WIRED | page:217-221; data-device-edit-id ассертится smoke |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| app/(app)/devices/page.tsx | rows/total | listDevices() — SQL join+where+orderBy+limit/offset над SQLite | Да (smoke: «Смок Устройство» + «1 устройство» в HTML) | ✓ FLOWING |
| app/(app)/(card)/devices/[id]/page.tsx | device | getDevice(id) — SQL leftJoin | Да (smoke: карточка 200 + группы + mono-серийник) | ✓ FLOWING |
| DeviceDialog | typeConfigs / device | DEVICE_TYPES (keystone-конфиги) / dialogDeviceOf(device) — живая строка | Да (не захардкожены пустыми ни в одном из двух мест вызова) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Полный тест-сьют (базлайн 96 + 6 новых 03-02; TDD-инварианты RED→GREEN) | `npx vitest run` | 102/102 passed, 11 файлов, 0.6s | ✓ PASS |
| Прод-сборка | `npm run build` | exit 0; маршруты ƒ /devices, ƒ /devices/[id] в таблице | ✓ PASS |
| pluralDevices ru-формы | прямая проба (n = 1,2,5,11,21,22,25) | «1 устройство / 2 устройства / 5 устройств / 11 устройств / 21 устройство…» | ✓ PASS |
| WHITELIST-гейт | grep status/currentEmployeeId по zod-схемам и FormData-чтениям actions | 0 реальных попаданий (1 — комментарий:230) | ✓ PASS |
| no-delete гейт | grep -rniE '\bdelete\b' db/queries/devices.ts + app/(app)/devices | 0 | ✓ PASS |
| 404-инвариант гейт | test -f app/(app)/(card)/devices/[id]/loading.tsx | отсутствует | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| scripts/smoke-devices.mjs | `node scripts/smoke-devices.mjs` (после свежего `npm run build`) | exit 0: «SMOKE OK: 307 → /login; 200 + „Смок Устройство“ + CTA + пилюля; / → 307 на /devices; type=laptop + „1 устройство“; type=zzz → все; page=99 клампится; карточка 200 + группы + плейсхолдеры + edit-остров; 404×99999/abc + русская страница» | PASS |
| scripts/smoke-employees.mjs | `node scripts/smoke-employees.mjs` | exit 0 — регрессии фазы 2 нет | PASS |

Урок фазы 2 учтён: оба прогона выполнены верификатором на пересобранном `.next` (stale-build ловушка исключена).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| REG-01 | 03-01 | Просмотр реестра с фильтром по 4 типам + серверная пагинация | ✓ SATISFIED | Truths 3/5/10; listDevices SQL-пагинация; smoke-матрица фильтра/clamp; RU-сортировка тестом |
| REG-02 | 03-01 | Создание устройства одного из 4 типов с полями своего типа | ✓ SATISFIED | Truths 1/6/7/8/11; keystone → форма+валидация; create-действие wired; инварианты под тестами; интерактивный проход — UAT (Human #1) |
| REG-03 | 03-02 | Редактирование всех полей; пер-типовый набор enforced | ✓ SATISFIED | Truths 2/12/13/14; strict UpdateSchema; тип/статус/держатель неизменяемы (двойной барьер UI+zod); normalized пересчитывается; интерактивный проход — UAT (Human #2) |

Orphaned requirements: нет — REQUIREMENTS.md отображает на Phase 3 ровно REG-01/REG-02/REG-03, все три заявлены в `requirements:` планов (03-01: REG-01+REG-02; 03-02: REG-03). REG-04/REG-05 корректно вне фазы 3 (Phase 4).

### Code Review Fixes (WR-01..03) — regression check

| Fix | Commit | Verified in code |
|-----|--------|------------------|
| WR-01: integer guard дробного ?page= (devices + employees) | 6ae3541 | ✓ `Number.isInteger(parsedPage) && parsedPage > 0` на обоих списках (devices:48, employees:41) |
| WR-02: UI-SPEC сортировка перекрыта планом (RU-по-модели) | e577e40 | ✓ 03-UI-SPEC.md:108/222 amend «по модели (русская коллация)… плановое перекрытие»; код: ruSortKey + тест Ё-сортировки |
| WR-03: edit-триггер карточки — secondary, акцент только CTA списка | 838199d | ✓ dialog:548 `variant={editing ? 'secondary' : 'default'}` |

Все 10 коммитов, заявленных SUMMARY (ebbd089, d4f4137, 15f8dcd, 11c20ab, 4a8b0d2, ff81e36, 2e0e495, 6ae3541, e577e40, 838199d), существуют в истории.

### vercel-react-best-practices — visible conformance (user mandate)

| Rule | Evidence | Status |
|------|----------|--------|
| server-serialization | DeviceTypeConfig (плоские конфиги) и DeviceDialogDevice (Dates → yyyy-mm-dd, без rows/функций) — единственное, что пересекает RSC→client границу | ✓ |
| bundle-barrel-imports | device-dialog импортирует 7 ui-файлов напрямую; barrel-ов нет (grep) | ✓ |
| rerender-derived-state-no-effect | Сброс пер-типовых значений через `key={config.key}` (remount), не useEffect; единственный useEffect — ok-close по ответу действия | ✓ |
| rerender-no-inline-components / server-hoist-static-io | Typed* рендереры на уровне модуля; Intl-форматтеры подняты в UTC-константы карточки | ✓ |
| server-auth-actions | requireSession первой строкой, zod-whitelist, без secrets в полях ошибок | ✓ |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| app/(app)/devices/device-dialog.tsx | 85 | `return null` в initialOf | ℹ️ Info | Легитимный null-value helper (значение поля в create-режиме), не render-заглушка |
| app/(app)/devices/device-dialog.tsx | 286 | max-h-[75svh] против 85svh в UI-SPEC dialog-контракте | ℹ️ Info | Косметический дрейф спецификации; ни один must_have не ассертит высоту; ловится визуальным UAT (#4) |
| lib/ru.ts | 34 | pluralDevices без выделенного unit-теста (в отличие от pluralEmployees) | ℹ️ Info | Поведение доказано smoke-ассертом через HTTP и прямой пробой верификатора; пробел в регрессионной сетке |

Debt-маркеры (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) в файлах фазы: 0. Пустых реализаций, console.log-only функций, захардкоженных пустых props в местах вызова: 0.

## Human Verification Required

### 1. Интерактивный проход SC1 — создание устройства всех 4 типов

**Test:** «Добавить устройство» → выбрать каждый тип, сверить набор полей пер-типовой секции с field-таблицей UI-SPEC; сменить тип повторно; создать ноутбук с заполненными RAM/флагом/SSD.
**Expected:** Секция следует за типом и сбрасывается при смене (значения не протекают); подсказка D-04 только у периферии; после сохранения диалог закрывается, устройство в списке без F5, счётчик «N устройств» отражает фильтр.
**Why human:** Клиентский раундтрип (диалог → Server Action → refresh) и key-remount автотестами не покрыты; smoke-зонд идёт прямой DB-вставкой.

### 2. Интерактивный проход SC2 — редактирование и UNIQUE-копи

**Test:** Карточка → «Редактировать» → сверить предзаполнение (select «Вид», чекбокс RAM, даты); тип — статичный текст; изменить модель и пер-типовое значение → «Сохранить изменения»; затем попытаться создать дубль серийника.
**Expected:** Карточка отражает правки без перезагрузки; дубль серийника — «Устройство с таким серийным номером уже есть» под полем (не 500, не generic).
**Why human:** Edit-раундтрип и маппинг UNIQUE-кода в живом диалоге — интерактивные пути; серверные инварианты покрыты тестами.

### 3. Backstop длинного текста

**Test:** Модель 200 символов + серийник 100 символов — в строке списка и в диалоге.
**Expected:** Обе линии truncate с многоточием, высота строки стабильна, диалог не ломается; полные данные в title и на карточке.
**Why human:** Визуальный held-out тест, объявленный планом ручным.

### 4. Визуальная сверка с 03-UI-SPEC

**Test:** Глазами пройти список (two-line rows, mono-номера, пилюля, фильтр без акцента), карточку (группы, прочерки, плейсхолдеры), диалог (скролл-тело, прижатый футер, edit-secondary).
**Expected:** Соответствие утверждённому контракту фазы; единый визуальный язык фазы 2 сохранён.
**Why human:** Субъективное визуальное свойство; заодно закрыть Info-дрейф 75svh/85svh.

## Gaps Summary

Гэпов, блокирующих цель фазы, не обнаружено. Все три requirement-пути (REG-01, REG-02, REG-03) имеют полную реализацию в коде: keystone `lib/device-schema.ts` — единственный источник пер-типовых полей для формы, валидации и карточки (D-02 выдержан — параллельных списков нет ни в одном компоненте); queries с normalized-инвариантами и UNIQUE-маппингом; guard-first список с серверной пагинацией, enum-валидацией и clamp; диалог create/edit с key-remount и read-only типом; карточка группами с 404-инвариантом. Поведенческое доказательство — 102/102 vitest (TDD RED→GREEN на обеих планах), prod-build с маршрутами /devices и /devices/[id], оба smoke зелёные на свежей сборке (периметр 307, фильтр+clamp+enum-fallback, карточка+edit-остров, 404-матрица с русской страницей, smoke-employees без регрессий). Греп-гейты планов воспроизведены верификатором: custody-колонки вне whitelist (тест+grep), no-delete 0, (card)/loading.tsx отсутствует, drizzle-kit push отсутствует, клиентской пагинации/поиска нет.

Статус — human_needed, а не passed, по трём truth'ам, сознательно оставленным PRESENT_BEHAVIOR_UNVERIFIED: интерактивные браузерные раундтрипы создания и редактирования (smoke идёт мимо UI прямой DB-вставкой), интерактивное поведение пер-типовой секции при смене типа и long-text backstop, который план сам объявил ручным UAT. Это та же модель доказательства, что принята в фазе 2: серверная половина каждого пути поведенчески доказана (queries/schema-тесты + smoke-рендер), интерактивная — честно маршрутизирована человеку. Пять test-tier запретов оформлены по ADR-550 D4 fail-closed (unverified+flagged, вердикты LLM неавторитетны) — у 03-01 P1 и 03-02 P1 есть прямые/модульные негативные тесты, остальные покрыты воспроизведёнными гейтами без выделенных тестов. Отклонения от буквы спецификаций (RU-сортировка списка вместо newest-first — amend UI-SPEC e577e40; порядок групп карточки; type-filter/nav как отдельные client-острова; updateDeviceAction создан уже в 03-01 и усилен в 03-02) — задокументированы в SUMMARY и/или UI-SPEC, перекрывают plan-executable контрактом, не гэпы; overrides не требуются.

---

_Verified: 2026-09-02T10:57:27Z_
_Verifier: Claude (gsd-verifier)_
