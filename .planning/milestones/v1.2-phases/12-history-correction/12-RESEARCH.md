# Phase 12: Правка и удаление записей истории - Research

**Researched:** 2026-09-28
**Domain:** SQLite/Drizzle migration (trigger removal) + event-sourcing-style replay projection + Next.js Server Action dialogs
**Confidence:** HIGH (codebase archaeology verified by direct reading; migration mechanics probe-verified; design semantics flagged for planner)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Тип действия у записи редактируем; person-слоты подстраиваются под новый тип (у «Выдачи» — только «кому», у «Возврата» — только «от кого», у «Передачи» — оба). Полный арсенал исправления на месте; неверный тип события правится, а не удаляется с пересозданием.
- **D-02:** Редактируемые поля записи: тип действия, сотрудник (по слотам типа), дата, комментарий. Валидация полей — паритет с созданием: даты через DISPLAY_TZ-контракт (`isNotFutureDate`/`occurredAtFromDate`), сотрудник только из активных (паритет `assertActiveEmployee`), комментарий ≤ 500.
- **D-03:** Строгий replay-контроль: после правки/удаления вся цепочка движений устройства проигрывается по `occurredAt`; невалидный итог (две «Выдачи» подряд, «Возврат» без выдачи, …) → правка отклоняется с внятной ошибкой, ноль записей. Статус устройства всегда честный — SC3 фазы буквально.
- **D-04:** Статус/держатель после правки пересчитываются replay'ем всей цепочки (проекция), а не инкрементальным патчем — статус в БД это проекция, которую сегодня пишут действия (`db/queries/movements.ts` guard-UPDATE); правка истории ломает эту модель, единственный честный пересчёт — полный replay в одной транзакции.
- **D-05:** Удаление самой первой записи «Поступление» разрешено; цепочка без поступления валидна (replay стартует из `in_stock` — устройство «уже есть»). Единая семантика без особых случаев.
- **D-06:** Правка/удаление записей у списанного устройства разрешены наравне со всеми. Побочный эффект принят осознанно: удаление записи «Списание» = **отмена списания** (replay вернёт устройство на склад) — закрывает существующую дыру «отмены списания нет вовсе» без отдельной фичи. Это осознанный разворот коммента v1.0 в `disposeDevice` («no code path leads back») — финальность остаётся для ДЕЙСТВИЙ (кнопки «Списать» нет из disposed), снимается только правкой истории.
- **D-07:** «Исправить» и «Удалить» живут на каждой записи таймлайна карточки устройства. Диалоги — реюз паттерна movement-dialogs (Server Action + zod + {code}-ошибки с русским текстом); удаление — с подтверждением, показывающим текст удаляемой записи. Отдельного режима редактирования нет.

### Claude's Discretion
- После правки/удаления остаёмся на карточке устройства (прецедент клона)
- Стартовое состояние replay — `in_stock`; отсутствующее «Поступление» не делает цепочку невалидной
- Сортировка таймлайна не меняется (occurredAt DESC, id tiebreaker — backdated события живут своей датой)
- Аудит правок не ведётся (прямая правка решена владельцем на старте вехи; корректирующие записи отклонены)
- Миграция: DROP триггеров append-only (`drizzle/0000`: movements UPDATE/DELETE → ABORT) новой миграцией в цепочке, применение через `scripts/migrate.mjs` (прецедент serial→nullable фазы 9) — это SC12#5 из роадмапа, не discretion
- EmployeePicker для правки сотрудника — реюз onPick-варианта из bulk-dialogs

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope

**Phase boundary (CONTEXT.md):** Правка **полей** устройства (updateDeviceAction) и фаза 13 (удаление устройств) — вне этой фазы.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HIST-01 | Оператор может исправить запись в истории устройства — сотрудника, дату, тип действия и комментарий | Edit schema в keystone (eventType из словаря + person-слоты по типу + DISPLAY_TZ-дата + комментарий ≤500); edit Server Action + one-tx replay; диалог реюзом movement-dialogs паттерна (§Architecture Patterns, §Code Examples) |
| HIST-02 | Оператор может удалить ошибочную запись из истории устройства с подтверждением | DELETE в той же one-tx replay-модели; диалог подтверждения с текстом записи (прецедент dispose/unarchive — Dialog primitives, window.confirm запрещён) |
| HIST-03 | После правки или удаления записи таймлайн и текущий статус устройства (держатель, статус) отражают изменения сразу | Replay-проекция в той же транзакции (D-04) + `refresh()`; таймлайн перечитывает movements (порядок derived), listIssuedByEmployee parity автоматична (issuedAt = max(occurred_at) assigned-событий — §Architecture Patterns) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- `CLAUDE.md` = `@AGENTS.md` → **Next.js agent-rules block**: «This is NOT the Next.js you know» — перед написанием любого кода читать релевантный гайд в `node_modules/next/dist/docs/` (в репо установлен next 16.3.3, доки в комплекте: `01-app/`, `02-pages/`, `03-architecture/`). Heed deprecation notices. Блок пишется `next dev` — коммитить как есть.
- GSD workflow enforcement: прямые правки репо вне GSD-команд запрещены (CLAUDE.md workflow-секция).
- **USER MANDATE:** skill `vercel-react-best-practices` обязан соблюдаться в research/планах/коде и проверяться на ревью (загружен в этой сессии; ключевые правила для фазы: `server-serialization`, `server-dedup-props`, `server-auth-actions`, `rerender-no-inline-components`, `js-early-exit`).
- Russian UI, Apple-эстетика (apple-design гайды), один пользователь, requireSession-first на каждом действии.

## Summary

Фаза добавляет к существующей custody-модели обратные операции: UPDATE и DELETE строк `movements` с полным replay-пересчётом проекции устройства. Сегодня это невозможно физически: два DB-триггера в миграции 0000 (строки 94–101) роняют любой UPDATE/DELETE с `RAISE(ABORT)` [VERIFIED: drizzle/0000_amusing_talon.sql]. Архитектурно фаза состоит из четырёх частей: (1) миграция 0002, снимающая триггеры — механика hand-written миграции в drizzle-цепочке **probe-верифицирована** против точных версий репо (drizzle-kit 0.31.10 + drizzle-orm 0.45.2): `drizzle-kit generate --custom --name=...` создаёт файл 0002_*.sql, journal-entry (idx=2, when=now) и снапшот, продолжающий цепочку — последующий `generate` фазы 13 продолжит с idx 3 корректно; (2) replay-функция — одна транзакция: SELECT цепочки (occurredAt ASC, id ASC) → прогон по матрице переходов, зеркальной guard-UPDATE-предусловиям шести существующих действий → невалидная цепочка = throw = полный откат (ноль записей, D-03) → валидная = UPDATE/DELETE события + UPDATE devices.status/currentEmployeeId в том же tx (D-04); (3) два Server Actions (edit/delete) по устоявшемуся контракту: requireSession → zod strictObject → query-tx → refresh(); (4) UI — кнопки на каждой строке таймлайна (D-07), диалоги реюзом movement-dialogs паттерна.

Критичный кодbase-факт, меняющий дизайн: **`received`-события реально существуют в данных** — `scripts/seed.mjs` создаёт «Поступление» каждому засеянному устройству (строка 241), хотя ни одно приложение-действие его не пишет (createDevice вставляет ноль событий). Поэтому replay-матрица обязана определять семантику `received`, а «Поступление» в списке типов правки — осмысленный выбор. Второй критичный факт: `listIssuedByEmployee` («выдано {дата}» у сотрудника) уже считается от assigned-событий через max(occurred_at) — после replay-правки parity сохраняется автоматически, отдельной работы не требуется [VERIFIED: db/queries/movements.ts].

**Primary recommendation:** Одна новая query-функция `applyHistoryEdit`/`applyHistoryDelete` (или единая с флагом) в `db/queries/movements.ts` — one-tx: replay всей цепочки устройства по матрице переходов → валидно: мутируй строку + перепиши проекцию; невалидно: throw `{code:'INVALID_CHAIN', ...}` → полный откат. Валидация полей — новая edit-схема в keystone `lib/movement-schema.ts` (первый пользовательский eventType, `z.enum` по словарю). Миграция 0002 через `drizzle-kit generate --custom`, контент — два `DROP TRIGGER IF EXISTS`. UI: Timeline становится единым client-островом (events + employees сериализуются ОДИН раз — правило server-dedup-props), строки + диалоги внутри.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Валидация правки (тип/слоты/дата/комментарий) | API/Backend (zod в keystone + Server Action) | — | Паритет с созданием — схемы живут в `lib/movement-schema.ts`, клиенту не доверяется ничего |
| Replay-валидация цепочки (D-03) | API/Backend (query-слой, один tx) | Database/Storage | Честность цепочки решается только на данных; throw внутри tx = ноль записей |
| Пересчёт статуса/держателя (D-04) | Database/Storage (UPDATE devices в tx) | — | Проекция — это строки devices; пишется тем же tx, что и правка события |
| Снятие append-only (SC5) | Database/Storage (drizzle-миграция 0002 через runner) | — | Воспроизводимо на сервере; не обход триггеров кодом |
| Кнопки «Исправить»/«Удалить» на строках таймлайна | Browser/Client (client-остров Timeline) | Frontend Server (RSC отдаёт events+employees) | Интерактив диалогов — клиент; данные — сервер; один остров ради server-dedup-props |
| Диалоги правки/удаления + подтверждение | Browser/Client (movement-dialogs паттерн) | — | useActionState во внутренней форме (WR-01 split), echo-values при ошибке |
| Паритет «выдано {дата}» у сотрудника | Database/Storage (derived query) | — | listIssuedByEmployee уже считается от movements — после replay согласован автоматически |

## Standard Stack

Новых пакетов фаза не требует — всё уже в репо и обкатано v1.0–v1.1.

### Core (существующие, версии из package.json / node_modules)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.3.3 | Server Actions + `refresh()` из next/cache | Устоявшийся контракт всех 12 действий репо; доки в `node_modules/next/dist/docs/` [VERIFIED: package.json + node_modules] |
| react | 19.2.8 | useActionState, client-острова | Паттерн movement-dialogs [VERIFIED: package.json] |
| zod | 4.5.4 | strictObject-валидация payload'ов | Каждый экшен репо; edit-схема продолжит [VERIFIED: package.json] |
| drizzle-orm | 0.45.2 | Типизированные UPDATE/DELETE movements внутри tx | Единственный ORM проекта [VERIFIED: package.json] |
| drizzle-kit | 0.31.10 | `generate --custom` для миграции 0002 | Официальный путь hand-written миграций; probe-верифицирован [VERIFIED: probe] |
| better-sqlite3 | 13.0.3 | Синхронные tx, триггеры, DROP TRIGGER | Движок проекта; runner уже решает FK-прагму [VERIFIED: package.json + scripts/migrate.mjs] |
| vitest | 4.1.11 | Юнит-тесты replay/схем/миграции | 25 файлов, 425 тестов green на baseline этой сессии [VERIFIED: прогон] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Base UI Dialog (components/ui/dialog) | в составе @base-ui/react | Диалоги правки/удаления/подтверждения | Прецедент dispose/unarchive/clone [VERIFIED: components/ui] |
| EmployeePicker (movement-dialogs) + onPick-вариант (bulk-dialogs) | — | Выбор сотрудника в диалоге правки | D-discretion: реюз onPick-варианта [VERIFIED: bulk-dialogs.tsx:70-114] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DROP триггеров (миграция) | Замена на «мягкую» защиту в коде | Отклонено CONTEXT.md — DROP в цепочке миграций воспроизводим на сервере; мягкая защита = обход инварианта |
| Ручная правка journal (_journal.json) | `drizzle-kit generate --custom` | --custom делает то же самой + снапшот-цепочку автоматически и верифицировано; ручная правка — источник «No snapshot was found» ошибок [CITED: github.com/drizzle-team/drizzle-orm/issues/6166] |
| Timeline → один client-остров | Клиент-кнопка на каждой строке (N островов) | N×сериализация списка сотрудников нарушает server-dedup-props; один остров сериализует employees один раз |
| Инкрементальный патч статуса | Полный replay (D-04) | Отклонено владельцем: replay — единственный честный пересчёт при правке середины цепочки |

**Installation:** Ничего не устанавливается. Единственная команда цепочки миграций: `npx drizzle-kit generate --custom --dialect=sqlite --out=drizzle --schema=./db/schema.ts --name=drop_movement_triggers` (или с дефолтным конфигом репо — probe запускался с явными флагами).

## Package Legitimacy Audit

Фаза не устанавливает внешних пакетов — все зависимости уже в package.json и работают в проде с v1.0. Gate не запускался за отсутствием кандидатов; новых реестровых обращений нет. Если план введёт пакет (не ожидается) — прогнать `gsd-tools query package-legitimacy check --ecosystem npm <pkg>` до включения в план.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                        КАРТОЧКА УСТРОЙСТВА (RSC, /devices/[id])
                                      │
                    listTimeline() ── events ──┐
                    listActiveEmployees() ──┐  │
                                            ▼  ▼
                              ┌──────────────────────────┐
                              │  Timeline (client-остров) │  ← employees сериализуются 1 раз
                              │  строка: «Исправить»      │     (server-dedup-props)
                              │          «Удалить»        │
                              └──────┬──────────┬────────┘
                                     │          │ подтверждение с текстом записи
                                     ▼          ▼
                        ┌────────────────┐  ┌────────────────┐
                        │ EditDialogForm │  │ DeleteConfirm  │
                        │ useActionState │  │ useActionState │
                        └───────┬────────┘  └───────┬────────┘
                                │ FormData          │ FormData
                                ▼                   ▼
                     editMovementAction   deleteMovementAction      (Server Actions)
                     requireSession → zod strictObject+enum → occurredAtFromDate
                                │                   │
                                └─────────┬─────────┘
                                          ▼
                       ┌─────────────────────────────────────────┐
                       │  db.transaction (один tx — весь атом)   │
                       │  1. SELECT цепочки: occurredAt ASC,     │
                       │     id ASC                              │
                       │  2. REPLAY по матрице переходов         │
                       │     невалидно → throw {code} → ROLLBACK │
                       │     (ноль записей — D-03)               │
                       │  3. UPDATE/DELETE movements             │
                       │     WHERE id AND device_id (.changes)   │
                       │  4. UPDATE devices: status,             │
                       │     currentEmployeeId, updatedAt (D-04) │
                       └────────────────┬────────────────────────┘
                                        │ COMMIT
                                        ▼
                              refresh() (next/cache)
                                        │
             ┌──────────────┬───────────┼──────────────┬─────────────┐
             ▼              ▼           ▼              ▼             ▼
        карточка       строка       список «выдано»  лента и      таймлайн
        устройства     реестра      у сотрудника     счётчики     (перечитан)
        (status/holder) (+филтры)   (max occurred_   дашборда
                                    at assigned)
```

### Recommended Project Structure
```
lib/movement-schema.ts          # + editMovementSchema (eventType enum, слоты по типу)
db/queries/movements.ts         # + replayChain(tx, deviceId) + editMovement() + deleteMovement()
app/(app)/devices/actions.ts    # + editMovementAction, deleteMovementAction
app/(app)/(card)/devices/[id]/
├── timeline.tsx                # → client-остров: строки + кнопки (D-07)
└── movement-edit-dialogs.tsx   # или внутрь timeline.tsx: Edit/Delete диалоги
drizzle/0002_drop_movement_triggers.sql   # generate --custom + 2 DROP TRIGGER
tests/movement-edit.test.ts     # replay-матрица, проекция, миграция
```

### Pattern 1: Replay-проекция в одной транзакции (D-03/D-04)
**What:** Вся цепочка событий устройства перечитывается и прогоняется через матрицу переходов; итоговое состояние пишется в devices тем же tx, что и правка строки.
**When to use:** Каждое edit/delete действие. Никогда — на чтении (таймлайн остаётся derived-запросом).
**Матрица переходов** (рекомендация — зеркалит guard-UPDATE предусловия шести действий и seed-поведение; старт replay: `status='in_stock', holder=null`):

| Событие | Предусловие (status) | Результат | Лицо-слот, из которого берётся держатель |
|---------|----------------------|-----------|------------------------------------------|
| received | in_stock | in_stock, holder=null | — (D-05: старт из in_stock делает «Поступление» валидной первой записью; seed создаёт received первым — chain остаётся валидной) |
| assigned | in_stock | assigned, holder=toEmployeeId | to (обязателен) |
| transferred | assigned | assigned, holder=toEmployeeId | to (обязателен); from не кросс-валидировать (см. OQ3) |
| returned | assigned | in_stock, holder=null | — |
| to_repair | in_stock \| assigned | repair, holder=null | — |
| from_repair | repair | in_stock, holder=null | — |
| disposed | in_stock \| assigned \| repair | disposed, holder=null | — |

Любое нарушение предусловия → `throw {code:'INVALID_CHAIN'}` → ROLLBACK → ноль записей. Это ровно контракт bulk-throw (Pitfall 4 фазы 10) и D-03 дословно.
**Example:**
```typescript
// Sketch — финальную форму утвердит план; стиль db/queries/movements.ts
function replayChain(
  tx: Tx,
  deviceId: number,
): { status: string; currentEmployeeId: number | null } {
  const events = tx
    .select()
    .from(movements)
    .where(eq(movements.deviceId, deviceId))
    .orderBy(asc(movements.occurredAt), asc(movements.id)) // зеркало DESC-таймлайна
    .all()
  let status = 'in_stock'
  let holder: number | null = null
  for (const e of events) {
    switch (e.eventType) {
      case 'received':
        if (status !== 'in_stock') throw { code: 'INVALID_CHAIN' }
        break
      case 'assigned':
        if (status !== 'in_stock' || e.toEmployeeId === null)
          throw { code: 'INVALID_CHAIN' }
        status = 'assigned'; holder = e.toEmployeeId
        break
      // … transferred / returned / to_repair / from_repair / disposed — таблица выше
    }
  }
  return { status, currentEmployeeId: holder }
}
```

### Pattern 2: Edit-схема в keystone — первый пользовательский eventType
**What:** `lib/movement-schema.ts` — единственный источник словаря событий; edit-схема валидирует eventType по этому словарю. До этой фазы eventType НИКОГДА не приходил из payload (каждое действие хардкодило своё) [VERIFIED: lib/movement-schema.ts header + db/queries/movements.ts].
**When to use:** Одна схема на правку; person-слоты зависят от выбранного типа (D-01): assigned → employeeId (кому) обязателен; transferred → fromEmployeeId + toEmployeeId; returned → fromEmployeeId; остальные типы → без лиц.
**Example:**
```typescript
// Sketch — стиль keystone; keys производить от MOVEMENT_EVENT_LABELS
export const editMovementSchema = z.strictObject({
  deviceId: z.coerce.number().int().positive(),
  movementId: z.coerce.number().int().positive(),
  eventType: z.enum(['received','assigned','transferred','returned','to_repair','from_repair','disposed']),
  employeeId: z.coerce.number().int().positive().optional(),      // «кому»
  fromEmployeeId: z.coerce.number().int().positive().optional(),  // «от кого»
  occurredAt: occurredAtSchema,      // тот же refine isNotFutureDate — паритет D-02
  comment: commentSchema.optional(), // ≤500 — паритет
})
// Персона-требование по типу — refine или серверная ветка: assigned → employeeId обязателен;
// при смене типа слоты ПОЛНОСТЬЮ выводятся из (тип, ввод): лишние слоты = NULL (адаптация D-01).
// dispose-паритет: eventType==='disposed' → comment обязателен (мин 1) — как disposeSchema.
```

### Pattern 3: Один tx на правку + условный UPDATE как guard
**What:** Мутация строки движений защищена условным WHERE (id AND device_id), решение по `.changes` — тот же механизм, что guard-UPDATE действий; replay-throw откатывает всё.
**When to use:** Edit и Delete действия. `.changes===0` → чужой/несуществующий movementId (тамперинг или гонка) → generic-ошибка диалога.
**Example:**
```typescript
// Sketch
const upd = tx.update(movements)
  .set({ eventType, fromEmployeeId, toEmployeeId, comment, occurredAt })
  .where(and(eq(movements.id, movementId), eq(movements.deviceId, deviceId)))
  .run()
if (upd.changes === 0) throw { code: 'MOVEMENT_GONE' }
const final = replayChain(tx, deviceId) // ПОСЛЕ мутации — цепочка должна быть валидной
tx.update(devices)
  .set({ ...final, updatedAt: new Date() })
  .where(eq(devices.id, deviceId))
  .run()
```

### Pattern 4: Dialog-паттерн движения (D-07) — реюз movement-dialogs
**What:** Wrapper держит trigger и open-state, внутренняя форма держит useActionState (WR-01 split — portal unmount даёт чистое состояние на каждую сессию); ошибки — `{code}`-union → русский текст; echo submitted values (React 19 form-reset, прецедент 4886f6a); подтверждение удаления — Dialog с текстом удаляемой записи, НЕ window.confirm (прецедент dispose/unarchive).
**When to use:** Оба диалога фазы. Порядок полей как во всех movement-диалогах: сотрудник → дата события → комментарий.
**Serialization:** Timeline становится client-островом: props = `events` (id, eventType, fromId, toId, fromName, toName, comment, occurredAtIso) + `employees` ОДИН раз. MovementEventView дополняется id-слотами (сегодня только имена) — прецедент RecentMovementView, который уже тянет и id, и имена [VERIFIED: db/queries/movements.ts:537-549]. Предфилл даты — yyyy-mm-dd события в DISPLAY_TZ (см. Pitfall 4).

### Pattern 5: Миграция 0002 — generate --custom + DROP TRIGGER
**What:** Официальный путь hand-written SQL в drizzle-цепочке. Probe против точных версий репо (drizzle-kit 0.31.10, drizzle-orm 0.45.2, flat sqlite layout) показал: команда создаёт `drizzle/0002_drop_movement_triggers.sql` (пустой, с комментом-заглушкой), journal-entry `{idx:2, version:"6", when:Date.now(), tag, breakpoints:true}` и `0002_snapshot.json`, несущий состояние схемы вперёд — следующий schema-diff `generate` (фаза 13, FK-каскад) продолжит цепочку корректно [VERIFIED: probe, /tmp-копия drizzle/ репо].
**When to use:** Один раз в этой фазе. Применение — существующий runner `scripts/migrate.mjs` (читает journal, применяет pending в одном BEGIN, трекинг CLI-совместим) [VERIFIED: scripts/migrate.mjs]. Тесты подхватят 0002 автоматически: `tests/helpers.ts applyMigrations` применяет ВСЕ *.sql лексикографически [VERIFIED: tests/helpers.ts:26-46].
**Example:**
```sql
-- drizzle/0002_drop_movement_triggers.sql (контент после generate --custom)
DROP TRIGGER IF EXISTS movements_no_update;--> statement-breakpoint
DROP TRIGGER IF EXISTS movements_no_delete;
```
`DROP TRIGGER` удаляет триггер из sqlite_schema, после чего он не срабатывает на последующие INSERT/UPDATE/DELETE; DDL в SQLite транзакционен и откатывается [CITED: sqlite.org/lang_droptrigger.html]. `IF EXISTS` — страховка (прод-базы уже имеют триггеры; свежие базы после 0000+0001 тоже).

### Anti-Patterns to Avoid
- **Инкрементальный патч статуса** («удалил последнюю выдачу → просто поставь in_stock»): ломается на правках середины цепочки; D-04 запрещает.
- **Обход триггеров кодом** (`PRAGMA writable_schema`, дроп в рантайме, `OR IGNORE`): SC5 требует миграцию в цепочке; обход = невоспроизводимо на сервере.
- **eventType из payload без whitelist**: единственный пользовательский eventType в проекте — только через z.enum словаря keystone.
- **UPDATE/DELETE movements без device_id в WHERE**: правка чужого устройства по подделанному movementId.
- **`toISOString().slice(0,10)` для предфилла даты события**: UTC-дата дрейфует от московского дня события (анти-паттерн задокументирован в movement-dialogs.tsx todayLocal).
- **window.confirm для удаления**: ломает Apple-эстетику и паттерн {code}-ошибок; Dialog с текстом записи (D-07).
- **Дублирование словаря событий/меток в edit-диалоге**: только keystone (прецедент D-02 фазы 8 — параллельный словарь = дрейф).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Wall-clock дата события ↔ yyyy-mm-dd | Свою Intl-математику в диалоге | `occurredAtFromDate`, `isNotFutureDate` (keystone) + один новый `occurredAtDateIso(date)`-хелпер рядом (машина zonedParts уже там) | DISPLAY_TZ-контракт (CR-01) — сервер авторитетен; DST-фикс-пойнт уже решён |
| Выбор сотрудника | Новый picker | EmployeePicker (movement-dialogs) / onPick-вариант (bulk-dialogs) | Фолд ё/е, скрытый input с id, zero-states — всё готово |
| Подтверждение удаления | Своё модальное окно / window.confirm | Dialog primitives + копи-паттерн dispose | Доступность, Apple-эстетика, pending-состояния |
| Русские метки событий | Параллельный словарь в диалоге | `movementEventLabel` из keystone | Один источник; правка метки меняет и таймлайн, и диалог |
| Механика journal/снапшота миграции | Ручная правка _journal.json | `drizzle-kit generate --custom` | Probe-верифицировано; ручной journal ловит «No snapshot was found» [CITED: github.com/drizzle-team/drizzle-orm/issues/6166] |
| Атомарность правки | try/catch вокруг двух отдельных запросов | Один `db.transaction` с throw-откатом | Contract модуля movements.ts с фазы 4; .changes-решение |

**Key insight:** вся сложность фазы — семантика replay, а не механика. Механика (tx, guard, {code}-ошибки, диалоги, миграции) уже отлита паттернами v1.0–v1.1 — фаза их переиспользует, а не изобретает.

## Runtime State Inventory

Фаза содержит миграцию (DDL) — категории отвечены явно.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Строки `movements` — миграция 0002 их НЕ трогает (DDL-only). devices.status/currentEmployeeId — переписываются лениво (только у отредактированных устройств) replay'ем; пакетной миграции данных не нужно | None (data unchanged) |
| Live service config | None — внешний сервис один (деплой-сервер); cron-бэкап не зависит от триггеров | None — verified by scripts/backup.mjs (копия файла БД) |
| OS-registered state | None — ни pm2, ни launchd, ни Task Scheduler; деплой = docker compose / standalone node | None |
| Secrets/env vars | None new — DATABASE_PATH уже существует; правка его не касается | None |
| Build artifacts | None — better-sqlite3 и пакет не меняются; пересборка образа штатная (deploy.sh) | None |

**Канонический вопрос:** после правки всех файлов репо старое состояние живёт только в самой БД (триггеры в sqlite_schema) — и именно их снимает миграция 0002 через штатный runner. Больше нигде старое поведение не закэшировано.

## Common Pitfalls

### Pitfall 1: Movement id без device-scope
**What goes wrong:** Подделанный/устаревший movementId правит запись ЧУЖОГО устройства (действие получает deviceId и movementId; без составного WHERE достаточно подменить один hidden-инпут).
**Why it happens:** Диалог знает оба id, но SQL-условие пишут только по id строки.
**How to avoid:** `WHERE movements.id = ? AND movements.device_id = ?` + решение по `.changes===0` → generic-ошибка. Плюс replay идёт по цепочке device_id — чужая строка не прошла бы его всё равно, но составной WHERE делает отказ дешёвым и явным.
**Warning signs:** Тест «edit чужого movementId → .changes===0 → ошибка, ноль записей».

### Pitfall 2: Replay-порядок без tiebreaker
**What goes wrong:** События с одинаковым occurredAt (bulk-партия фазы 10 пишет N событий с ОБЩИМ occurredAt) упорядочиваются недетерминированно → флиттующая валидность/проекция.
**Why it happens:** ORDER BY только occurredAt.
**How to avoid:** `ORDER BY occurredAt ASC, id ASC` — точное зеркало таймлайна (DESC, id DESC) [VERIFIED: listTimeline orders desc+desc].
**Warning signs:** Повторный replay даёт другой результат на bulk-устройствах.

### Pitfall 3: Триггер роняет edit в проде до применения миграции
**What goes wrong:** Новый код деплоится на базу, где миграция 0002 ещё не применена → UPDATE movements получает `RAISE(ABORT, 'movements is append-only…')`.
**Why it happens:** Код и миграция едут разными шагами деплоя.
**How to avoid:** README/deploy-порядок уже предполагает `scripts/migrate.mjs` host-side перед/при деплое (прецедент фазы 9); проверить шаг в README. Ошибка ABORT в любом случае уходит в generic-копию диалога, не 500-стек.
**Warning signs:** «movements is append-only: UPDATE denied» в логах после деплоя.

### Pitfall 4: Предфилл даты события в неправильной зоне
**What goes wrong:** stored instant конвертируют в yyyy-mm-dd через UTC (`toISOString`) — для события 2026-09-01 00:30 МСК предфилл покажет 2026-08-31; при сохранении без правки день тихо съедет.
**Why it happens:** Дата события — реальный момент (не UTC-midnight колонка закупки), два разных контракта даты в одном приложении.
**How to avoid:** Один хелпер `occurredAtDateIso(date)` в keystone на машине zonedParts/DISPLAY_TZ (рецепт displayTodayUtc из lib/warranty.ts: en-CA parts в DISPLAY_TZ) — и он же в тестах с frozen clock.
**Warning signs:** Предфилл даты не совпадает с показанной в таймлайне датой (occurredAtFormat, МСК).

### Pitfall 5: React 19 form-reset стирает ввод при ошибке
**What goes wrong:** Неудачная правка (INVALID_CHAIN) перерисовывает форму пустой — оператор теряет ввод.
**Why it happens:** React 19 сбрасывает uncontrolled форму после каждого form action (успех и провал).
**How to avoid:** echo-values паттерн `MovementFormState.values` (уже есть в actions.ts) + useActionState во ВНУТРЕННЕЙ форме диалога (WR-01 split) — прецеденты 4886f6a и movement-dialogs.
**Warning signs:** Ручной тест: сломать цепочку, проверить, что поля сохранили ввод.

### Pitfall 6: Паритет валидации неполный
**What goes wrong:** Правка принимает будущую дату, архивного сотрудника, комментарий >500 или пустую причину у «Списания» — то, что создание отклоняет.
**Why it happens:** Отдельная edit-схема написана с нуля вместо переиспользования кусков keystone.
**How to avoid:** Тот же `occurredAtSchema`/`commentSchema`-конструкторы; сотрудник — `assertActiveEmployee`-паритет в query-слое; dispose-паритет (comment min 1 при eventType='disposed'); фикс матрицей тестов «edit-схема отклоняет всё то же, что create-схемы».
**Warning signs:** Любое расхождение copy/правил между create- и edit-диалогами.

### Pitfall 7: refresh() забыт
**What goes wrong:** Правка сохранилась, но карточка/реестр/сотрудник не перекрасились до ручного reload (SC3 нарушен).
**Why it happens:** Without refresh() the route is NOT re-rendered in the action response (прецедент Pitfall 1 фазы 3).
**How to avoid:** `refresh()` в конце каждого успешного экшена — контракт всех 12 существующих действий [VERIFIED: app/(app)/devices/actions.ts].
**Warning signs:** UAT: правка держателя не меняет строку реестра без F5.

### Pitfall 8: Комменты кода врут после фазы
**What goes wrong:** db/schema.ts («append-only … enforced by DB triggers»), movements.ts (заголовок, listRecentMovements), disposeDevice («no code path leads back») остаются с ложными утверждениями — следующий агент строит дизайн на враке.
**How to avoid:** Отдельный чеклист-пункт плана: обновить комменты; D-06 фиксирует новую семантику словами «финальность для ДЕЙСТВИЙ, снимается правкой истории».
**Warning signs:** grep 'append-only' после фазы.

## Code Examples

### Миграция 0002 (полный контент)
```sql
-- Source: probe drizzle-kit 0.31.10 + sqlite.org/lang_droptrigger.html
DROP TRIGGER IF EXISTS movements_no_update;--> statement-breakpoint
DROP TRIGGER IF EXISTS movements_no_delete;
```
Файл создаёт `npx drizzle-kit generate --custom --name=drop_movement_triggers`; в journal и снапшот пишет сам инструмент.

### Действие правки (скелет по контракту actions.ts)
```typescript
// Source: app/(app)/devices/actions.ts (устоявшийся контракт, v1.0–v1.1)
export async function editMovementAction(
  _prev: unknown,
  formData: FormData,
): Promise<MovementFormState> {
  await requireSession()                      // всегда первой строкой (T-03-01)
  const values = echoMovementValues(formData)
  const parsed = editMovementSchema.safeParse(...)  // whitelist, strictObject
  if (!parsed.success) return { ...movementFieldErrorsOf(parsed.error, EDIT_ERROR), values }
  try {
    editMovement(parsed.data)                 // one-tx replay внутри query-слоя
  } catch {
    return { error: EDIT_ERROR, values }      // INVALID_CHAIN / MOVEMENT_GONE — детали не текут (V7)
  }
  refresh()
  return { ok: true }
}
```

### Русские копи-кандидаты ошибок (финал — за планом/владельцем)
- Цепочка: «Такая правка делает историю невозможной (проверьте порядок выдач и возвратов)» — единая честная формулировка вместо перечисления причин.
- Guard: «Запись уже изменена или удалена. Обновите страницу.»
- Сотрудник: «Выберите сотрудника» / паритет EMPLOYEE_INACTIVE → «Сотрудник неактивен» (существующая копия).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| movements append-only (INSERT-only, DB-триггеры) | movements редактируема серверным слоем; append-only для СОЗДАНИЯ потоков — дисциплина кода | Phase 12 (миграция 0002) | Фаза 13 получит снятый DELETE-триггер как硬-зависимость каскада; комменты кода обновить (Pitfall 8) |
| Проекция статуса пишется только действиями | Проекция переписывается replay'ем при правке истории | Phase 12 | guard-UPDATE действий не меняется; D-06: disposed становится «редактируемым через историю», действия из disposed по-прежнему запрещены |

**Deprecated/outdated:**
- disposeDevice-коммент «an erroneous record is corrected by registering a new device, never by editing this one» — устаревает этой фазой (D-06 осознанно разворачивает его для истории).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `z.enum` в zod 4.5.4 покрывает whitelist eventType (репо ещё не использовало z.enum) | Pattern 2 | Низкий: стандартный API zod; тест схемы ловит сразу |
| A2 | Row «received» replay-матрицы (требует in_stock, no-op) — семантика рекомендована, не подтверждена владельцем | Pattern 1 | Средний: если владельцу виднее «received = возврат на склад откуда угодно», матрица другая; закрыть на плане |
| A3 | Кросс-валидация from-слотов (transfer.from == держатель в тот момент) НЕ нужна — валиден только статус-переход | Pattern 1 / OQ3 | Низкий-средний: ослабляет строгсть D-03; если владелец хочет полной когерентности — добавить проверку |
| A4 | Паритет сотрудника: правка НЕ требующую смены сотрудника сохраняет существующий id даже архивного (picker активных не содержит старого) | OQ2 | Средний: иначе правка даты старой записи заставляет «пере-выбрать» сотрудника |
| A5 | `drizzle-kit generate --custom` с дефолтным drizzle.config.ts репо ведёт себя как probe с явными флагами | Pattern 5 | Низкий: probe гонялся с флагами; план включает проверку `git status drizzle/` после generate |
| A6 | refresh() репейнтит все 5 поверхностей (карта/реестр/сотрудник/дашборд/таймлайн) — поведенческий контракт v1.0–v1.1, не пере-тестирован отдельно в этой сессии | Pitfall 7 | Низкий: 12 существующих действий на нём стоят; UAT фазы закроет |

## Open Questions (RESOLVED)

1. **Семантика `received` в середине цепочки**
   - What we know: received существует в данных (seed), actions его не пишут; D-05 делает валидной цепочку БЕЗ поступления.
   - What's unclear: трактовать ли [assigned, received] как невалидную цепочку (рекомендация: да — матрица Pattern 1) или как «возврат на склад».
   - Recommendation: строгая матрица (received валиден только из in_stock); вынести на план одним предложением владельцу.
   - **Resolution:** принята строгая семантика — реализована replay-матрицей 12-01 Task 3 (received требует in_stock, состояние не меняет; A2 закрыт).

2. **Предфилл сотрудника-архивариуса в диалоге правки**
   - What we know: listActiveEmployees не содержит архивных; старое событие может ссылаться на архивного (архив не требует пустых рук — setEmployeeArchived без guard) [VERIFIED: db/queries/employees.ts:254].
   - What's unclear: показывать ли архивного в picker'е или держать «текст + не трогать, если не меняли».
   - Recommendation: слоты правки префиллит именем из timeline (он рендерит любых); если сотрудник не изменён — сохраняем его id; новый выбор — только из активных (паритет D-02). Альтернатива: picker с архивными, помеченными бейджем — дороже, ломает паритет.
   - **Resolution:** принята рекомендация — паритет OQ2/A4 в 12-01 Task 3 (нетронутый архивный id сохраняется, новый выбор — assertActiveEmployee) + префилл диалога в 12-02 Task 1 (EmployeePicker initial-проп).

3. **Строгсть person-слотов при replay**
   - What we know: D-03 примеры — только статус-нарушения (две выдачи, возврат без выдачи).
   - What's unclear: валидировать ли from-слот transfer'а против текущего держателя (когерентность истории «кто у кого принимал»).
   - Recommendation: НЕ валидировать (владелец правит свои опечатки, включая от-слоты; валидация держателя добавляет отказы на легитимные правки). Зафиксировать в плане.
   - **Resolution:** принято — from-слоты НЕ кросс-валидировать, зафиксировано в replay-матрице 12-01 Task 3.

4. **Единая формулировка ошибки INVALID_CHAIN**
   - What we know: D-03 требует «внятную ошибку»; причины бывают разные (две выдачи, возврат без выдачи, поступление не на складе…).
   - What's unclear: одна общая копия vs перечисление конкретного нарушения.
   - Recommendation: одна честная формулировка + (опционально) машинное имя нарушения в {code} для будущего улучшения; конкретику проще добавить, чем убрать.
   - **Resolution:** принята единая копия — байт-точная формулировка зафиксирована в Copywriting Contract 12-UI-SPEC.md; применяется маппингом {code} в 12-02 (editMovementAction/deleteMovementAction), машинное имя остаётся только на сервере.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | всё | ✓ | v22.23.0 | — |
| vitest | тесты replay/схем/миграции | ✓ | 4.1.11 | — |
| drizzle-kit | generate --custom (миграция 0002) | ✓ | 0.31.10 | — |
| better-sqlite3 | tx + триггеры + runner | ✓ | 13.0.3 | — |
| next (bundled docs) | Server Actions / refresh | ✓ | 16.3.3 + node_modules/next/dist/docs/ | — |
| scripts/migrate.mjs | применение 0002 на проде | ✓ | существует (фаза 9) | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.11 (environment node, alias `@`, stub server-only) |
| Config file | vitest.config.ts [VERIFIED] |
| Quick run command | `npx vitest run tests/movement-edit.test.ts` |
| Full suite command | `npx vitest run` (baseline этой сессии: 25 файлов / 425 тестов / ~2.5 с, green) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HIST-01 | Edit schema: eventType whitelist, слоты по типу, дата DISPLAY_TZ, комментарий ≤500, dispose-паритет | unit | `npx vitest run tests/movement-edit.test.ts -t 'schema'` | ❌ Wave 0 |
| HIST-01 | Edit применён: строка изменена, встала на место по дате (listTimeline порядок) | unit | `npx vitest run tests/movement-edit.test.ts -t 'edit'` | ❌ Wave 0 |
| HIST-02 | Delete удаляет строку; повторный delete → .changes===0 → ошибка | unit | `npx vitest run tests/movement-edit.test.ts -t 'delete'` | ❌ Wave 0 |
| HIST-03 | Replay: удаление последней assigned → in_stock; удаление disposed → in_stock (D-06); правка середины → INVALID_CHAIN, ноль записей | unit | `npx vitest run tests/movement-edit.test.ts -t 'replay'` | ❌ Wave 0 |
| HIST-03 | Parity: listIssuedByEmployee.issuedAt после правки даты assigned; дашборд-лента отражает правку | unit | `npx vitest run tests/movement-edit.test.ts -t 'parity'` | ❌ Wave 0 |
| SC5 | Миграция 0002 снимает триггеры (UPDATE/DELETE легальны), runner применяет; ВСЕ существующие custody-потоки green | unit (регресс) | `npx vitest run tests/movements-queries.test.ts tests/migrate-runner.test.ts` | ✅ (существующие) |
| D-07 | Диалоги: UAT по прецеденту фаз 7/10 (Playwright MCP оркестратором) | manual-only | — (justify: диалоговые flow + визуальная Apple-эстетика не покрываются компонентным раннером — в репо его нет, прецедент фазы 2) | — |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/movement-edit.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green (425+N) + `npx next build` + eslint, до `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/movement-edit.test.ts` — покрывает HIST-01/02/03 (bootstrap по образцу movements-queries.test.ts: DATABASE_PATH на temp ДО импорта @/db, applyMigrations(db.$client) — 0002 подхватится автоматически)
- [ ] Frozen-clock фикстуры DISPLAY_TZ (прецедент tests/movement-schema.test.ts c9c87bc) — для occurredAtDateIso
- [ ] Framework install: не требуется (vitest в devDeps)

## Security Domain

### Applicable ASVS Categories (level 1, security_enforcement: true)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (не меняется) | существующая requireSession/jose-сессия |
| V3 Session Management | no | существующий proxy+layout guard |
| V4 Access Control | yes | `requireSession()` первой строкой каждого нового action; единственный пользователь |
| V5 Input Validation | yes | zod strictObject + `z.enum` словаря + coerce positive-int; whitelist-чтение FormData (ни один сырой ключ не идёт в SQL) |
| V6 Cryptography | no | крипто-поверхности фаза не касается |
| V7 Error Handling | yes | `{code}`-union никогда не покидает сервер; диалоги получают только русские копии |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Подделанный movementId (правка чужого устройства) | Tampering / Elevation | Составной WHERE (id AND device_id) + .changes-решение + replay по device_id |
| Инъекция eventType вне словаря | Tampering | z.enum по keystone; strictObject режет лишние ключи |
| Инъекция person-слотов не по типу (assigned с чужим from) | Tampering | Слоты ПОЛНОСТЬЮ выводятся из (тип, whitelisted-ввод) — лишние в NULL; replay валидирует итог |
| SQL-инъекция через комментарий/даты | Tampering | Drizzle parameterized (весь слой); norm-UDF не затрагивается |
| Отказ соседних потоков от снятия триггеров | Tampering | SC5-регресс: полный suite custody-матрицы green после миграции; прямые UPDATE/DELETE легальны только из actions (дисциплина + ревью) |
| Гонка двух одновременных правок (теоретически — один пользователь) | Tampering | Один tx + replay; второй COMMIT увидит актуальную цепочку (WAL, один writer) |

## Sources

### Primary (HIGH confidence)
- Прямое чтение кода репо (this session): `db/queries/movements.ts`, `lib/movement-schema.ts`, `lib/ru.ts`, `db/schema.ts`, `db/index.ts`, `app/(app)/devices/actions.ts`, `app/(app)/devices/movement-dialogs.tsx`, `app/(app)/devices/bulk-dialogs.tsx`, `app/(app)/(card)/devices/[id]/page.tsx`, `app/(app)/(card)/devices/[id]/timeline.tsx`, `drizzle/0000_amusing_talon.sql` (триггеры, строки 94–101), `drizzle/0001_cooing_wendell_rand.sql`, `drizzle/meta/_journal.json`, `scripts/migrate.mjs`, `scripts/seed.mjs` (received-события), `tests/helpers.ts`, `tests/movements-queries.test.ts`, `components/ui/`
- Probe (isolated /tmp-копия drizzle/ репо): `drizzle-kit@0.31.10 generate --custom --name=…` → 0002_*.sql + journal idx 2 + 0002_snapshot.json; repo drizzle/ не тронут (git-проверено)
- Baseline-прогон: `npx vitest run` → 425/425 green, 2.51 s

### Secondary (MEDIUM confidence)
- [orm.drizzle.team/docs/kit-custom-migrations](https://orm.drizzle.team/docs/kit-custom-migrations) — официальный механизм custom-миграций (`generate --custom --name`)
- [orm.drizzle.team/docs/drizzle-kit-generate](https://orm.drizzle.team/docs/drizzle-kit-generate) — флаги generate, diff против последнего снапшота
- [sqlite.org/lang_droptrigger.html](https://www.sqlite.org/lang_droptrigger.html) — семантика DROP TRIGGER, транзакционность DDL
- [github.com/drizzle-team/drizzle-orm/issues/6166](https://github.com/drizzle-team/drizzle-orm/issues/6166) — «No snapshot was found» при journal без снапшота (аргумент против ручной правки journal)

### Tertiary (LOW confidence)
- [orm.drizzle.team/docs/migrations](https://orm.drizzle.team/docs/migrations) — обзор подходов (страница сама отсылает к kit-custom-migrations)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — пакеты не меняются, всё считано из package.json/node_modules и работающего кода v1.1
- Architecture (replay/tx/UI): HIGH по механике (паттерны репо прочитаны дословно), MEDIUM по семантике матрицы — флагнуто в OQ1–OQ3 для плана
- Migration mechanics: HIGH — probe против точных версий репо + официальные доки
- Pitfalls: HIGH — каждый привязан к конкретному прецеденту кода фаз 2–11

**Research date:** 2026-09-28
**Valid until:** 2026-10-28 (стабильная область; версии репо зафиксированы в package.json)
