# Phase 10: Bulk-выдача и приём - Research

**Researched:** 2026-09-16
**Domain:** Next.js App Router (vendored 16.3.3) — client selection island поверх server-rendered списка + транзакционный multi-device query-слой (drizzle-orm/better-sqlite3, React 19 server actions)
**Confidence:** HIGH (все ключевые факты верифицированы в коде репозитория и в vendored node_modules; внешних зависимостей фаза не добавляет)

## Summary

Phase 10 добавляет массовые движения (выдать N одному сотруднику / принять N на склад) поверх двух уже отработанных в проекте прецедентов: (1) транзакционный multi-device write — `returnAllDevices` (db/queries/movements.ts:316) с одним событием на единицу, и (2) диалоговое семейство WR-01 split — movement-dialogs.tsx. Ничего нового изобретать не нужно: bulk = композиция guard-UPDATE транзакции из фазы 4 и диалоговой механики из фаз 4/9. Новая npm-зависимость ЗАПРЕЩЕНА (REQUIREMENTS Out of Scope) — и не нужна: vendored Base UI Checkbox 1.7 поддерживает tri-state нативно (`indeterminate` prop, верифицировано в node_modules/@base-ui/react).

Ключевые архитектурные ответы на вопросы из брифа:

1. **Чекбокс и Link.** Чекбокс НЕ кладётся внутрь `<Link>`: клик по чекбоксу всплывает до анкора и вызывает навигацию, вложение интерактивного контента в `<a>` невалидно по HTML-спецификации, а `stopPropagation`-фиксы хрупки (MDN/Spec; подтверждено веб-поиском — SO 15767083, Angular#11366). Правильный паттерн — сиблинг: `<li>` становится flex-строкой `[RowCheckbox][Link flex-1]`; навигация строки сохраняется, чекбокс независим.
2. **Сброс выделения при навигации.** Клиентский стейт переживает серверную подмену страницы (прецедент: clone-dialog «survives refresh() (the island persists)»). D-01 требует сброса при смене страницы/фильтра/поиска — решение: `key={filtersKey}` на provider-острове; любой переход (пагинация — server Link, фильтры/поиск — router.replace) меняет ключ → React размонтирует остров → чистый стейт.
3. **Blocker-отчёт из action (D-03).** Существующий `throw {code}` не носит данных. Прецедент расширяемого FormState уже есть (`CloneFormState.created`). Рекомендация: `BulkFormState` с `blockers?: Array<{id, model, status}>` и `results?: Array<{deviceId, eventType}>`; query-функция возвращает discriminated union вместо throw.
4. **Tri-state.** `Checkbox.Root` принимает controlled `checked: boolean` + `indeterminate: boolean`; Indicator рендерится при `checked || indeterminate` (CheckboxIndicator.js:31) — текущий враппер components/ui/checkbox.tsx покажет галочку в mixed-состоянии; нужен условный глиф (dash вместо CheckIcon).

**Primary recommendation:** один новый query-модуль-функционал рядом с `returnAllDevices` (превалидация SELECT внутри одной tx → blocker-отчёт ИЛИ loop guard-UPDATE + INSERT по событию на единицу), два bulk-экшена рядом с movement-экшенами, один client-provider-остров (selection + панель + диалоги), чекбоксы-сиблинги в строках, key-сброс по фильтрам.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Выделение**
- **D-01:** Чекбокс на КАЖДОЙ строке страницы (включая заведомо неeligible — см. D-02) + tri-state чекбокс в шапке списка («выбрать страницу»/снять/частично). Selection живёт в client-острове страницы, строго в пределах текущей страницы: смена страницы, фильтра или поиска сбрасывает выделение (selection не переживает навигацию — Out of Scope запрещает cross-page, и стейт между серверными переходами всё равно не живёт).
- **D-02:** Eligibility определяется действием, не строкой: «Выдать» требует статус `in_stock`; «Принять» принимает `assigned` (событие returned) И `repair` (событие from_repair). Прочие комбинации (выдать assigned, принять in_stock, что угодно с disposed) — блокируют операцию целиком.

**Транзакция и превалидация**
- **D-03:** Всё-или-ничего с превалидацией ВНУТРИ транзакции: один SELECT проверяет статусы всех выбранных единиц ДО записей; если хотя бы одна неeligible — ни одна запись не происходит, оператор видит, КАКАЯ единица и ПОЧЕМУ блокирует (модель + текущий статус). Паттерн — `returnAllDevices` (movements.ts, guard-UPDATE внутри tx) + композиция как в `cloneDevices`. Повторный клик не создаёт дублей: guard-условие в каждом UPDATE (status уже сменился → 0 rows → откат) + pending-disabled сабмит.
- **D-04:** Один диалог на партию: «Выдать» — один выбор сотрудника на все единицы (существующий combobox-паттерн movement-dialogs); «Принять» — без поля сотрудника. Общие для партии: одна дата `occurredAt` (дефолт «сегодня», DISPLAY_TZ-валидация «не в будущем» — как одиночные диалоги) и один опциональный комментарий.

**Отчёт и события**
- **D-05:** Итог — success-вью диалога со списком КАЖДОЙ единицы (модель · инвентарник · результат: «выдано ФИО» / «принято на склад» / «возвращено из ремонта») — оператор точно знает, сколько записано (SC 2/3). Не тост, не редирект.
- **D-06:** Успех пишет по одному movement-событию на каждую единицу (assign / returned / from_repair — соответствующие типы), общие occurredAt и комментарий — таймлайны согласованы с одиночными операциями. Выделение сбрасывается ТОЛЬКО после подтверждённого успеха.

### Claude's Discretion
- Плавающая панель: позиция/стиль (fixed bottom, Apple-эстетика), точные копи кнопок — ui-phase
- Имена: bulk-экшены в `actions.ts`, query-функция в movements.ts (рядом с returnAllDevices), остров selection
- Механика tri-state чекбокса (Base UI Checkbox с state='indeterminate')
- Тест-матрица: превалидация (смесь eligible/неeligible → откат), N событий с общим occurredAt, guard против повторного сабмита, границы N=страница (20), DISPLAY_TZ occurredAt

### Deferred Ideas (OUT OF SCOPE)
- Массовые ремонт/списание/передача — не в MOVE-06 (только Выдать/Принять)
- Cross-page выбор — Out of Scope (анти-фича REQUIREMENTS)
- Сканер штрихкодов для выделения — не запрошен
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MOVE-06 | Оператор выдаёт выбранные устройства одному сотруднику или принимает их на склад одним диалогом: выбор в пределах страницы списка, транзакция all-or-nothing с предварительной валидацией статусов, итог — отчёт по каждой единице | Selection island + tri-state (Base UI indeterminate, VERIFIED в node_modules); bulk tx с in-tx SELECT-превалидацией (паттерн returnAllDevices + guard-UPDATE, VERIFIED movements.ts); blocker-отчёт через расширение FormState-паттерна (прецедент CloneFormState.created); отчёт — success-вью диалога (паттерн clone-dialog success line) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Выделение строк (selection state, page-scoped) | Client (остров-провайдер) | — | Стейт живёт только на странице; сброс через key при навигации |
| Рендер строк списка и навигация строки | Server (RSC page.tsx) | Client (чекбоксы-листья) | Строки — server Links (существующий паттерн); чекбоксы — client-листья, потребляющие контекст через children-composition |
| Eligibility-решение (D-02) | API/Backend (query tx) | — | Сервер авторитетен (T-04-02); клиент не дизейблит кнопки по статусам |
| Превалидация + bulk-запись + события | Database/Storage (drizzle tx в query-слое) | API (action-обёртка) | Одна tx: SELECT-превалидация → записи; guard-UPDATE решает состояние |
| Blocker-отчёт и отчёт успеха | API (FormState payload) | Client (рендер в диалоге) | Структурированные данные едут в useActionState-стейте |
| Диалог партии (поля, отчёт) | Client (WR-01 split) | — | Механика movement-dialogs байт-в-байт |

## Standard Stack

**Новых пакетов НЕТ и быть не может** (REQUIREMENTS §Out of Scope: «любые новые npm-зависимости» запрещены). Весь стек уже в проекте — версии верифицированы в package.json.

### Core (уже установлены)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react / react-dom | 19.2.8 | useActionState (pending, echo), controlled checkbox state | Уже база всех островов; echo-values паттерн устоялся (коммит 4886f6a) |
| @base-ui/react | ^1.7.0 | Checkbox с `indeterminate` (tri-state) | Vendored; типы верифицированы в node_modules — три-стейт нативен |
| zod | ^4.5.4 | strictObject-белые списки payload (deviceIds[], employeeId?, occurredAt?, comment?) | Паттерн всех экшенов |
| drizzle-orm + better-sqlite3 | ^0.45.2 / ^13.0.3 | `db.transaction` (sync), `inArray`, guard-UPDATE `.changes` | Паттерн returnAllDevices/cloneDevices |
| next | 16.3.3 | server actions, `refresh()` из next/cache, Link | Vendored AGENTS.md: сверяться с node_modules/next/dist/docs при вопросах |

### Supporting (переиспользуется как есть)
| Компонент | Путь | Purpose |
|-----------|------|---------|
| Checkbox | components/ui/checkbox.tsx | Враппер Checkbox.Root; потребует маленького расширения для indeterminate-глифа |
| Dialog + useCloseOnOk | components/ui/dialog.tsx + movement-dialogs.tsx:232 | WR-01 split механика |
| EmployeePicker | movement-dialogs.tsx:75 | Combobox активных сотрудников (скрытый input employeeId) |
| OccurredAtField / CommentField | movement-dialogs.tsx:165/193 | Дата (today prefill + max) и комментарий с echo |
| deviceStatusLabel | lib/device-schema.ts:115 | Подписи статусов для blocker-отчёта («На складе», «Используется», «В ремонте», «Списано») |
| occurredAtFromDate / isNotFutureDate | lib/movement-schema.ts:74/88 | DISPLAY_TZ-валидация даты партии |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Controlled Set + ручной indeterminate | Base UI CheckboxGroup + `parent` prop | `parent` требует Checkbox.Group и value-linkage детей — наши «дети» разнесены по DOM-строкам; controlled Set проще и состояние уже нужно панели/диалогу |
| Чекбокс внутри Link + stopPropagation | Чекбокс-сиблинг рядом с Link | Вложение интерактивного в `<a>` невалидно и хрупко (клавиатура, middle-click); сиблинг — нулевой риск |
| Одна параметризованная bulk-функция | Две функции (bulkAssign/bulkAccept) | Две тонкие функции зеркалят assignDevice/acceptDevice и читаются как existing-словарь; общий приватный хелпер допустим |

**Installation:** ничего не устанавливается.

## Package Legitimacy Audit

Новых пакетов фаза не устанавливает (запрещено REQUIREMENTS Out of Scope; подтверждено CONTEXT.md). Аудит не применим.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Verified Code Seam Inventory

Все факты ниже проверены чтением кода в этой сессии.

### db/queries/movements.ts (504 строки)
- **Tx-тип** (стр. 18–19): `type Tx = Parameters<Parameters<DbHandle['transaction']>[0]>[0]` — переиспользовать для сигнатур с tx.
- **Guard-UPDATE семантика**: условный UPDATE `WHERE id AND status=<precondition>`, решение по `.changes === 0 → throw { code: 'ILLEGAL_TRANSITION' }` — ноль записей при незаконном переходе, нет read-then-write гонки (assignDevice стр. 86–109, acceptDevice 115–144).
- **`{ code }`-throws — обычные объекты, не Error**: `EMPLOYEE_INACTIVE` (assertActiveEmployee стр. 69–76), `ILLEGAL_TRANSITION`. Actions ловят их «лысым» catch.
- **returnAllDevices** (стр. 316–352): единственный multi-device tx — SELECT всех assigned сотрудника → loop (INSERT returned + UPDATE) → возвращает count. Прецедент «одно событие на единицу, общий event».
- **acceptDevice принимает ТОЛЬКО assigned** — для D-02 (принять assigned И repair) пер-девайсный цикл acceptDevice не годится; нужен двух-статусный precondition — прецедент `inArray(devices.status, [...])` в sendToRepair (стр. 203–213) и disposeDevice.
- **Типы событий**: assign → `assigned` (toEmployeeId), accept-assigned → `returned` (fromEmployeeId = держатель, читается внутри tx), accept-repair → `from_repair` (person slots null — прецедент returnFromRepair стр. 244–267).
- `listActiveEmployees()` (стр. 494) — источник опций combobox.

### lib/movement-schema.ts (180 строк)
- `movementSchemas` словарь; `assignSchema`/`acceptSchema` — strictObject с `z.coerce.number().int().positive()`, `occurredAtSchema` (DATE_PATTERN + isNotFutureDate refine), `commentSchema` max 500. eventType НИКОГДА не приходит из payload.
- `occurredAtFromDate(iso, now)` — выбранный день + DISPLAY_TZ-время «сейчас»; фиксированная точка в 2 шага, DST-безопасно. Вызывать ОДИН раз на партию (один Date на все события).

### app/(app)/devices/movement-dialogs.tsx (672 строки)
- **WR-01 split**: wrapper (trigger + open-state, остаётся смонтирован) / inner form (useActionState; портал размонтирует — чистая сессия). `useCloseOnOk` (стр. 232–236) закрывает по `state.ok`.
- **Echo-values**: `state.values?.field` в defaultValue; `role="alert"` блок ошибки; pending-disabled сабмит (против двойного клика).
- **EmployeePicker** (стр. 75–161): value = имя, id через hidden input `employeeId`; без create-option; два zero-state.
- Clone-dialog (фаза 9) показал расширение механики: `onDone(created)` прокидывает данные наверх, success-линия живёт в wrapper и переживает refresh() — прямой прецедент для D-05 success-вью.

### app/(app)/devices/page.tsx (270 строк)
- **PAGE_SIZE = 20** (стр. 26) — верхняя граница партии.
- **Строка = `<li key={row.id}><Link href={/devices/${row.id}} …>`** (стр. 155–230): Link — flex-контейнер со ВСЕЙ строкой (hover-фон, title-атрибут, thumbnail, pill статуса, WarrantyDate). Чекбоксу сюда влетать нельзя — перестройка `<li>` в flex `[checkbox][Link flex-1]`.
- **row уже несёт**: id, model, status, holder, serialNumber, inventoryNumber, typeKey, warrantyUntil, coverAttachmentId — всё, что нужно отчёту (модель · инвентарник) и selection-модели, без дополнительных запросов.
- Пагинация — server Links (buildDevicesQuery); фильтры/поиск — router.replace в startTransition (search-box.tsx). И то и другое — серверная подмена контента: клиентский стейт при этом ПЕРЕЖИВАЕТ (доказано комментарием clone-dialog «survives refresh() (the island persists)») — поэтому key-сброс обязателен.

### app/(app)/devices/actions.ts (647 строк)
- Паттерн экшена: `await requireSession()` ПЕРВЫМ → echo → zod safeParse → try/catch query → `refresh()` → `{ ok: true }`. Коды ошибок ({code}) маппятся на копи-таблицу; внутренности наружу не текут (V7).
- **FormState-семейство уже расширяемое**: `DeviceFormState`, `MovementFormState`, `CloneFormState` (с `created?: number`) — добавление `blockers?`/`results?` в новый `BulkFormState` — тот же приём, не новый паттерн.

### Base UI Checkbox 1.7 (vendored, node_modules + официальные доки)
- `CheckboxRootProps`: `checked?: boolean` (controlled), `indeterminate?: boolean` (дефолт false, независим от checked), `onCheckedChange?: (checked: boolean, …)`. State несёт `indeterminate: boolean`.
- `data-indeterminate` атрибут на Root и Indicator — стилизовать/тogli глиф.
- **Indicator рендерится при `checked || indeterminate`** (CheckboxIndicator.js: `const rendered = rootState.checked || rootState.indeterminate`) — текущий враппер в indeterminate покажет CheckIcon; для «минуса» — условный глиф в враппере (или стилизация по data-indeterminate).
- `parent`-режим (checkbox-as-group-controller) существует, но требует Checkbox.Group — в нашей топологии (шапка и строки в разных поддеревьях) проще controlled Set + ручной indeterminate.
- Рендерит `<span role=checkbox>` + скрытый `<input>`; клики всплывают по DOM как обычные (см. Pitfall 1).

## Architecture Patterns

### System Architecture Diagram

```
Оператор                     Список устройств (/devices, сервер)
   │                              │
   │ клик по чекбоксу строки      │  page.tsx (RSC): listDevices → rows
   ▼                              │        │ rows (id, model, inventoryNumber, status…) как props
[DeviceBulkProvider — client остров, key=buildDevicesQuery(filters,page)]
   │  selected: Set<deviceId>
   ├── RowCheckbox (клиент-лист в каждом <li>, СИБЛИНГ Link) ── toggle(id)
   ├── HeaderTriState (шапка списка) ── checked / indeterminate / select-all
   └── FloatingPanel «Выбрано: N» (fixed bottom, при size>0)
         ├── [Выдать] ──▶ BulkAssignDialog (WR-01 split)
         │       │ hidden deviceIds×N + EmployeePicker + occurredAt + comment
         │       ▼ useActionState
         │   bulkAssignDevicesAction (server action)
         │       │ requireSession → zod (1..20, strict) → query
         │       ▼
         │   bulkAssignDevices(deviceIds, employeeId, event)  [ОДНА tx]
         │       1. assertActiveEmployee
         │       2. SELECT id,model,status,holder WHERE id IN (…) ORDER BY id   ← превалидация
         │       3. blockers? → return {ok:false, blockers}   (НИ одной записи)
         │       4. loop: guard-UPDATE (WHERE id AND status='in_stock')
         │                 .changes===0 → throw ILLEGAL_TRANSITION → ROLLBACK ВСЕГО
         │          + INSERT movements('assigned', общий occurredAt/comment) на единицу
         │       5. return {ok:true, results:[{deviceId, eventType}]}
         │       ▼
         │   refresh() → список перерисовался
         │       ▼
         └── [Принять] ─▶ BulkAcceptDialog ─▶ bulkAcceptDevicesAction
                 то же, precondition IN ('assigned','repair'),
                 события: returned (from держатель) / from_repair (без лиц)

Диалог: state.ok   → success-вью (отчёт по КАЖДОЙ единице) + provider.clear()  ← D-05/D-06
        state.blockers → role=alert + список «модель · статус», форма и ВЫДЕЛЕНИЕ нетронуты ← D-03/SC4
        state.error  → generic копи + echo values
```

### Recommended Project Structure

```
app/(app)/devices/
├── page.tsx                  # + key-обёртка провайдера, перестройка <li> (checkbox-сиблинг)
├── device-bulk.tsx           # НОВЫЙ: provider-остров (selection Set, панель, три-стейт шапка)
├── bulk-dialogs.tsx          # НОВЫЙ: BulkAssignDialog/BulkAcceptDialog (или в movement-dialogs.tsx)
├── actions.ts                # + bulkAssignDevicesAction / bulkAcceptDevicesAction + BulkFormState
db/queries/movements.ts       # + bulkAssignDevices / bulkAcceptDevices (рядом с returnAllDevices)
lib/movement-schema.ts        # + bulkAssignSchema / bulkAcceptSchema (strictObject, 1..20)
tests/movements-queries.test.ts  # + bulk-матрица (или отдельный файл по образцу)
tests/movement-schema.test.ts    # + границы deviceIds
```

### Pattern 1: Bulk-транзакция с превалидацией (D-03)

**What:** одна sync-транзакция; SELECT-превалидация всех id ДО записей; blocker-отчёт возвращается, а не бросается; записи — loop guard-UPDATE + INSERT.
**When to use:** обе bulk-операции.

```typescript
// Source: паттерн returnAllDevices (movements.ts:316) + guard-UPDATE (assignDevice:86)
export type BulkBlocker = { id: number; model: string; status: string }
export type BulkOutcome =
  | { ok: true; results: Array<{ deviceId: number; eventType: string }> }
  | { ok: false; blockers: BulkBlocker[] }

export function bulkAssignDevices(
  deviceIds: number[], employeeId: number, event: EventInput = {},
): BulkOutcome {
  return db.transaction((tx) => {
    assertActiveEmployee(tx, employeeId)                       // EMPLOYEE_INACTIVE — как одиночный
    const rows = tx
      .select({ id: devices.id, model: devices.model, status: devices.status })
      .from(devices)
      .where(inArray(devices.id, deviceIds))
      .orderBy(asc(devices.id))
      .all()
    const byId = new Map(rows.map((r) => [r.id, r]))
    const blockers = deviceIds
      .filter((id) => byId.get(id)?.status !== 'in_stock')     // D-02: выдать только in_stock
      .map((id) => ({ id, model: byId.get(id)?.model ?? '—', status: byId.get(id)?.status ?? 'not_found' }))
    if (blockers.length > 0) return { ok: false, blockers }    // ни одной записи ещё не было
    const occurredAt = occurredOf(event)                       // ОДИН Date на партию
    const results: Array<{ deviceId: number; eventType: string }> = []
    for (const id of deviceIds) {
      const upd = tx.update(devices)
        .set({ status: 'assigned', currentEmployeeId: employeeId, updatedAt: new Date() })
        .where(and(eq(devices.id, id), eq(devices.status, 'in_stock')))
        .run()
      if (upd.changes === 0) throw { code: 'ILLEGAL_TRANSITION' }  // гонка/дубль id → откат всего
      tx.insert(movements).values({
        deviceId: id, eventType: 'assigned',
        fromEmployeeId: null, toEmployeeId: employeeId,
        comment: commentOf(event), occurredAt,
      }).run()
      results.push({ deviceId: id, eventType: 'assigned' })
    }
    return { ok: true, results }
  })
}
```

Bulk-accept отличается: precondition `inArray(devices.status, ['assigned','repair'])`; держатель для события `returned` берётся из SELECT-снапшота (колонка currentEmployeeId, как в acceptDevice); событие `from_repair` — без person slots (прецедент returnFromRepair).

### Pattern 2: Selection-остров с children-composition (D-01)

**What:** один client-провайдер владеет `Set<number>`; строки остаются server-rendered; чекбоксы — маленькие client-листья внутри `<li>`.
**Why:** контекст обновляется — children-prop стабилен, перерисовываются только листья; серверный рендер списка сохранён.

```tsx
// Source: паттерн «children as props» + clone-dialog «island persists»
// page.tsx (сервер):
<BulkSelection
  key={buildDevicesQuery(filters, current)}   // ЛЮБОЙ переход = новый key = чистый стейт (D-01)
  rows={rows.map((r) => ({ id: r.id, model: r.model, inventoryNumber: r.inventoryNumber, status: r.status }))}
  employees={listActiveEmployees()}
>
  <HeaderTriState />                          {/* можно отдельным листом над <ul> */}
  <ul>…<li className="flex items-center …">
        <RowCheckbox deviceId={row.id} />     {/* client-лист, СИБЛИНГ Link */}
        <Link … className="flex-1 …">…существующее содержимое строки…</Link>
      </li>…</ul>
</BulkSelection>
```

Tri-state шапки — полностью controlled:

```tsx
// Source: node_modules/@base-ui/react/checkbox/root/CheckboxRoot.d.ts (VERIFIED)
const allSelected = selected.size === rows.length && rows.length > 0
const someSelected = selected.size > 0 && !allSelected
<Checkbox
  checked={allSelected}
  indeterminate={someSelected}
  onCheckedChange={() => someSelected || allSelected
    ? setSelected(new Set())          // indeterminate/checked клик → снять всё
    : setSelected(new Set(rows.map((r) => r.id)))}  // пусто → вся страница
/>
```

### Pattern 3: Диалог партии + отчёт (D-04/D-05/D-06)

**What:** WR-01 split; inner form при `state.ok` рендерит отчёт вместо полей; выделение очищается в ok-эффекте.
**Why:** useCloseOnOk одиночных диалогов закрывает окно — bulk-вариант не закрывает, а переключает вью (SC 2: итог — отчёт, не редирект).

```tsx
// Source: movement-dialogs.tsx useCloseOnOk + clone-dialog onDone(data)
function BulkAssignForm({ deviceIds, rows, employees, onOk }: …) {
  const [state, formAction, pending] = useActionState(bulkAssignDevicesAction, {})
  useEffect(() => { if (state.ok) { onOk(); /* provider.clear() — ПОСЛЕ подтверждённого успеха (D-06) */ } }, [state, onOk])
  if (state.ok) return <BulkReport results={state.results} rows={rows} assigneeName={…} />  // «выдано ФИО»
  return (
    <form action={formAction} className="space-y-4">
      {deviceIds.map((id) => <input key={id} type="hidden" name="deviceIds" value={id} />)}
      <EmployeePicker … />          {/* как в AssignDialog */}
      <OccurredAtField … />         {/* today prefill, max — как везде */}
      <CommentField … />
      {state.blockers ? <BulkBlockers blockers={state.blockers} /> : null}  {/* модель · deviceStatusLabel */}
      {state.error ? <p className={ERROR_CLASS} role="alert">{state.error}</p> : null}
      <DialogActions pendingCopy="Выдаём…" label="Выдать" pending={pending} />
    </form>
  )
}
```

Payload-шейп (рекомендация, продолжение FormState-семейства):

```typescript
// Source: прецеденты CloneFormState.created и DeviceFormState.values (actions.ts)
export type BulkBlockerView = { id: number; model: string; status: string }
export type BulkResultView = { deviceId: number; eventType: string }
export type BulkFormState = {
  ok?: boolean
  error?: string                                   // generic копи «Не удалось выдать…»
  fieldErrors?: { employeeId?: string; occurredAt?: string }
  values?: Record<string, string>                  // echo даты/комментария (React 19 reset)
  blockers?: BulkBlockerView[]                     // D-03: какая единица и почему
  results?: BulkResultView[]                       // D-05: по единице на строку отчёта
}
```

Копи отчёта: `assigned → «выдано {ФИО}»` (ФИО берётся из выбранного EmployeeOption на клиенте), `returned → «принято на склад»`, `from_repair → «возвращено из ремонта»`; строка = «{модель} · {инвентарник} · {результат}» — модель/инвентарник уже в props rows острова.

### Anti-Patterns to Avoid
- **Цикл одиночных query-функций** (`deviceIds.map(assignDevice)`): N транзакций — сбой посередине оставляет половину партии. Только ОДНА tx.
- **Чекбокс внутри `<Link>` + stopPropagation**: невалидное вложение интерактивного контента; ломается на клавиатуре/middle-click; фикс хрупкий. Только сиблинг.
- **Очистка selection на submit/открытии диалога**: нарушение D-06/SC4 — только по `state.ok`.
- **Client-side дизейбл кнопок панели по статусам строк**: D-02 — eligibility принадлежит действию/серверу; блокирует целиком с отчётом.
- **Blocker-отчёт через throw {code}**: код не несёт данных; union-return из query.
- **Новый occurredAt на каждую единицу**: дата партии одна — один вызов occurredAtFromDate.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tri-state чекбокс | Свой span с тремя глифами / CSS-хаки | Base UI Checkbox `indeterminate` (уже в components/ui) | Доступность (role, клавиатура), data-атрибуты, формы — уже решены |
| All-or-nothing запись | Ручные компенсации/удаления при сбое | `db.transaction` + guard-UPDATE `.changes` | Паттерн фаз 4/9 верифицирован тестами; откат бесплатен |
| Превалидация статусов | Проверки на клиенте / по payload | SELECT внутри tx | Единственный источник истины — строка БД (T-04-02) |
| Валидация даты партии | Своя TZ-математика | occurredAtSchema + occurredAtFromDate | DISPLAY_TZ-класс багов уже закрыт (фаза 5, CR-01) |
| Combobox сотрудника | Новый пикер | EmployeePicker (movement-dialogs.tsx) | Фолд Ё/ё, zero-states, hidden-id — всё устоялось |
| Подписи статусов в отчёте | Параллельный словарь | deviceStatusLabel | Кейстоен-дисциплина: один словарь статусов |
| Двойной сабмит | Свой лок-флаг | pending из useActionState + disabled | Уже везде; + guard-UPDATE страхует серверно |

**Key insight:** фаза не вводит ни одного нового механизма — это композиция трёх верифицированных прецедентов (guard-UPDATE tx, WR-01 диалог, FormState payload). Риск не в неизвестном, а в аккуратности склейки (выделение/навигация/сброс).

## Common Pitfalls

### Pitfall 1: Чекбокс внутри Link перехватывается анкором
**What goes wrong:** клик по чекбоксу всплывает до `<a>` → серверная навигация вместо toggle; на обходе табом Space даёт тот же эффект; HTML невалиден (a не содержит интерактивных потомков).
**Why it happens:** Link занимает всю строку; кажется естественным вложить чекбокс в него.
**How to avoid:** чекбокс-сиблинг: `<li className="flex">[RowCheckbox][Link flex-1]</li>`. stopPropagation-вариант не использовать.
**Warning signs:** список «моргает» навигацией при клике по чекбоксу; a11y-обход фокуса ведёт на карточку.

### Pitfall 2: Selection переживает навигацию
**What goes wrong:** провайдер держит стейт через серверную подмену (пагинация Link, фильтры/поиск router.replace) — «Выбрано: N» остаётся от чужой страницы (нарушение D-01).
**Why it happens:** React сохраняет клиентский стейт при совпадении позиции в дереве; clone-dialog документирует это как фичу («island persists»).
**How to avoid:** `key={buildDevicesQuery(filters, current)}` (или key из filters+page) на провайдере — смена ключа размонтирует остров.
**Warning signs:** выделенные id отсутствуют на текущей странице; панель показывает N при пустом списке.

### Pitfall 3: acceptDevice не принимает repair
**What goes wrong:** bulk-accept, собранный циклом acceptDevice, падает на repair-единицах (guard требует assigned) — хотя D-02 требует принимать и их.
**Why it happens:** одиночная семантика ≠ партийная.
**How to avoid:** отдельная bulk-функция с precondition `inArray(status, ['assigned','repair'])` и двумя типами событий; держатель — из tx-снапшота.
**Warning signs:** blocker «В ремонте» при законной партии; or откат всей партии из-за одной repair-единицы.

### Pitfall 4: Повторный клик создаёт дубли событий
**What goes wrong:** двойной submit или гонка двух вкладок пишет вторую партию событий.
**Why it happens:** UI-pending не успевает / прямой POST.
**How to avoid:** (1) pending-disabled сабмит — уже в паттерне; (2) guard-UPDATE в цикле: вторая попытка получает `.changes===0` → throw → полный откат (события первой попытки не дублируются, т.к. первая уже сменила статусы).
**Warning signs:** в таймлайне по две «Выдачи» с одной секундой.

### Pitfall 5: Selection очищен при ошибке валидации
**What goes wrong:** оператор исправляет дату, а выделение слетело — переснимает 20 чекбоксов (нарушение SC 4).
**Why it happens:** очистка в onSubmit/в wrapper'е, а не в ok-эффекте.
**How to avoid:** clear() вызывать только в `useEffect` по `state.ok`; ошибки и blockers оставляют selection нетронутым.
**Warning signs:** после «Дата не может быть в будущем» панель исчезла.

### Pitfall 6: Массив deviceIds без границ/дедупликации
**What goes wrong:** подделанный POST с 10 000 id или дублями id; дубли дают двойные события в одной tx.
**Why it happens:** FormData.getAll вернёт всё.
**How to avoid:** zod `z.array(z.coerce.number().int().positive()).min(1).max(20)` (кап = PAGE_SIZE); дубли безвредны при guard-UPDATE (второй проход → throw → откат), но лучше дедупить в экшене перед query (Set).
**Warning signs:** таймаут экшена; странные повторные события.

### Pitfall 7: Отсутствующий id в превалидации
**What goes wrong:** устаревшая страница/подделка: id нет в SELECT — наивный `rows.length !== deviceIds.length` даёт невнятный отказ.
**How to avoid:** blocker на каждый отсутствующий/чужой id (`model: '—'`, статус `not_found`) — отчёт остаётся конкретным.
**Warning signs:** generic «Не удалось…» без объяснения при легитимном устаревании страницы.

### Pitfall 8: Indeterminate-глиф
**What goes wrong:** в mixed-состоянии враппер показывает галочку (Indicator рендерится при checked||indeterminate, а children — CheckIcon) — оператор читает «всё выбрано».
**How to avoid:** расширить враппер: условный глиф (MinusIcon) при indeterminate / стилизация по `data-indeterminate`.
**Warning signs:** скриншот шапки при частичном выборе.

## Code Examples

(Ключевые примеры встроены в Architecture Patterns — Pattern 1 bulk tx, Pattern 2 остров + три-стейт, Pattern 3 диалог/отчёт. Дополнение — schema и zod-границы:)

```typescript
// Source: lib/movement-schema.ts (assignSchema/acceptSchema образцы) — словарь дополнить:
const deviceIdsSchema = z.array(z.coerce.number().int().positive())
  .min(1, 'Выберите хотя бы одно устройство')
  .max(20)  // PAGE_SIZE списка; cap зеркалит page-scoped selection (D-01)

export const bulkAssignSchema = z.strictObject({
  deviceIds: deviceIdsSchema,
  employeeId: z.coerce.number().int().positive(),
  occurredAt: occurredAtSchema.optional(),
  comment: commentSchema.optional(),
})
export const bulkAcceptSchema = z.strictObject({
  deviceIds: deviceIdsSchema,
  occurredAt: occurredAtSchema.optional(),
  comment: commentSchema.optional(),
})
```

```tsx
// Source: page.tsx:155-230 — перестройка строки (сохранить hover/title/pill):
<li key={row.id} className="flex items-stretch">
  <RowCheckbox deviceId={row.id} />          {/* px-4 слева, shrink-0 */}
  <Link href={`/devices/${row.id}`} className="flex min-h-11 flex-1 items-center gap-3 px-4 py-2 …">
    {/* существующее содержимое без изменений */}
  </Link>
</li>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Одиночные movement-диалоги (1 карточка = 1 действие) | + Партийный диалог с отчётом по единицам | Эта фаза | actions.ts завершает churn (роадмап); next — только ⌘K |
| returnAllDevices — единственный bulk-write | + адресный bulk по явному списку id с blocker-отчётом | Эта фаза | Прецедент для будущих массовых ремонт/списание (deferred) |
| CloneDialog success-линия в wrapper | → Расширение того же приёма до full success-вью в диалоге | Эта фаза | Паттерн «диалог = отчёт операции» |

**Deprecated/outdated:** ничего в стеке; useActionState/refresh()/Server Components — текущие API Next 16 / React 19 (AGENTS.md: сверять specifics с node_modules/next/dist/docs при сомнении).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Контекст-провайдер с children-composition не перерисовывает server-children при смене selection (стандартная семантика React; children-prop стабилен) | Pattern 2 | Косметическая: лишние рендеры строк; не влияет на корректность |
| A2 | `key={buildDevicesQuery(filters, current)}` гарантированно размонтирует остров при любом переходе (пагинация/фильтры/поиск) | Pattern 2 / Pitfall 2 | Средний: выделение протечёт через навигацию (нарушение D-01); легко ловится UAT-сценарием |
| A3 | ФИО для «выдано ФИО» берётся из клиентского выбора EmployeePicker, а не с сервера | Pattern 3 | Низкий: рассинхрон имени (переименование между открытием и сабмитом); можно вернуть имя сервером в results при желании |
| A4 | Три-стейт клик-семантика (indeterminate → «снять всё» vs «выбрать всё») — discretion UI-фазы; зафиксирован вариант «частично → снять всё» | Pattern 2 | Низкий: чисто UX-выбор |
| A5 | Отсутствующий id в превалидации лучше показывать blocker'ом с `not_found`, а не generic-ошибкой | Pitfall 7 | Низкий: альтернатива — generic «Не удалось…» |

## Open Questions

1. **Форма bulk-функций: две функции или одна с kind-параметром**
   - What we know: одиночные аналоги — отдельные функции (assignDevice/acceptDevice); события и preconditions различаются.
   - What's unclear: предпочтение планировщика по объёму файла movements.ts.
   - Recommendation: две тонкие функции (зеркалят одиночные, читаются как existing-словарь); общий приватный хелпер при дублировании.
2. **Размещение bulk-диалогов: отдельный bulk-dialogs.tsx или extension movement-dialogs.tsx**
   - What we know: movement-dialogs.tsx уже 672 строки; clone-dialog вынесен отдельно (фаза 9).
   - Recommendation: отдельный файл по прецеденту clone-dialog; механика копируется, не абстрагируется.
3. **Откуда Report берёт модель/инвентарник при ok**
   - What we know: rows-props острова уже содержат обе колонки; серверный results несёт deviceId+eventType.
   - Recommendation: маппинг на клиенте по deviceId; сервер остаётся авторитетным по факту и типу события.

## Environment Availability

Фаза — code-only, внешних зависимостей не добавляет (новые npm-пакеты запрещены REQUIREMENTS). Шаг 2.6 audit: node/npm/vitest присутствуют (vitest прогнан: movements-queries 53/53 за 0.8 с); better-sqlite3, drizzle-kit на месте. Отсутствующих блокирующих зависимостей нет.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.11 (node env), тесты против temp-SQLite (helpers.applyMigrations) |
| Config file | vitest.config.ts (alias @, server-only stub) |
| Quick run command | `npx vitest run tests/movements-queries.test.ts` (0.8 с) |
| Full suite command | `npx vitest run` (341+ тестов, зелёный базлайн) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MOVE-06 | Превалидация: смесь eligible/неeligible → {ok:false, blockers}, ноль записей | unit | `npx vitest run tests/movements-queries.test.ts -t bulk` | ❌ Wave 0 (расширить файл) |
| MOVE-06 | Успех: N записей + ровно N событий с общим occurredAt/comment | unit | тот же | ❌ Wave 0 |
| MOVE-06 | Повторный вызов после успеха → ILLEGAL_TRANSITION, событий не добавилось | unit | тот же | ❌ Wave 0 |
| MOVE-06 | Смешанная партия assigned+repair при «Принять» → returned + from_repair | unit | тот же | ❌ Wave 0 |
| MOVE-06 | bulk assign неактивному сотруднику → EMPLOYEE_INACTIVE | unit | тот же | ❌ Wave 0 |
| MOVE-06 | Схема: deviceIds 0/21/дубль/мусор, дата в будущем | unit | `npx vitest run tests/movement-schema.test.ts` | ❌ Wave 0 (расширить) |
| MOVE-06 | UI: чекбоксы/панель/сброс при навигации/отчёт — не покрывается компонентным раннером (в проекте его нет — прецедент фаз 2/7) | UAT (оркестратор, Playwright MCP по сценариам) | ручной гейт end-of-phase | manual-only (justification: устоявшаяся практика проекта) |

### Sampling Rate
- **Per task commit:** quick-команда соответствующего тест-файла + `npx tsc --noEmit`
- **Per wave merge:** `npx vitest run` + `npm run build` + `npm run lint`
- **Phase gate:** полный сьют зелёный + build green перед /gsd:verify-work; UAT по прецеденту фазы 7

### Wave 0 Gaps
- [ ] bulk-тесты в tests/movements-queries.test.ts (по образцу describe returnAllDevices, стр. 640): фикс id-счётчика serial/inventory уже есть (newDevice/newEmployee хелперы)
- [ ] schema-тесты deviceIds-границ в tests/movement-schema.test.ts
- [ ] Component-раннера нет и не заводим — UI-ассерты через data-атрибуты (прецедент data-device-assign-id, data-clone-created) в UAT

## Security Domain

### Applicable ASVS Categories (level 1, enforcement on)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (унаследовано) | requireSession() ПЕРВЫМ действием каждого bulk-экшена (T-03-01; proxy не покрывает server actions) |
| V3 Session Management | indirect | Существующая сессия (jose cookie); ничего нового |
| V4 Access Control | yes | Guard-UPDATE из строки БД решает переход (T-04-02); payload-статусы игнорируются как класс; archived-сотрудник отклоняется assertActiveEmployee |
| V5 Input Validation | yes | zod strictObject: deviceIds массив 1..20 положительных int; employeeId только в assign-схеме (accept strict — инъекция = отказ); occurredAt «не в будущем»; comment ≤500 |
| V6 Cryptography | no | Криптографии в фазе нет |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Прямой POST мимо UI с неeligible id | Tampering/Elevation | In-tx SELECT-превалидация + guard-UPDATE; blocker-отчёт, ноль записей |
| Дубли/гигантский массив id | DoS/Tampering | zod max(20) + dedupe в экшене + throw-откат |
| Инъекция employeeId в «Принять» | Tampering | strictObject отклоняет лишний ключ (прецедент acceptSchema) |
| SQL-инъекция через id-массив | Tampering | drizzle parameterized inArray; сырый SQL не пишем |
| Утечка внутренних деталей ошибки | Information Disclosure | Только копи-таблица наружу; {code}-детали остаются в catch (V7) |

## Sources

### Primary (HIGH confidence)
- Код репозитория (прочитан в этой сессии): db/queries/movements.ts, lib/movement-schema.ts, app/(app)/devices/{page,actions,movement-dialogs,clone-dialog,device-actions,search-box}.tsx, db/queries/devices.ts, components/ui/checkbox.tsx, tests/movements-queries.test.ts, vitest.config.ts, package.json
- node_modules/@base-ui/react/checkbox/** (types + CheckboxIndicator.js) — tri-state API, parent, data-indeterminate, rendered = checked||indeterminate
- Официальные доки Base UI — base-ui.com/react/components/checkbox (indeterminate/parent/value, form submission)

### Secondary (MEDIUM confidence)
- WebSearch: вложение интерактивного контента в `<a>` и всплытие клика (MDN preventDefault; SO 15767083; Angular#11366; DevExpress q522069) — подтверждает выбор сиблинг-паттерна

### Tertiary (LOW confidence)
- нет — все LOW-уровневые допущения вынесены в Assumptions Log

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — новых пакетов нет; всё верифицировано в package.json/node_modules
- Architecture: HIGH — три прецедента (guard-tx, WR-01, FormState) прочитаны построчно; склейка описана до уровня сигнатур
- Pitfalls: HIGH — 8 из 8 привязаны к конкретным строкам кода/верифицированному поведению; A1–A5 — единственные допущения, все низкорисковые

**Research date:** 2026-09-16
**Valid until:** 2026-10-16 (стабильный стек; vendored зависимости не плывут)
