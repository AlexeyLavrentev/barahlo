---
phase: 04-custody-photos
verified: 2026-09-04T11:12:00Z
status: human_needed
score: 3/5 must-haves verified
behavior_unverified: 2
overrides_applied: 0
overrides: []
re_verification: null
gaps: []
deferred: []
behavior_unverified_items:
  - truth: "SC1/SC2: после действия выдачи/приёма/передачи карточка устройства и карточка сотрудника обновляются без F5 (интерактивный раундтрип диалог → server action → refresh → живой ре-рендер)"
    test: "Открыть карточку in_stock-устройства, «Выдать» сотруднику через диалог; затем «Принять» и «Передать» на assigned-устройстве; наблюдать карточки устройства и держателя без перезагрузки"
    expected: "Держатель, статус-пилюля и событие таймлайна меняются сразу после подтверждения диалога; список «Техника» на карточке сотрудника обновляется без F5"
    why_human: "Guard-tx атомарность поведенчески доказана тестами (52 кейса на queries), но vitest тестирует слой queries напрямую, а smoke рендерит карточки из прямой DB-вставки — интерактивный раундтрип диалог→action→refresh ни одним автоматическим тестом не исполняется"
  - truth: "SC5 (телефонная ветка): фото прикладываются с телефона (камера/multipart мобильного браузера)"
    test: "Открыть карточку устройства на телефоне, «Добавить» → снять/выбрать фото с камеры → загрузить"
    expected: "Фото загружается, миниатюра появляется в сетке без F5 (router.refresh)"
    why_human: "Пайплайн доказан end-to-end HTTP-smoke с реальным sharp-JPEG, но физическая камера/мобильный input — аппаратный сценарий, недоступный автоматике"
human_verification:
  - test: "«Выдать» через диалог (сотрудник → дата → комментарий) на in_stock-устройстве"
    expected: "Одно действие: держатель и статус меняются атомарно, событие «Выдача» появляется в таймлайне, карточки устройства и сотрудника обновляются без F5 (SC1/SC2)"
    why_human: "Интерактивный раундтрип диалог→action→refresh не исполняется автотестами"
  - test: "«Принять» и «Передать» на assigned-устройстве; «Вернуть всю технику» на карточке сотрудника с 2+ устройствами"
    expected: "Каждое — одноразовое действие; карточка сотрудника и карточка устройства синхронны; при сбое return-all копия ошибки обещает атомарность и ничего не меняется (D-07)"
    why_human: "Живое поведение формы и confirm-диалога не покрывается автотестами"
  - test: "Визуальная приёмка ремонт/списание: «В ремонт» с держателем (хинт авто-приёма), «Списать» — красная primary только в диалоге, предупреждение финальности, пустая причина → инлайн-ошибка; на карточке disposed нет ни одной кнопки"
    expected: "Соответствие 04-UI-SPEC: красная заливка только «Списать» и пилюля «Списано»; «Из ремонта» — единственный accent repair-карточки"
    why_human: "Визуальная семантика цвета/копи не верифицируется grep'ом"
  - test: "Фото с телефона: камера → загрузка → миниатюра в сетке; лайтбокс по клику; удаление с confirm; обложка в списке устройств"
    expected: "Сетка 3/4 колонки, счётчик «{n} из 8», лайтбокс с «Закрыть», удаление нейтральным confirm; на 8/8 тайл «Добавить» скрыт"
    why_human: "Мобильный input и визуальная приёмка сетки/лайтбокса — аппаратные/эстетические критерии"
  - test: "Русский копи-контракт диалогов и таймлайна по 04-UI-SPEC (порядок полей, pending-копии, route-строки «→ кому»/«от → кому»/«← от кого»/«от {держателя}»)"
    expected: "Все 7 событий читаются по словарю UI-SPEC; поля диалогов в порядке сотрудник→дата→комментарий"
    why_human: "Backstop-истина плана 01 — копи-контракт помечен manual UAT по замыслу"
---

# Phase 4: Custody & Photos — Verification Report

**Phase Goal:** Транзакционное ядро — причина существования приложения: выдача/возврат/передача одним действием, атомарно пишущие событие в неизменяемую историю и обновляющие текущее состояние; карточки устройств и сотрудников всегда показывают актуального держателя; к устройству прикладываются фото.
**Verified:** 2026-09-04T11:12:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## MVP-Mode Process Note (не гэп)

ROADMAP помечает фазу `mode: mvp`, но цель фазы не в формате User Story (`user-story.validate` вернул бы `valid: false`) — таблица «User Flow Coverage» поверх такой цели не строится. Верификация выполнена стандартным goal-backward методом по 5 success criteria дорожной карты. Идентичное расхождение зафиксировано процессными заметками в фазах 1–3 (standing precedent).

## Goal Achievement

### Observable Truths

Roadmap SC — контракт; план-специфичные must_haves добавляют детали (16 truths + 16 probe-edges в 3 планах, дедуплицированы против SC).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: «Выдать» — одно действие: держатель, статус и запись в истории меняются атомарно, одной транзакцией | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Серверное ядро поведенчески доказано: `assignDevice` — одна sync-tx (guard-UPDATE `WHERE id AND status='in_stock'` решает по `.changes` + INSERT assigned-события, db/queries/movements.ts:76-105); тесты: assign от in_stock пишет event+проекцию, от assigned/repair/disposed → ILLEGAL_TRANSITION с нулевыми эффектами, инжектированный сбой return-all откатывает ВСЁ (movements-queries.test.ts, 52 кейса зелёные в моём прогоне 184/184). Матрица/диалог отрендерены (smoke: «Выдать»+data-attrs на in_stock, D-08 — нет на assigned). Не доказан интерактивный раундтрип диалог→action→refresh — см. Human Verification #1 |
| 2 | SC2: «Принять»/«Передать» — одноразовые действия; карточки обновляются мгновенно | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | acceptDevice/transferDevice — те же guard-tx с from/to из строки БД внутри tx (movements.ts:110-184), adjacency «себе самому» отвергается (тест), smoke-ассерты «Принять»/«Передать» на assigned-карточке; refresh() в каждом action (actions.ts:407,429,460). «Мгновенно без F5» — тот же неисполненный автотестами интерактивный раундтрип — см. Human Verification #1 |
| 3 | SC3: Таймлайн показывает всю историю (кто/когда/от кого/кому); события нельзя редактировать/удалить — только компенсирующее | ✓ VERIFIED | listTimeline: alias double-join имён (включая архивных — тест), ORDER BY occurredAt DESC, id DESC (тест: backdated-порядок + id-tiebreak); append-only: триггеры RAISE(ABORT) в drizzle/0000_amusing_talon.sql:97-101 + тест «UPDATE movements aborts»; grep UPDATE/DELETE movements в app/lib/db = 0 (мой прогон); smoke рендерит «Выдача»/«В ремонт»/«Списание» с именами и причиной; empty-state «История появится после первого действия с устройством.» без синтетических received (timeline.tsx:36-44) |
| 4 | SC4: «в ремонт»/«из ремонта»/«списано» — только действиями; списанное остаётся с полной историей | ✓ VERIFIED | sendToRepair (авто-приём: returned+to_repair в одной tx, from=держателя — тест), returnFromRepair, disposeDevice (precondition перечисляет ВСЕ не-disposed статусы — из disposed .changes=0 навсегда); финальность: 6 прямых переходов + return-all → ILLEGAL/no-op (тесты), история disposed читается (тест+smoke); ручного пути нет: deviceUpdateSchema не трогает статус (доказано фазой 3), edit-строка скрыта при disposed (page.tsx:241 + smoke «без Редактировать»); матрица 4 статусов полная (device-actions.tsx:38-73) |
| 5 | SC5: фото прикладываются (в т.ч. с телефона); миниатюры в списках; фото только авторизованным | ✓ VERIFIED | Поведенчески доказано моим прогоном smoke-custody на свежем build: upload real-JPEG → 200, thumb/full → 200 image/jpeg private+immutable, thumb ≤400px, без enlargement; периметр: без cookie POST/GET → 307, бинарник никогда не отдаётся; IDOR-пара → 404, мусор → 415 BAD_IMAGE, 9-е фото → 409 CAP без файлов, disposed upload/delete → 409 DISPOSED; миниатюры-обложки в списке устройств (devices/page.tsx:127-133 + батчевый coverByDevice в queries/devices.ts) — smoke-devices ассертит сетку «Фотографий пока нет»/«0 из 8»/«Добавить». Ветка телефона (камера) — Human Verification #4. Отклонение «307 вместо 401» — см. Deviation Notes |

**Score:** 3/5 truths verified (2 present, behavior-unverified)

### Deviation Notes (проверены, гэпами не являются)

1. **307 вместо 401 на бинарниках без сессии** (план 03: «без cookie → 401»). Контракт кодовой базы — requireSession → redirect(307) → /login, единый для ВСЕХ маршрутов со фаз 2–3 (smoke фаз 3–4 ассертят именно 307). Инвариант «бинарник никогда не отдаётся без сессии» доказан (307 на POST и GET в моём прогоне). Отклонение только в номере статуса, задокументировано в 04-03-SUMMARY deviations. Это выглядит намеренным (платформенный контракт); при желании формализовать — override в frontmatter против дословной формулировки «401».
2. **jpeg q82 против q80** (research C5 против task-действия): взят поздний биндинг (task), тесты качество не ассертят. Влияет только на размер файла.
3. **app/(app)/devices/page.tsx добавлен в изменения сверх files_modified плана 03**: без правки списка батчевый cover-запрос был бы мёртвым кодом, а истина «миниатюры видны в списках» (REG-05) не выполнялась бы. Правка минимальна и ровно по UI-SPEC. Корректное решение — иначе была бы реальная HOLLOW-ошибка Level 4.
4. **to_repair from=держателя** (вместо NULL): соответствует UI-SPEC («от {держателя, если был}») и RESEARCH C2; route-строка «от {Имя}» оживает. Документированное решение 04-02.
5. **listActiveEmployees() в movements.ts** (не employees.ts): files_modified плана не включал employees.ts; контракт «активные в пикерах» соблюдён (тест есть). Документированное решение 04-01.

### Required Artifacts

gsd verify.artifacts дал ложные «not found» на brace-expansion путях и суффиксах «(расширение)» во frontmatter планов — все файлы проверены вручную:

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/movement-schema.ts` | zod-схемы 5 действий + словарь 7 событий + C7 day-boundary | ✓ VERIFIED | 181 строка; strictObject, occurredAt-regex+refine, dispose comment min(1), transfer-refine по аргументу-держателю; CR-01 fix (DISPLAY_TZ wall-clock) в коде |
| `db/queries/movements.ts` | 7 guard-tx функций + listTimeline + listIssuedByEmployee | ✓ VERIFIED | 444 строки; ни одного UPDATE/DELETE movements; подключено actions.ts и обеими карточками |
| `app/(app)/devices/actions.ts` | 6 custody-действий requireSession-first + echo values | ✓ VERIFIED | все 6 действий вызывают queries (импорты :13-20), refresh() в каждом |
| `app/(app)/devices/device-actions.tsx` | матрица 4 статусов | ✓ VERIFIED | in_stock: Выдать·В ремонт·Списать; assigned: Принять·Передать·В ремонт·Списать (D-08); repair: Из ремонта·Списать; disposed → null |
| `app/(app)/devices/movement-dialogs.tsx` | 5 диалогов + ReturnAllDialog | ✓ VERIFIED | RepairDialog (обе стороны), DisposeDialog (красная primary, причина required), WR-02 zero-employees hint (:140-142) |
| `app/(app)/(card)/devices/[id]/timeline.tsx` + `page.tsx` | таймлайн + StatusPill + PhotoGrid | ✓ VERIFIED | route-таблица 7 событий, empty-state копи; disposed скрывает всю строку действий |
| `app/(app)/(card)/employees/[id]/page.tsx` | issued-список + return-all | ✓ VERIFIED | listIssuedByEmployee + «выдано {дата}» + pluralDevices + ReturnAllDialog |
| `lib/photos.ts` | лимиты, thumbKeyOf, containment, processPhoto | ✓ VERIFIED | sharp gate+rotate+resize+q82, PATH_ESCAPE, DISPOSED guard |
| `db/queries/attachments.ts` | cap-in-tx, IDOR-пара, delete | ✓ VERIFIED | insertWithCapCheck (count+INSERT одной tx), getAttachment строгая пара, deleteAttachment unlink-after-commit |
| `app/api/devices/[id]/photos/route.ts` | POST upload guard-first | ✓ VERIFIED | requireSession:60 первая строка; unlink обоих файлов при сбое; коды→4xx/415/409 |
| `app/api/attachments/[attachmentId]/route.ts` | GET serve + DELETE | ✓ VERIFIED | пара id+device обязательна, Content-Type image/jpeg жёстко, private+immutable, nosniff |
| `app/(app)/(card)/devices/[id]/photo-grid.tsx` | сетка/лайтбокс/delete-confirm/клиентский ресайз | ✓ VERIFIED | createImageBitmap+canvas ≤1600, accept=image/* multiple без capture, WR-01 refresh при частичном успехе (:119) |
| `tests/movements-queries.test.ts` / `tests/attachments-queries.test.ts` | guard/tx/timeline + pipeline тесты | ✓ VERIFIED | 52 + 20 кейсов, зелёные в моём прогоне |
| `scripts/smoke-custody.mjs` | e2e периметр + матрица + фото | ✓ VERIFIED | 634 строки, exit 0 в моём прогоне |

### Key Link Verification

gsd verify.key-links: 2/5 «verified» — три «отказа» суть tool-ограничения (паттерн-метка «action→queries» не литерал; относительные пути `device-actions.tsx`/`photo-grid.tsx` без директорий). Реальная проводка подтверждена вручную:

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `app/(app)/devices/actions.ts` | `db/queries/movements.ts` | импорт + вызовы 7 query-функций | ✓ WIRED | импорт :12-20; assignDevice:398, acceptDevice:422, transferDevice:453 и др. |
| `db/queries/movements.ts` | `db/queries/employees.ts` | Tx-тип/транзакционный шаблон | ✓ WIRED | тот же `Parameters<Parameters<db.transaction>>` паттерн |
| `device-actions.tsx` | UI-SPEC action matrix | полная матрица 4 статусов | ✓ WIRED | ветвление по status в коде + smoke-ассерты 4 статусов + D-08 |
| `app/api/devices/[id]/photos/route.ts` | `lib/photos.ts` | UPLOADS_DIR/containment/лимиты | ✓ WIRED | импорт :9-16; processPhoto/resolveUploadPath/thumbKeyOf в коде |
| `photo-grid.tsx` | `/api/attachments/[attachmentId]` | fetch POST/DELETE + router.refresh | ✓ WIRED | fetch к обоим маршрутам; refresh :119/:137 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| photo-grid.tsx | `photos` prop | `listByDevice(device.id)` в page.tsx:317 (SQL по attachments) | Yes | ✓ FLOWING |
| devices/page.tsx (список) | `coverAttachmentId` | батчевый SQL-скан attachments (queries/devices.ts:150-166) | Yes | ✓ FLOWING |
| timeline.tsx | `events` prop | `listTimeline(device.id)` (SQL LEFT JOIN) | Yes | ✓ FLOWING |
| employees/[id]/page.tsx | `issued` | `listIssuedByEmployee(employeeId)` (два батчевых SQL) | Yes | ✓ FLOWING |
| device-actions.tsx | `employees` prop | `listActiveEmployees()` (SQL is_active=1) | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

Выполнены моими прогонами на СВЕЖЕМ build (предыдущий .next был старше WR-01/WR-02 фиксов 10:59 — пересобрано перед smoke):

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Полный тестовый набор | `npx vitest run` | 184 passed / 184 (14 файлов; 52 movements + 20 attachments) | ✓ PASS |
| Продакшн-сборка | `npm run build` | exit 0; route table: + `/api/devices/[id]/photos`, + `/api/attachments/[attachmentId]` | ✓ PASS |
| Custody+фото e2e | `node scripts/smoke-custody.mjs` | exit 0: периметр 307; матрица 4 статусов; D-08; disposed view-only; upload→serve→delete; IDOR/CAP/DISPOSED/BAD_IMAGE | ✓ PASS |
| Регрессия устройств | `node scripts/smoke-devices.mjs` | exit 0: фото-сетка empty-state, «Выдать» (D-08), 404-матрица | ✓ PASS |
| Регрессия сотрудников | `node scripts/smoke-employees.mjs` | exit 0: «Пока ничего не выдано», архив-бейдж | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| `scripts/smoke-custody.mjs` | `bash`-equivalent `node scripts/smoke-custody.mjs` | exit 0 (полный вывод в Behavioral Spot-Checks) | PASS |
| `scripts/smoke-devices.mjs` | `node scripts/smoke-devices.mjs` | exit 0 | PASS |
| `scripts/smoke-employees.mjs` | `node scripts/smoke-employees.mjs` | exit 0 | PASS |

### Requirements Coverage

Все 8 ID фазы 4 из REQUIREMENTS.md (строки 110-117) заявлены планами (04-01: MOVE-01..05+EMP-02; 04-02: REG-04; 04-03: REG-05). Orphaned requirements: отсутствуют.

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| MOVE-01 | 04-01 | Выдать устройство сотруднику | ✓ SATISFIED | assignDevice guard-tx + AssignDialog + smoke «Выдать» |
| MOVE-02 | 04-01 | Принять на склад | ✓ SATISFIED | acceptDevice (returned from=держатель) + AcceptDialog |
| MOVE-03 | 04-01 | Передать сотруднику | ✓ SATISFIED | transferDevice (transferred from→to, adjacency) + TransferDialog |
| MOVE-04 | 04-01, 04-02 | Append-only событие на каждое движение; таймлайн кто/когда/от-кого/кому; нельзя править/удалять | ✓ SATISFIED | RAISE(ABORT) триггеры + тест abort; listTimeline double-join; grep UPDATE/DELETE = 0 |
| MOVE-05 | 04-01 | Держатель в одной транзакции; карточки всегда актуальны | ✓ SATISFIED | guard-UPDATE проекции в той же tx; карточки рендерят holder (page.tsx:251,271); «мгновенность» — UAT |
| REG-04 | 04-02 | Статусы только действиями; списанные остаются в базе с историей | ✓ SATISFIED | матрица 4 статусов; disposed финален (7 переходов блокированы), история читается |
| EMP-02 | 04-01 | Карточка сотрудника со списком выданной техники | ✓ SATISFIED | listIssuedByEmployee + «выдано {дата}» + smoke |
| REG-05 | 04-03 | Фото на карточке; миниатюры в списках | ✓ SATISFIED | пайплайн+сетка+обложки; e2e smoke |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | совпадений нет | — | — |

Дебт-маркеры (TBD/FIXME/XXX/TODO/HACK) в 14 файлах фазы: 0. Grep-совпадения «placeholder» — HTML-атрибуты input/textarea, не заглушки. `return null` в device-actions для disposed/неизвестного статуса — намеренный D-03 behavior, не стаб. Console.log-only реализаций нет.

### Prohibitions (test-tier) — все с wired enforcement

| Prohibition | Enforcement | Status |
| ----------- | ----------- | ------ |
| 01: статус/держатель не читаются из payload | source-тест (movements-queries:824,835) + мой grep formData.get('status'/'currentEmployeeId') = 0 | ✓ ENFORCED |
| 01: нет UPDATE/DELETE путей к movements | триггеры RAISE(ABORT) + тест :809 + grep = 0 | ✓ ENFORCED |
| 01: нет клиентской пагинации таймлайна | grep limit/offset в movements.ts = 0 | ✓ ENFORCED |
| 02: нет пути возврата из disposed | precondition-перечисление + тесты финальности (:543,572) | ✓ ENFORCED |
| 02: красные заливки только «Списать»+«Списано» | grep-gate тест :887 + smoke-ассерт | ✓ ENFORCED |
| 03: фото не через public/ | find public -upload = 0 (мой прогон) | ✓ ENFORCED |
| 03: Content-Type клиента не доверяется | magic-byte gate через sharp metadata в processPhoto | ✓ ENFORCED |
| 03: нет add/delete фото у disposed | DISPOSED guard в queries+роутах + smoke 409×2 | ✓ ENFORCED |

### Human Verification Required

См. секцию human_verification во frontmatter (5 пунктов): интерактивные раундтрипы выдачи/приёма/передачи/возврата-всего без F5, визуальная приёмка ремонт/списание, фото с телефона + сетка/лайтбокс, русский копи-контракт (backstop плана 01). Интерактивные диалоги спроектированы как human UAT (исполнение это подтверждает).

### Gaps Summary

Гэпов нет: ни одна истина не FAILED, все артефакты существуют/содержательны/проводаны (Level 1-4), все key links живые, все 8 требований закрыты, все test-tier prohibitions с исполнением, 184/184 теста и три smoke зелёные в моём собственном прогоне на свежем build. Статус human_needed исключительно из-за интерактивных/визуальных/аппаратных сценариев, недоступных автоматике: 2 behavior-unverified истины (живой refresh-раундтрип карточек; телефонная камера) + 5 UAT-пунктов.

---

_Verified: 2026-09-04T11:12:00Z_
_Verifier: Claude (gsd-verifier)_
