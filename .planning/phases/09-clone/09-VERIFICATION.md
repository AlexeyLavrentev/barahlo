---
phase: 09-clone
verified: 2026-09-17T11:35:00Z
status: human_needed
score: 9/11 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Backstop 1: открыть карточку активного устройства — триггер «Дублировать» виден в ряду действий, secondary-вариант, порядок «Редактировать → Дублировать → custody → Списать» сохранён; после успешного клона линия успеха «Создано N…» стоит под рядом, нейтральный ink (не зелёный/accent)"
    expected: "Кнопка с data-device-clone-id рендерится в ряду; линия успеха с data-clone-created ниже ряда"
    why_human: "Визуальный рендер и layout — browser-only, компонентного раннера в репо нет (прецедент фаз 2–8); план помечает truth как verification: backstop"
  - test: "Backstop 2: открыть диалог, отправить — сабмит disabled с копией «Создаём копии…» в полёте; закрыть, открыть снова — линия успеха от предыдущей сессии очищена"
    expected: "Disabled-состояние в полёте; каждая сессия диалога начинается с чистой линии успеха (WR-01-разделение обёртка/форма)"
    why_human: "Визуальное disabled-состояние и lifecycle между открытиями — browser-only; план помечает truth как verification: backstop"
---

# Phase 9: Клон устройства Verification Report

**Phase Goal:** Закупка N одинаковых единиц — один диалог: копии создаются из карточки оригинала с пустым серийником, редактируемой подсказкой инвентарника и чистой историей. Единственная миграция схемы вехи (serial → nullable) — решение фиксируется на уровне плана фазы.
**Verified:** 2026-09-17T11:35:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | «Дублировать» открывает отдельный клон-диалог: количество (1..100, дефолт 1) + одно редактируемое поле «Инвентарный номер» (SC 1, D-01) | ✓ VERIFIED | `clone-dialog.tsx`: поле count (min=1 max=100 defaultValue='1'), поле inventoryNumber maxLength=80 с suggested; отдельный компонент (не реюз device-dialog); кнопка secondary `data-device-clone-id` в `page.tsx:258` |
| 2 | N копий одной операцией; сбой в середине пакета → ноль новых строк (SC 1, D-06) | ✓ VERIFIED | `devices.ts:601-639` db.transaction + N×insert.returning; тест `clone-queries.test.ts:115` «rolls back the WHOLE batch on a mid-batch UNIQUE collision» — deviceCount() не изменился, наверху `{ code: 'inventoryNormalized' }` (PASS в прогоне 392/392) |
| 3 | Копии отличаются только идентификаторами: серийник NULL/NULL, notes/фото/история/владелец не копируются; in_stock, currentEmployeeId=null, ноль movements (SC 2, D-05, D-06) | ✓ VERIFIED | Код хардкодит serialNumber/serialNormalized=null, notes=null, status='in_stock', holder не пишется, movements не трогаются; тесты `:144` NULL/NULL-пары, `:156` never copies notes/holder/status/movements/attachments, `:182` ASSIGNED→in_stock без holder (PASS) |
| 4 | Подсказка «следующий по шаблону» с паддингом; серия инкрементится от предыдущей; нераспознанный/пустой → пустое поле молча (SC 3, D-02) | ✓ VERIFIED | `lib/inventory-increment.ts` — pure, RAW-регистр сохранён, padStart, перенос, `''` молча; 8/8 тестов PASS (паддинг, перенос AB-099→AB-100, серия N−1 свёрток, WR-01-гвард); тот же импорт в `clone-dialog.tsx:176` (клиент) и `devices.ts:582` (сервер) — один источник |
| 5 | Закупочный блок + конфиг-поля своего типа наследуются (SC 4, D-04) | ✓ VERIFIED | `devices.ts:613-629` — typeKey/model/purchaseDate/purchasePrice/supplier/warrantyUntil + ramGb/ramUpgraded/ssdGb/screenDiagonal/panelType/portCount/peripheralKind; тесты `:208` laptop-наследование, `:226` monitor sparse + чужие поля NULL (PASS) |
| 6 | Успех — остаёмся на карточке, «Создано {pluralDevices(n)}»; коллизия откатывает пакет и мапится в «уже есть» под полем (D-06, D-07) | ✓ VERIFIED | `actions.ts:389-391` uniqueFieldError-маппинг + CLONE_ERROR-фолбэк; откат доказан тестом #2; `clone-dialog.tsx:150-187` линия успеха в обёртке с data-clone-created; pluralDevices из lib/ru.ts:34 (механизм; визуальный рендер — через backstop-пункты ниже) |
| 7 | Сервер авторитетен: клиент шлёт только count и отредактированный старт; count вне 1..100 отклонён zod'ом (D-02, D-03) | ✓ VERIFIED | `actions.ts:308-314` cloneSchema strictObject ровно 3 поля, count `.int().min(1).max(100)`; `:373` ''→undefined ДО query-слоя; серверная `inventorySequence` (`devices.ts:575-587`) сворачивает ту же pure-функцию, нераспознанный старт → вся серия NULL |
| 8 | Миграция 0001: обе serial-колонки nullable, NULL-пары легальны, непустые уникальны, данные/триггеры/CHECK целы; применение только раннером, README/deploy переведены (D-08) | ✓ VERIFIED | `drizzle/0001_cooing_wendell_rand.sql` — recreation, serial-колонки без NOT NULL, индексы пересозданы; `db/schema.ts:73,75` без .notNull(), D-08-комментарий, devices_serial_norm_uq сохранён; schema.test 140/150/163 + migrate-runner 86/144/162 PASS (nullable pragma, NULL-пары, дубль отклонён, триггеры/CHECK целы, CLI-совместимый трекинг, no-op повтор); README 5 мест + deploy.sh:35 → `node scripts/migrate.mjs`; runner FK OFF строго до BEGIN (`migrate.mjs:68-69`) |
| 9 | Ручная форма create/edit не изменилась: zod min(1) серийника в CommonFields (D-08) | ✓ VERIFIED | `lib/device-schema.ts:174` — `serialNumber: z.string().min(1).max(100)` нетронут; пустой серийник пишется только query-слоем клона |
| 10 | Backstop: триггер «Дублировать» в ряду действий, secondary, порядок ряда, линия успеха под рядом нейтральным ink | ? BACKSTOP → human | Код и wiring на месте; визуальный рендер — browser-only, план помечал как verification: backstop |
| 11 | Backstop: disabled-сабмит в полёте; очистка линии успеха при следующем открытии | ? BACKSTOP → human | Код: `disabled={pending}`, pendingCopy «Создаём копии…», `handleOpenChange` сбрасывает created; lifecycle между открытиями — browser-only |

**Score:** 9/11 truths verified (0 present-but-behavior-unverified; 2 plan-declared backstops → human verification)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `drizzle/0001_cooing_wendell_rand.sql` + `drizzle/meta/*` | generated миграция serial→nullable | ✓ VERIFIED | Recreation-паттерн drizzle, statement-breakpoint-сплиты, без следов ручных правок |
| `scripts/migrate.mjs` | host-side runner, FK OFF до BEGIN | ✓ VERIFIED | 120 строк: journal-pending, sha256+when (CLI-совместимо), ROLLBACK на ошибке, FK ON в finally, CLI-хвост с exit 1; импорт из тестов ничего не исполняет |
| `lib/inventory-increment.ts` | pure, client-safe | ✓ VERIFIED | Только named export, без фреймворк-импортов; импортируется клиентом и сервером |
| `db/queries/devices.ts :: cloneDevices` | одна транзакция N вставок | ✓ VERIFIED | WIRED: вызывается из cloneDeviceAction (actions.ts:380); inventorySequence рядом (575) |
| `app/(app)/devices/actions.ts :: cloneDeviceAction` | server action по контракту | ✓ VERIFIED | requireSession первым, echo, strictObject-3 поля, refresh(), ok+created |
| `app/(app)/devices/clone-dialog.tsx` | CloneDialog + CloneDialogForm | ✓ VERIFIED | WR-01-сплит, useActionState, pending-aware, линия успеха в обёртке |
| `app/(app)/(card)/devices/[id]/page.tsx` | кнопка в ряду действий | ✓ VERIFIED | Импорт :24, монтаж :258 с плоскими пропсами deviceId + RAW inventoryNumber |
| 4 тест-файла | миграционная + клон-матрицы | ✓ VERIFIED | 21 новый тест, все PASS в прогоне 392/392 |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| cloneDeviceAction | cloneDevices | count + отредактированный старт; '' → null до query-слоя | ✓ WIRED | actions.ts:373,380-384 |
| CloneDialog suggested | nextInventoryNumber | тот же импорт, что серверная серия (D-02 один источник) | ✓ WIRED | clone-dialog.tsx:16,176; devices.ts:582 |
| 0001 + runner | заполненная база | FK OFF строго до BEGIN; created_at=journal.when | ✓ WIRED | migrate.mjs:68-69,85; тест «applies 0001 to a filled base» PASS |
| UNIQUE-коллизия | ошибка поля диалога | uniqueCodeOf → throw → auto-rollback → uniqueFieldError | ✓ WIRED | devices.ts:637; actions.ts:389-391; query-тест коллизии PASS |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Полный suite (392 теста, вкл. 21 новый) | `npx vitest run` | 23 files, 392/392 passed, 2.9s | ✓ PASS |
| Typecheck после D-08 тип-риппла | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Mid-batch rollback (SC 1 инвариант) | `tests/clone-queries.test.ts:115` (в прогоне) | PASS — 0 новых строк, `{code:'inventoryNormalized'}` | ✓ PASS |
| Миграция на заполненной базе (Pitfall 1/3) | `tests/migrate-runner.test.ts:86` (в прогоне) | PASS — данные/дети/триггеры/CHECK целы | ✓ PASS |
| WR-01 регрессия (precision >2^53) | `tests/inventory-increment.test.ts:52` (в прогоне) | PASS — unsafe-хвост → silent-empty | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| REG-06 | 09-01-PLAN | Оператор клонирует устройство с указанием количества: серийник пуст (миграция serial→nullable), фото/история/владелец не копируются, копии без сотрудника; инвентарник — редактируемая автоподсказка | ✓ SATISFIED | Truths 1-9 + artifacts выше; REQUIREMENTS.md:58 «REG-06 \| Phase 9 \| Complete» |

Орфанных требований нет: REQUIREMENTS.md маппит на Phase 9 только REG-06, и он же единственный в PLAN frontmatter.

### Prohibitions (must-NOT checks)

| Prohibition | Status | Evidence |
| --- | --- | --- |
| Ни одного movement-события при клонировании | ✓ VERIFIED | Тест `clone-queries.test.ts:156` PASS — movements не растут |
| Никаких новых npm-зависимостей | ✓ VERIFIED | `git diff 62c8e50~1..HEAD -- package.json` пуст |
| Никакого drizzle-kit push / ручных правок 0001 | ✓ VERIFIED | README:191 фиксирует «никогда push»; 0001 — чистый generate-паттерн |
| Никакого реюза device-dialog.tsx как формы клона | ✓ VERIFIED | device-dialog.tsx: diff 3 строки — только nullable-тип и «—» в рендере; clone-логики нет |
| Никакого ослабления zod min(1) в CommonFields | ✓ VERIFIED | device-schema.ts:174 нетронут |
| Статус/владелец только query-слоем | ✓ VERIFIED | zod-белый список 3 поля; тест `:182` PASS |
| Никакого тоста / живого превью | ✓ VERIFIED | clone-dialog.tsx — ни toast-импорта, ни превью-рендера |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| — | — | Debt-маркеров (TBD/FIXME/XXX) в файлах фазы нет; «placeholder»-хиты — HTML-атрибут и комментарий UI-SPEC, не заглушки | ℹ️ Info | Чисто |

### Human Verification Required

### 1. Ряд действий и линия успеха (Backstop 1)

**Test:** Открыть карточку активного устройства; убедиться, что «Дублировать» стоит между «Редактировать» и custody-действиями, variant secondary; выполнить клон N=2 и проверить линию «Создано 2 …» под рядом (data-clone-created="2"), нейтральный ink.
**Expected:** Порядок «Редактировать → Дублировать → custody → Списать»; линия успеха — отдельная строка под кнопками, без зелёного/accent; у disposed-карточки ряд (и кнопка) отсутствует.
**Why human:** Визуальный рендер/layout — browser-only; компонентного раннера в репо нет (прецедент фаз 2–8); план помечал truth как `verification: backstop`.

### 2. Disabled-сабмит и очистка линии успеха (Backstop 2)

**Test:** В диалоге нажать «Дублировать» и наблюдать кнопку в полёте («Создаём копии…», disabled); закрыть диалог и открыть снова.
**Expected:** В полёте сабмит неактивен с копией «Создаём копии…»; при следующем открытии линия успеха предыдущей сессии очищена (чистое состояние каждой сессии, WR-01).
**Why human:** Визуальное disabled-состояние и состояние между открытиями диалога не покрываются grep/юнит-тестами; план помечал truth как `verification: backstop`.

### Gaps Summary

Гэпов нет. Все 9 содержательных must-have-трусов VERIFIED, из них behavior-зависимые (транзакционный откат, NULL-пары, наследование, миграция на заполненной базе) — с проходящими поведенческими тестами в прогоне 392/392; tsc чист; все 4 key_links WIRED; все 7 prohibitions подтверждены; REG-06 закрыт. Статус `human_needed` — только из-за 2 backstop-трусов, которые план сам пометил browser-only (`verification: backstop`); это соответствует прецеденту фаз 2–8 (маршрут в UAT-файл). Инфо-находки ревью IN-01..03 (непокрытые тестом N=100-граница и CLI-хвост раннера) зафиксированы в `deferred-items.md` и не являются must-have-провалами: соответствующие поведения реализованы и/spec-корректны, недостаёт только прямых тест-пинов.

---

_Verified: 2026-09-17T11:35:00Z_
_Verifier: Claude (gsd-verifier)_
