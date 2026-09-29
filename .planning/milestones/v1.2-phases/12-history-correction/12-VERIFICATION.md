---
phase: 12-history-correction
verified: 2026-09-28T14:25:00Z
status: passed
score: 19/19 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_uat: "12-UAT.md — 9/9 pass, user sign-off «pass» 2026-09-28 (status: resolved)"
---

# Phase 12: Правка и удаление записей истории — Verification Report

**Phase Goal:** Оператор исправляет собственные ошибки ввода в истории устройства — правит любую запись (сотрудник, дата, тип действия, комментарий) или удаляет её целиком — и учёт остаётся непротиворечивым: таймлайн и текущее состояние устройства (держатель, статус) отражают правку сразу, потому что выводятся из исправленной истории.
**Verified:** 2026-09-28T14:25:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Roadmap SC wording is the contract; Plan 01 truth 1 («после миграции 0002 UPDATE/DELETE легальны, suite зелёный, custody-потоки как раньше») restates SC5 and is folded into it.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: оператор правит сотрудника/дату/тип/комментарий; запись встаёт на своё место по дате | ✓ VERIFIED | `editMovementAction` → `editMovement` (db/queries/movements.ts:595); тест «timeline reorders by the new date» — прогнан верификатором, pass; UAT сценарий 2 pass |
| 2 | SC2: удаление записи после явного подтверждения — запись исчезает | ✓ VERIFIED | `MovementDeleteConfirmDialog` + `deleteMovementAction` → `deleteMovement` (movements.ts:664); UAT сценарий 7 pass |
| 3 | SC3: статус/держатель обновляются сразу везде (карточка, реестр, «выдано» у сотрудника) — выводятся из истории | ✓ VERIFIED | replay-проекция в tx правки + `refresh()` в обоих действиях; тест listIssuedByEmployee-паритета (movement-edit.test.ts:374); UAT сценарии 2/7/8 — держатель и реестр без перезагрузки |
| 4 | SC4: валидация правки паритетна созданию; невалидные изменения не сохраняются с внятной ошибкой | ✓ VERIFIED | Матрица схем (movement-edit.test.ts:46–235); копии байт-точны по 12-UI-SPEC §Copywriting Contract (сверено дословно); UAT сценарии 3/5/6 pass |
| 5 | SC5: append-only снят миграцией в цепочке (не обходом); существующие потоки работают | ✓ VERIFIED | `drizzle/0002_drop_movement_triggers.sql` — ровно два `DROP TRIGGER IF EXISTS` с байт-точными именами 0000; journal idx 2 + 0002_snapshot.json; dev-БД `sqlite_master` триггеров не содержит (проверено верификатором); инвертированные тесты + migrate-runner тесты; полный suite 460/460 (оркестратор) |
| 6 | editMovement — одна транзакция: составной WHERE id AND device_id, .changes===0 → MOVEMENT_GONE; невалидный итог → полный откат, ноль записей | ✓ VERIFIED | Код movements.ts:600–657 прочитан дословно; именованный тест «invalid chain = zero writes» прогнан верификатором — pass; тест чужого movementId (movement-edit.test.ts:467) |
| 7 | deleteMovement — тот же tx-контракт; повторное удаление → MOVEMENT_GONE | ✓ VERIFIED | Код movements.ts:664–684; тест «re-deleting is a cheap explicit MOVEMENT_GONE» (:492) в зелёном suite |
| 8 | Проекция status/currentEmployeeId == полный replay (ORDER BY occurredAt ASC, id ASC) в той же tx; INVALID_CHAIN → ROLLBACK | ✓ VERIFIED | replayChain (:522–577) — точное зеркало listTimeline DESC,DESC (:721); тест детерминизма на общем occurredAt (:548); именованный тест D-03 — pass |
| 9 | Replay стартует из in_stock/null: цепочка без «Поступления» валидна, удаление первой записи разрешено, удаление «Списания» возвращает на склад | ✓ VERIFIED | Тесты D-05 (:411) и D-06 (:425) в зелёном suite; UAT сценарий 8 — «после удаления записи: На складе» |
| 10 | editMovementSchema: паритет с create (будущая дата DISPLAY_TZ, словарь, >500, dispose min 1, strictObject); occurredAt ОБЯЗАТЕЛЕН — очищенная дата → «Введите корректную дату» | ✓ VERIFIED | lib/movement-schema.ts:176–214 прочитан; enum деривирован от MOVEMENT_EVENT_LABELS (:162, параллельного списка нет); occurredAtSchema реюзнут (не копия); тесты «rejects a CLEARED date both ways» (:172), future date (:159), strictObject (:193) |
| 11 | Смена слота требует активного сотрудника; нетронутый архивный id сохраняется | ✓ VERIFIED | movements.ts:627–630 — assertActiveEmployee только по CHANGED слотам; тесты OQ2 (:507, :526) в зелёном suite |
| 12 | listTimeline отдаёт fromId/toId рядом с именами (parity RecentMovementView) | ✓ VERIFIED | movements.ts:711–713, тип MovementEventView расширен; имена остаются текстом (D-05) |
| 13 | На каждой строке таймлайна — «Исправить»/«Удалить» с data-timeline-edit/delete; пустая история триггеров не имеет | ✓ VERIFIED | timeline.tsx: единый рецепт в map-цикле без матрицы статусов, иглы :130/:138, empty state :85–94 без триггеров; UAT сценарий 1 (включая received и disposed-карточку) |
| 14 | Диалог правки префиллится записью; смена типа перекраивает слоты; «Списание» → обязательная textarea; очищенная дата блокируется | ✓ VERIFIED | movement-edit-dialogs.tsx: defaultValue={occurredAtDate} (:297), slotsOf + typeChanged (:215–218, :264–288), dispose-textarea (:306–324); UAT сценарии 2/3/4/5 pass |
| 15 | Delete-диалог: текст записи нейтральным чернилом, hint, «Удалить» сплошной #D70015, dismiss «Не удалять», только Dialog primitives | ✓ VERIFIED | movement-edit-dialogs.tsx:386–445; `--destructive: #D70015` в globals.css:92 (токен байт-точен); нативный confirm — negative-grep == 0; UAT сценарий 7 |
| 16 | После успеха обоих диалогов refresh() перекрашивает все поверхности без перезагрузки | ✓ VERIFIED | refresh() в editMovementAction (:749) и deleteMovementAction (:770) до `{ ok: true }`; UAT сценарии 2/7/8 — мгновенное обновление |
| 17 | INVALID_CHAIN и MOVEMENT_GONE — role=alert байт-точно, диалог открыт, весь ввод сохранён | ✓ VERIFIED | INVALID_CHAIN_COPY = «Такое изменение делает историю невозможной (проверьте порядок выдач и возвратов).» — байт-сверено с UI-SPEC:161; MOVEMENT_GONE_COPY — с :162; role=alert (:232, :420); echo через values; source-gate «machine {code} literals never return» (:611); UAT сценарий 6 |
| 18 | Оба действия: requireSession первой строкой, keystone strictObject, {code} не покидают сервер | ✓ VERIFIED | actions.ts:721, :759; source-gate тесты (:596, :603, :611) в зелёном suite |
| 19 | Disposed-карточка: триггеры таймлайна есть, custody/«Редактировать»/«Клонировать» скрыты как прежде | ✓ VERIFIED | Timeline рендерится вне условного блока `device.status !== 'disposed'` (page.tsx:246, остров :334); UAT сценарий 8 |

**Score:** 19/19 truths verified (0 present, behavior-unverified)

Поведенческие истины (state transitions D-03/D-05/D-06, reorder, projection) доказаны не присутствием символов, а: (а) именованными тестами, прогнанными верификатором в собственном процессе; (б) полным suite 460/460 (оркестратор, 2026-09-28); (в) Playwright UAT 9/9 на prod-сборке с юзерским sign-off.

**Backstops (plan 02, verification: backstop × 5):** подтверждены явными доказательствами 12-UAT.md, не abstain: overflow 500-символьного комментария (сценарий 9 — найден и исправлен 664d38e, перепроверен), длинные ФИО (сценарий 9), смена типа с reshape (сценарий 4), echo при провале (сценарий 6), disposed-карточка + un-dispose (сценарий 8).

### Prohibitions (judgment tier, 6 items — все с конкретным код-эвиденсом, ни одного silent pass)

| Prohibition | Verdict | Evidence |
|---|---|---|
| Мутации movements только с device-scope (составной WHERE) | Verified | movements.ts:607–609, :641–643, :668–671; тест чужого movementId; негативный исход тамперинга покрыт |
| Статус/держатель никогда из payload, никогда инкрементально | Verified | Проекция пишется только из replayChain-результата (:647–656, :673–682); negative-grep formData.get('status'/currentEmployeeId') == 0; source-gate :603 |
| Снятие append-only только миграцией в цепочке; push/PRAGMA/рантайм-дропы запрещены | Verified | 0002 в journal (idx 2), применяется scripts/migrate.mjs; grep DROP TRIGGER/writable_schema по app/db/lib/scripts == 0; drizzle-kit migrate упомянут только как отклонённый путь в комментариях |
| Имена сотрудников на таймлайне — никогда ссылки | Verified | timeline.tsx рендерит имена в `<p>` как текст; ids едут в props снапшота для префилла |
| Слоты выводятся только из (тип, whitelisted-ввод); клиентский селект — не авторитет | Verified | editMovement: деривация слотов из eventType+input (:616–625); strictObject режет лишние ключи; тест :193 |
| Ноль нативных подтверждений и ноль параллельных словарей | Verified | negative-grep window.confirm == 0; опции селекта и routeLine — из movementEventLabel/keystone (timeline.tsx:4, dialogs :75–77) |

### Deferred Items

None — no deferred items (Step 9b not triggered: gaps list empty).

### Required Artifacts

10/10 artifacts VERIFIED (gsd-tools verify.artifacts: all_passed=true; wiring confirmed by grep).

| Artifact | Expected | Status | Details |
|--------|----------|--------|---------|
| `drizzle/0002_drop_movement_triggers.sql` | Два DROP TRIGGER IF EXISTS с байт-точными именами | ✓ VERIFIED | 4 строки, `--> statement-breakpoint`, имена совпадают с 0000 |
| `drizzle/meta/_journal.json` | idx 2, tag 0002_drop_movement_triggers | ✓ VERIFIED | Цепочка 0→1→2; применяется раннером |
| `drizzle/meta/0002_snapshot.json` | Snapshot в цепочке | ✓ VERIFIED | Файл существует |
| `lib/movement-schema.ts` | editMovementSchema, deleteMovementSchema, occurredAtDateIso, movementSchemas.edit | ✓ VERIFIED | Все экспорты; enum деривирован; occurredAtSchema реюзнут; movementSchemas.edit:290 |
| `db/queries/movements.ts` | replayChain, editMovement, deleteMovement, fromId/toId | ✓ VERIFIED | :522/:595/:664/:711; WIRED (вызываются actions.ts) |
| `db/schema.ts` | Правдивый коммент таблицы movements | ✓ VERIFIED | :117–120 — append-only снят 0002, редактирование через серверный слой |
| `tests/movement-edit.test.ts` | Матрица HIST-01..03 + source-gates | ✓ VERIFIED | 32 теста; 2 прогнаны верификатором поимённо — pass |
| `app/(app)/devices/actions.ts` | editMovementAction, deleteMovementAction, DELETE_ERROR, echo/fieldErrors, editPayload | ✓ VERIFIED | :426/:702/:717/:755; requireSession-first; refresh(); {code}-маппер |
| `app/(app)/(card)/devices/[id]/timeline.tsx` | Client-остров: снапшот, построчные триггеры, keyed state | ✓ VERIFIED | 'use client'; TimelineEventSnapshot; data-иглы; один диалог максимум |
| `app/(app)/(card)/devices/[id]/movement-edit-dialogs.tsx` | MovementEditDialog + MovementDeleteConfirmDialog | ✓ VERIFIED | Оба компонента верхнеуровневые; префиллы; деструктив #D70015 |
| `app/(app)/(card)/devices/[id]/page.tsx` | Сериализация острова | ✓ VERIFIED | occurredAtFormat + occurredAtDateIso (строки, без Date); employees один раз; deviceId пропом |

### Key Link Verification

9/9 WIRED (gsd-tools нашёл 0 — ключи в планах строковой формы; проверены вручную grep/чтением).

| From | To | Via | Status |
|------|----|----|--------|
| MovementEditDialog/MovementDeleteConfirmDialog | editMovementAction/deleteMovementAction | import '@/app/(app)/devices/actions' + useActionState | ✓ WIRED |
| editMovementAction/deleteMovementAction | editMovement/deleteMovement | прямой вызов в try-блоке, {code}-маппер в catch | ✓ WIRED |
| editMovement/deleteMovement | replayChain → UPDATE devices | одна db.transaction; throw в replay = полный откат | ✓ WIRED |
| replayChain ORDER BY occurredAt ASC, id ASC | listTimeline DESC,DESC | точное зеркало, id-tiebreaker load-bearing | ✓ WIRED |
| occurredAtDateIso (сервер) → input[type=date] → occurredAtFromDate (action) | один DISPLAY_TZ-контракт | page.tsx:345 → dialogs:297 → actions:741; occurredAt как есть (revise-фикс) | ✓ WIRED |
| data-timeline-edit/delete → keyed open-state | контролируемые диалоги без trigger | timeline.tsx:79–83, :151–171; trigger-паттерн не используется | ✓ WIRED |
| deviceId={device.id} → проп острова → hidden input | оба диалога | page.tsx:335 → Timeline → dialogs :238/:425 | ✓ WIRED |
| listActiveEmployees() сериализован один раз | остров Timeline | page.tsx:347 — один вызов на остров (server-dedup-props) | ✓ WIRED |
| tests/helpers.ts applyMigrations | ВСЕ drizzle/*.sql лексикографически | helpers.ts:26–34 — 0002 подхватывается без правок хелпера | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|--------|--------------|--------|-------------------|--------|
| Timeline (page.tsx) | events | listTimeline(device.id) — SQL double-join по movements/employees | Да (живой запрос) | ✓ FLOWING |
| Timeline | employees | listActiveEmployees() — SQL | Да | ✓ FLOWING |
| MovementEditDialog | prefill | снапшот строки (toId/fromId/names/dates из БД) | Да | ✓ FLOWING |
| editMovementAction | parsed payload | FormData → zod coerce → occurredAtFromDate → editMovement → SQL tx | Да | ✓ FLOWING |

Статических/пустых источников нет; на call-site нет захардкоженных пустых props.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|--------|---------|--------|--------|
| D-03: INVALID_CHAIN = ноль записей | `npx vitest run tests/movement-edit.test.ts -t "invalid chain = zero writes"` | 1 passed / 31 skipped, 725ms | ✓ PASS |
| SC1: правка переставляет запись по дате | `npx vitest run tests/movement-edit.test.ts -t "reorders by the new date"` | 1 passed / 31 skipped, 746ms | ✓ PASS |
| SC5: dev-БД без триггеров, journal в цепочке | node better-sqlite3 readonly: sqlite_master triggers | `[]`; journal 0:0000, 1:0001, 2:0002 | ✓ PASS |
| Полный suite (оркестратор, 2026-09-28) | `npx vitest run` | 460/460 green; tsc, build, eslint чисты | ✓ PASS |

Полный suite верификатором не дублировался (прецедент оркестратора принят; single-run constraint).

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| 12-UAT (9 сценариев, prod-сборка :3100, Playwright MCP) | 12-UAT.md | 9/9 pass + backstop-находка исправлена (664d38e) и перепроверена | ✓ PASS |
| Юзерский sign-off | 12-UAT.md frontmatter | status: resolved; signoff: user pass 2026-09-28 | ✓ CLOSED |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-----------|------------|-------------|--------|----------|
| HIST-01 | 12-01, 12-02 | Правка записи: сотрудник, дата, тип действия, комментарий | ✓ SATISFIED | SC1 + truths 6/10/11/13/14; оба плана заявляют ID |
| HIST-02 | 12-01, 12-02 | Удаление записи с подтверждением | ✓ SATISFIED | SC2 + truths 7/13/15; DELETE_ERROR canonical |
| HIST-03 | 12-01, 12-02 | Таймлайн и статус отражают изменения сразу | ✓ SATISFIED | SC3 + truths 8/9/12/16; replay-проекция + refresh() |

Orphaned requirements: none — REQUIREMENTS.md маппит на Phase 12 ровно HIST-01..03, оба плана заявляют все три ID. DEL-01/02 корректно остаются за Phase 13.

Примечание (не гэп фазы): чекбоксы и колонка Status в REQUIREMENTS.md остаются `- [ ]`/«Pending» — бухгалтерия трассировки обновляется на уровне milestone, на достижение цели фазы не влияет.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER во всех 9 тронутых файлах | none | Совпадений 0 |
| — | — | Заглушки/пустые реализации/статические данные на пути правки | none | Не обнаружены (уровень 4 — FLOWING) |
| — | — | Устаревшие комменты про append-only (Pitfall 8) | none | README:192, db/schema.ts:117–120, заголовок movements.ts — переписаны на новую истину |

### Human Verification Required

None outstanding. UAT-чекпоинт плана 02 закрыт: 12-UAT.md — 9/9 сценариев (Playwright на prod-сборке) + юзерский sign-off «pass» 2026-09-28, frontmatter status: resolved. Визуальные истины (тихость триггеров, нейтральное чернило delete-блока, красный деструктив, отсутствие дрейфа рельсы) покрыты подписанным UAT.

### Gaps Summary

No gaps. Оба плана выполнены дословно плану (2 автокоррекции в 12-01 и 2 в 12-02 — все четыре корректировали тестовую обвязку/инфраструктуру, прод-код следует плану). Известный leftover «admin-скрипты едят пайп-stdin» — вне скоупа фазы. Фаза 13 (DEL) получает снятый DELETE-триггер и паттерн confirm-деструктива, как заявлено в provides.

---

_Verified: 2026-09-28T14:25:00Z_
_Verifier: Claude (gsd-verifier)_
