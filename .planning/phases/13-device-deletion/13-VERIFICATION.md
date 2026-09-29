---
phase: 13-device-deletion
verified: 2026-09-29T04:13:17Z
status: passed
score: 17/17 must-haves verified
behavior_unverified: 0 # both client-half truths exercised in-browser by orchestrator 2026-09-29 (see human_verification results)
overrides_applied: 0
behavior_unverified_items: []
human_verification:
  - test: "Сценарий несостоявшегося удаления: открыть диалог удаления устройства, параллельно (вторая вкладка) удалить то же устройство, затем подтвердить в первом диалоге"
    expected: "Диалог не закрывается; role=alert «Устройство уже удалено. Обновите страницу.» над формой; identity (модель/серийник/инвентарник) и счётчики не искажены; повторное нажатие «Удалить» возможно и даёт тот же alert"
    why_human: "Клиентская половина истин 5-6 и backstop BS3: переход useActionState error → alert в открытом диалоге не exercised ни юнит-тестом (use server не импортируется), ни UAT 9/9; присутствие + проводка доказаны (source-гейты redirect-вне-catch, role=alert-игла, WR-01 split), поведение — нет"
    result: "pass 2026-09-29 (оркестратор, Playwright, две реальные вкладки): диалог остался открыт, role=alert «Устройство уже удалено. Обновите страницу.», identity (Aspire 5) нетронута; серверная половина — ноль записей (юнит double delete)"
  - test: "Переполнение identity-блока (backstop BS1): создать устройство с очень длинными моделью/серийником/инвентарником, открыть диалог удаления"
    expected: "Длинные строки переносятся (break-words) внутри max-w-md, футер с кнопками не выталкивается, space-y-1 не ломается (урок 664d38e)"
    why_human: "Визуальное свойство рендера: механизмы в источнике (break-words ×3, *:min-w-0, max-w-md — проверены грепом), но реальный перенос не стресс-тестировался ни тестом, ни UAT (UAT-диалог рендерился короткими значениями)"
    result: "pass 2026-09-29 (оркестратор, Playwright, устройство с моделью 80×«М» без пробелов + длинным серийником): scrollWidth==clientWidth, футер видим, идентичность рендерится"
---

# Phase 13: Удаление устройств — Verification Report

**Phase Goal:** Оператор удаляет ошибочно добавленное устройство целиком одним подтверждённым действием — вместе с его историей — и устройство гарантированно исчезает со всех поверхностей учёта: реестр, поиск, ⌘K-палитра, дашборд, CSV-выгрузка.
**Verified:** 2026-09-29T04:13:17Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

Все 5 Success Criteria роадмапа верифицированы в кодовой базе: юнит-матрица 31/31 (tests/device-delete.test.ts + tests/ru.test.ts, прогон верификатором), parity-обход шести поверхностей зелёный, UAT 9/9 на prod-сборке с sign-off пользователя 2026-09-29. Два клиентских error-пути плана 02 присутствуют и проводкой корректны, но их рантайм-переходы ни разу не исполнены — маршрутизированы в human verification (ниже); это единственное, что отделяет фазу от passed.

### Observable Truths

Roadmap SC (контракт) + must_haves обоих планов:

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| SC1 | Удаление одним подтверждённым действием; карточка исчезает; старый URL → 404 | ✓ VERIFIED | deleteDeviceAction (actions.ts:799-817) → redirect('/devices','replace') вне try/catch; notFound-контракт page.tsx:3,33-37; UAT 1-3 pass (11 → 404) |
| SC2 | История уходит каскадом в одной транзакции; сирот ноль; лента чиста | ✓ VERIFIED | deleteDevice (devices.ts:688-721) one-tx; тест «device with children» + «whole-DB movements count identical» зелёные; UAT 4 pass (лента без SN-LVCF11) |
| SC3 | Исчезает со всех поверхностей (реестр/поиск/⌘K/дашборд/CSV/«выданное») | ✓ VERIFIED | parity-тест «disappears everywhere; control does not drift» (6 поверхностей, независимые ассерты, контрольное устройство) зелёный; UAT 5 pass; git diff фазы — ноль правок read-кода |
| SC4 | Удаление ≠ списание | ✓ VERIFIED | тест whole-DB movements count до==после зелёный; UAT 6/8: списание выполнено в ходе UAT, работает как раньше |
| SC5 | Карточки сотрудников корректны: исчезает из «выданного», остальное не задето | ✓ VERIFIED | parity-тест listIssuedByEmployee: целевое отсутствует, контрольное на месте (строки 287-290 теста); UAT 5 |
| 1.1 | Одна транзакция уносит movements + attachments + devices; сирот ноль | ✓ VERIFIED | devices.ts:688-707: снапшот → DELETE движения → DELETE вложения → DELETE устройство; юнит-тест raw-счётчиками зелёный |
| 1.2 | Throw внутри tx откатывает всё: ноль записей, контроль нетронут | ✓ VERIFIED | тест «unknown id: DEVICE_GONE and ZERO writes» зелёный (49ms прогон) |
| 1.3 | Файлы фото отсутствуют на диске к возврату; клон-младенец = no-op | ✓ VERIFIED | unlink-цикл 708-720 после COMMIT; existsSync==false для оригинала+thumb в тесте; childless no-op тест зелёный |
| 1.4 | Повторное удаление → DEVICE_GONE при нуле записей | ✓ VERIFIED | guard `.changes===0` (единственный .changes в slice — grep=1); тест double delete зелёный |
| 1.5 | Нет ни на одной из шести поверхностей при нулевых правках read-кода | ✓ VERIFIED | parity-тест + diff b65b07e..043208d: movements.ts только комментарий (5 строк), devices.ts только imports+deleteDevice |
| 1.6 | Удаление не создаёт ни одной записи movements | ✓ VERIFIED | тест «whole-DB movements count identical» зелёный |
| 2.1 | Тихая зона видна для всех четырёх статусов, включая disposed | ✓ VERIFIED | page.tsx:380 после disposed-ternary (253) и canMutate-условия (368) — последний ребёнок section; позиционный source-гейт зелёный; UAT 6-7 (disposed-карточка: зона есть, custody/«Редактировать» скрыты) |
| 2.2 | Клик открывает красный диалог с identity-блоком и счётчиками | ✓ VERIFIED | device-delete-dialog.tsx:100-140 (все байт-иглы source-гейтом); UAT 1 pass |
| 2.3 | Счётчики плюрализованы Intl.PluralRules('ru'), «фото» несклоняемое | ✓ VERIFIED | pluralMovementRecords (ru.ts:51); матрица 0/1/2/5/21/22/111 + live-пруф 111→many — 16/16 зелёные; UAT: «3 записи истории и 0 фото» |
| 2.4 | Pending-disabled; двойной клик не удаляет дважды | ✓ VERIFIED | disabled={pending} (dialog:59); серверная половина — двойное удаление поведенчески протестировано (DEVICE_GONE, ноль дрейфа) |
| 2.5 | DEVICE_GONE → role=alert в открытом диалоге; на сервере ноль записей | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Сервер: тест double delete зелёный. Клиент: маппинг код→копия до return (actions.ts:814) + role=alert рендер (dialog:43-47) присутствуют и проводкой корректны, но переход не exercised ни тестом, ни UAT — см. Human Verification |
| 2.6 | Общий сбой → generic-копия; диалог остаётся открытым | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Маппинг fallback верифицирован (actions.ts:815 + source-гейт нуля машинных возвратов); «диалог остаётся открытым» — рантайм-свойство без единого прогона — см. Human Verification |
| 2.7 | Клон-младенец видит тот же приговор; сервер делает ноль unlink | ✓ VERIFIED | childless no-op тест (пустой цикл unlink) зелёный; UAT рендерил photoCount=0; строка composed из протестированных частей |
| 2.8 | Опустевшие view перекрашиваются существующими zero-results состояниями | ✓ VERIFIED | diff фазы: ноль новых списков/копий UI; UAT 5: substring-поиск → «Ничего не найдено» |
| 2.9 | Сбой unlink невидим BY DESIGN: fs-ошибки глотаются, нет UI-поверхности | ✓ VERIFIED | swallowing try/catch (devices.ts:711-719) с doc-комментарием; grep фазового диффа — ноль поверхностей fs-ошибок |
| 2.10 | Dismiss закрывает диалог; WR-01 split сбрасывает alert между открытиями | ✓ VERIFIED | UAT 2 pass («Не удалять» — ноль изменений); DialogClose + onOpenChange={setOpen} (Base UI); useActionState во inner-компоненте (unmount с порталом) |
| 2.11 | Assigned-устройство исчезает из «выданного» структурно | ✓ VERIFIED | parity-тест listIssuedByEmployee — удаление строки devices, без списков исключений |

**Score:** 15/17 truths verified (2 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `db/queries/devices.ts` → deleteDevice | one-tx дети→родитель + post-commit unlink | ✓ VERIFIED | devices.ts:688-721; единственный guard .changes===0; 0 DISPOSED в slice; экспортирован, вызван actions.ts:811 |
| `lib/device-schema.ts` → deviceDeleteSchema | z.strictObject, единственный ключ deviceId | ✓ VERIFIED | ru-комментарий кейстоуна; strictObject deviceId coerce positive int (строки 210-213); импортирован actions.ts |
| `tests/device-delete.test.ts` | матрица ножей + parity + source-gates | ✓ VERIFIED | 432 строки, 15 тестов — все зелёные при прогоне верификатором (31/31 вместе с ru.test.ts) |
| `app/(app)/devices/actions.ts` → deleteDeviceAction + DeviceDeleteFormState + копии | контракт фазы 12 | ✓ VERIFIED | actions.ts:439-441, 793-817; requireSession первая строка; redirect вне try/catch |
| `app/(app)/devices/device-delete-dialog.tsx` | DeviceDeleteDialog (wrapper + inner form) | ✓ VERIFIED | 147 строк; WR-01 split; все байт-иглы; импортирован page.tsx:28, отрендерен :380 |
| `app/(app)/(card)/devices/[id]/page.tsx` зона | после PhotoGrid, вне disposed-ternary | ✓ VERIFIED | строка 380 > 368 (canMutate) > 362 (PhotoGrid) > 253 (ternary); historyCount/photoCount из .length |
| `lib/ru.ts` → pluralMovementRecords | LDML-таблица | ✓ VERIFIED | ru.ts:40-51; импортирован диалогом |
| `tests/ru.test.ts` | плюрал-матрица | ✓ VERIFIED | 16 тестов зелёные (матрица + live-пруф чекера) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| device-delete-dialog.tsx | actions.ts deleteDeviceAction | useActionState + form action={formAction}, hidden deviceId | ✓ WIRED | dialog:15,39,48-49; алиас @/app/(app)/devices/actions |
| page.tsx | device-delete-dialog.tsx | .length пропы уже вычисленных запросов | ✓ WIRED | listTimeline:215, listByDevice:216 → historyCount/photoCount:385-386 — реальные запросы, FLOWING |
| actions.ts | db/queries/devices.ts deleteDevice | try/catch только вокруг вызова | ✓ WIRED | actions.ts:810-813 |
| actions.ts | lib/device-schema.ts deviceDeleteSchema | safeParse FormData | ✓ WIRED | actions.ts:805-807 |
| deleteDevice success | redirect('/devices') → 404 | redirect вне try/catch + notFound() контракт | ✓ WIRED | actions.ts:816; page.tsx:3,33-37; UAT 3 (404 подтверждён) |
| DEVICE_GONE {code} | русская копия до возврата | catch-маппинг | ✓ WIRED | actions.ts:813-815; ноль машинных возвратов (grep=0) |
| storage_key snapshot | unlink пары [key, thumbKeyOf(key)] | resolveUploadPath после COMMIT | ✓ WIRED | devices.ts:693-700, 708-720; ключи только из БД-снапшота |
| deleteDevice perimeter | ровно один аудированный delete-путь | перевёрнутый гейт devices-queries.test.ts:606-614 | ✓ WIRED | expect(destructive).toEqual(['deleteDevice']) зелёный |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| page.tsx delete zone | timelineEvents.length / photos.length | listTimeline(device.id) / listByDevice(device_id) — hoisted :215-216 | Да (те же запросы, что кормят Timeline/PhotoGrid) | ✓ FLOWING |
| DeviceDeleteDialog | state.error | useActionState(deleteDeviceAction) — серверный маппинг {code}→копия | Да (юнит-пин через source-gates) | ✓ FLOWING |
| диалог identity | model/serialNumber/inventoryNumber | device.* — строка карточки, уже загруженная page.tsx | Да | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Матрица ножей + source-gates + плюрал-матрица | `npx vitest run tests/device-delete.test.ts tests/ru.test.ts` | 31/31 pass (845ms) | ✓ PASS |
| Полный suite / tsc / build | (оркестратор, spot-check) | 483/483; tsc чист; build зелёный | ✓ PASS (не перевыводился) |
| Parity-обход шести поверхностей | включён в прогон выше (тест «disappears everywhere») | pass | ✓ PASS |
| Double delete / rollback / файлы на диске | включены в прогон выше | pass | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| — | `find scripts -path '*/tests/probe-*.sh'` | 0 файлов | N/A — фаза не миграция/CLI; «probe 13-RESEARCH» — исследовательские DB-пробы, свёрнутые в юнит-матрицу (rollback/.changes/FK) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| DEL-01 | 13-01, 13-02 | Удалить устройство целиком одним действием с явным подтверждением | ✓ SATISFIED | deleteDevice + deleteDeviceAction + диалог D-02; UAT 1-3, 7 pass; sign-off пользователя |
| DEL-02 | 13-01, 13-02 | Исчезает из реестра, поиска, ⌘K, дашборда, CSV; история удаляется вместе | ✓ SATISFIED | parity-обход шести поверхностей (юнит) + UAT 4-5; ноль правок read-кода |

Orphaned requirements: none — REQUIREMENTS.md Traceability отображает ровно DEL-01/DEL-02 → Phase 13, оба плана декларируют [DEL-01, DEL-02], unmapped: 0.

### Prohibitions (must-NOT)

| Prohibition | Status | Evidence |
| ----------- | ------ | -------- |
| Никакого статус-предусловия в deleteDevice (D-01) | ✓ RESOLVED | grep DISPOSED в slice = 0; перманентный source-гейт «existence is the only guard» зелёный |
| Ноль правок read-запросов ради parity (D-06) | ✓ RESOLVED | git diff: movements.ts — только doc-комментарий (исполняемые строки нетронуты); devices.ts — только imports+deleteDevice; parity-тест зелёный |
| Файлы не удаляются до COMMIT (D-04) | ✓ RESOLVED | unlink-цикл структурно после закрытия db.transaction (devices.ts:708+) |
| redirect никогда не внутри try/catch (Pitfall 1) | ✓ RESOLVED | actions.ts:816 — последнее выражение после catch; source-гейт позиционности зелёный |
| Машинные коды не возвращаются клиенту (V7) | ✓ RESOLVED | grep `error:\s*\{\s*code` в actions.ts = 0; маппинг до return |
| Никакого нативного confirm / type-to-confirm (D-02) | ✓ RESOLVED | grep confirm( в острове = 0; input-гейт: единственный input — hidden deviceId |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | Не обнаружено: 0 TBD/FIXME/XXX/PLACEHOLDER, 0 console.log, 0 stub-возвратов во всех 10 файлах фазового диффа | ℹ️ | Чисто |

Deviation-аудит (оба задокументированы исполнителями, легитимны):
1. Переворот perimeter-гейта «devices are never deleted» → «ровно один аудированный delete-путь» (tests/devices-queries.test.ts:606-614) — посылка старого гейта отменена решением владельца D-03; новый гейт громче старого.
2. `redirect('/devices', 'replace')` строковым литералом вместо объектной формы — установленная сигнатура Next 16.3.3 `redirect(url, type?: RedirectType)`; семантика replace сохранена (план сам назначил фолбэк A1).

### D-01..D-06 Honoring (13-CONTEXT)

| Decision | Honored | Evidence |
| -------- | ------- | -------- |
| D-01 (зона для всех статусов, вне custody) | ✓ | page.tsx:380 вне ternary:253 и canMutate:368; UAT 6 |
| D-02 (красный диалог, без нативного confirm) | ✓ | диалог по байт-регистру; гейты; UAT 1-2 |
| D-03 (одна транзакция, guard DEVICE_GONE) | ✓ | devices.ts:688-707; юнит-матрица |
| D-04 (unlink после COMMIT, ключи из БД) | ✓ | devices.ts:693-720; existsSync-тест |
| D-05 (redirect на /devices, 404 старого URL) | ✓ | actions.ts:816; notFound-контракт; UAT 3 |
| D-06 (структурный parity, ноль правок read-кода) | ✓ | diff-аудит + parity-тест + UAT 5 |

### Human Verification Required

### 1. Несостоявшееся удаление: alert в открытом диалоге (истины 2.5-2.6 + backstop BS3)

**Test:** Открыть диалог удаления устройства; во второй вкладке удалить то же устройство; подтвердить в первом диалоге. Повторить нажатием «Удалить».
**Expected:** Диалог открыт; role=alert «Устройство уже удалено. Обновите страницу.»; identity/счётчики целы; повторная попытка даёт тот же alert (или generic-копию при общем сбое).
**Why human:** Серверная половина протестирована, клиентский переход useActionState→alert ни тестом, ни UAT 9/9 не запускался; 'use server'-модуль не импортируется из vitest по дизайну.

### 2. Переполнение identity-блока (backstop BS1)

**Test:** Создать устройство с очень длинными моделью/серийником/инвентарником; открыть диалог удаления.
**Expected:** break-words переносит строки внутри max-w-md; футер не выталкивается; space-y-1 не ломается.
**Why human:** Визуальное свойство; механизмы в источнике (break-words ×3, *:min-w-0, max-w-md) греп-верифицированы, реальный перенос не стрессировался.

### Gaps Summary

Gaps (блокирующих) нет. Оба плана выполнены в заявленном скоупе: 10 файлов фазового диффа = ровно files_modified обоих планов + задокументированный переворот гейта; 768 вставок / 10 удалений; ноль новых пакетов; drizzle/ не тронут. Все 5 SC роадмапа, 6 запретов и все ключевые связи верифицированы кодом и поведенческими тестами; UAT 9/9 с sign-off пользователя закрыл браузерные human-check планов (SC1-SC5, dismiss, 404, disposed-зона, клон-младенец, «Списать работает как раньше»).

Статус human_needed — а не passed — исключительно из-за двух error-путей плана 02 (клиентские половины истин 2.5-2.6 + backstops BS1/BS3): код присутствует, проводка верна и прикреплена source-гейтами, но ни один тест и ни один UAT-сценарий не запускал переход «сбой удаления → alert в открытом диалоге» и стресс-переполнение identity. Оба пункта закрываются одной короткой Playwright-сессией поверх существующей UAT-инсталляции.

---

_Verified: 2026-09-29T04:13:17Z_
_Verifier: Claude (gsd-verifier)_
