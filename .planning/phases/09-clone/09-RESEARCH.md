# Phase 9: Клон устройства - Research

**Researched:** 2026-09-16
**Domain:** SQLite schema migration (serial → nullable) via drizzle-kit generate+migrate; better-sqlite3 transactional multi-insert; pure inventory-number increment; server-action + dialog UI island
**Confidence:** HIGH (все критичные механики probe-верифицированы против установленных версий проекта, не из training data)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Диалог и автоподсказка инвентарника**
- **D-01:** Кнопка «Дублировать» на карточке устройства (рядом с custody-действиями `device-actions.tsx`) открывает отдельный клон-диалог — НЕ реюз create/edit формы `device-dialog.tsx`. Поля диалога: количество (1..100, дефолт 1) и одно редактируемое поле «Инвентарный номер» с автоподсказкой. — Reversibility: reversible
- **D-02:** Автоподсказка инвентарника: префилл = «следующий по шаблону оригинала» с сохранением нулевого паддинга (`AB-001` → `AB-002`; `INV 007` → `INV 008`). Поле редактируемое. При N копий каждая следующая инкрементится от предыдущей. Если шаблон не распознан (нет хвостового числа) — поле пустое и ничего не дописывается молча (SC 3); копии с пустыми инвентарниками легальны (NULL/NULL-пара, D-17 фазы 3). Распознавание шаблона и инкремент — чистая функция в lib (vitest-покрытие: паддинг, многозначные хвосты, не-числовые хвосты, пустой инвентарник оригинала).
- **D-03:** Верхняя граница N = 100.

**Наследование и чистота копий**
- **D-04:** Наследуется: тип, модель, дата закупки, стоимость, поставщик, гарантия + конфиг-поля своего типа (RAM/SSD/ramUpgraded, диагональ/матрица, порты, вид).
- **D-05:** Никогда не копируются: серийник (пустой), инвентарник (своя подсказка/ручной ввод), заметки notes, фото, история перемещений, владелец. Копии создаются status=in_stock, currentEmployeeId=null.

**Движения и транзакция**
- **D-06:** Ни одного movement-события при клонировании; одна транзакция (SC 1); UNIQUE-коллизия инвентарника внутри пакета откатывает всё и мапится в существующий `uniqueFieldError`-паттерн.
- **D-07:** После успеха остаёмся на карточке оригинала; подтверждение — сообщение «Создано N копий».

**Миграция serial → nullable**
- **D-08:** Семантика (механизм — решает план фазы): устройства могут существовать без серийника; множественные NULL-пары (serial=NULL, serial_normalized=NULL) легальны и не конфликтуют по UNIQUE; непустые серийники уникальны как раньше. Миграция только generate+migrate (никогда push — Key Decision). Пустой серийник легален ТОЛЬКО у копий; zod `min(1)` в CommonFields остаётся для ручной формы; клон-путь пишет NULL напрямую через query-слой. — Reversibility: one-way (миграция пересоздаёт таблицу), но семантически обратима (NOT NULL можно вернуть миграцией при пустых копиях)

### Claude's Discretion
- Механизм миграции (partial unique index vs expression index) — план фазы, STATE blocker [Phase 9] → **решён в этом исследовании: ни то ни другое; обычный UNIQUE-индекс уже даёт нужную семантику** (см. Summary)
- Расположение чистой функции шаблона/инкремента (lib/), имя клон-экшена и диалога
- Копи диалога (заголовок «Дублировать устройство», подпись поля количества) — Apple-стиль
- Тест-матрица vitest: транзакционность, шаблон/паддинг/инкремент, NULL-пары, наследование, граница N=100, collision-откат

### Deferred Ideas (OUT OF SCOPE)
- Пустой серийник в обычной форме создания/редактирования — вне скоупа REG-06 (D-08)
- Шаблоны устройств («сохранить как пресет») — не запрошено
- Печать этикеток на копии — V2-04 QR, future
- Bulk-выдача/приём (Phase 10), cross-page «выбрать всё» (Out of Scope REQUIREMENTS), копирование между типами
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REG-06 | Оператор клонирует устройство с указанием количества (1..N): серийник у копий пуст (миграция serial → nullable), фото/история/владелец никогда не копируются, копии не привязаны к сотруднику; инвентарный номер — редактируемая автоподсказка (следующий по шаблону оригинала), пустой если шаблон не распознан | Миграция: probe-верифицированный рецепт (0001 recreation + host-side runner с FK OFF до BEGIN); NULL-пары легальны на обычном UNIQUE-индексе; транзакционный `cloneDevices` по паттерну movements.ts; чистая `nextInventoryNumber` в lib; клон-диалог по механике movement-dialogs + клон-экшен по контракту actions.ts |
</phase_requirements>

## Summary

Фаза держится на трёх опорах: (1) миграция serial → nullable, (2) транзакционное создание N копий, (3) чистая функция «следующий по шаблону». Все три исследованы не по документации, а probe'ами против реального стека проекта (drizzle-kit 0.31.10, drizzle-orm 0.45.2, better-sqlite3 13.0.3, SQLite 3.53.4) — это снимает STATE-блокер «NULL-pair рецепт» с максимальной достоверностью.

**Главный вывод по миграции:** механизм «partial vs expression index» — ложная дилемма. Probe на better-sqlite3 13.0.3 показал: обычный UNIQUE-индекс на nullable-колонке **уже** допускает неограниченное число NULL-строк и обеспечивает уникальность только непустых значений. Достаточно убрать `.notNull()` с `serialNumber`/`serialNormalized` в `db/schema.ts` — существующий `devices_serial_norm_uq` остаётся как есть. Это в точности семантика уже работающей в проде колонки `inventory_normalized` (Pitfall 5 фазы 3) — код-рецепт существует и протестирован (`tests/schema.test.ts` «allows multiple NULL inventory_normalized…»).

**Главный риск фазы (найден probe'ом, в тестах НЕ проявится):** drizzle-kit 0.31.10 generate для снятия NOT NULL на SQLite эмитит стандартную рекреацию таблицы (`__new_devices` → INSERT…SELECT → DROP → RENAME, PRAGMA foreign_keys=OFF первой строкой). Но `drizzle-kit migrate` **не может применить её на заполненной базе**: drizzle-orm `SQLiteSyncDialect.migrate` оборачивает все стейтменты в явный `BEGIN` (PRAGMA foreign_keys внутри транзакции — no-op), а better-sqlite3 13 включает `foreign_keys=ON` на новых соединениях по умолчанию — `DROP TABLE devices` натыкается на немедленный RESTRICT от дочерних строк attachments/movements → тихий exit 1 (CLI проглатывает ошибку). На пустой базе 0000 применяется нормально — поэтому падение всплывёт только на проде. Витест-раннер (`tests/helpers.ts applyMigrations`) исполняет стейтменты по одному без транзакции — там PRAGMA работает, тесты зелёные: **расхождение тест/прод незаметно без probe**. Валидированный рецепт: host-side runner (better-sqlite3), ставящий `PRAGMA foreign_keys=OFF` ДО `BEGIN`; `defer_foreign_keys` не спасает (RESTRICT иммедиен — проверено). Полная батарея из 13 post-migration проверок зелёная (триггеры, CHECK, AUTOINCREMENT-последовательность, FK, частичный индекс, данные).

**Primary recommendation:** убрать `.notNull()` у обеих serial-колонок (индекс не трогать), сгенерировать 0001 через generate (файл не править), применить через небольшой `scripts/migrate.mjs` (FK OFF до BEGIN, стейтмент-за-стейтментом, `created_at = journal.when` для совместимости трекинга с CLI); `cloneDevices` — одна `db.transaction` по паттерну movements.ts с предвычисленной inventory-последовательностью; `nextInventoryNumber` — чистая функция в lib с vitest-матрицей; клон-диалог — новый компонент по механике movement-dialogs (`useActionState` + `useCloseOnOk`), клон-экшен — по контракту actions.ts (requireSession, zod-белый список 3 полей, echo, uniqueFieldError, refresh).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| serial → nullable миграция | Database (drizzle/0001 + runner) | — | Схема меняется только миграцией; runner — host-side скрипт, не приложение |
| NULL-пара записи копий | Database (query-слой) | — | `createDevice`/`cloneDevices` пишут NULL напрямую; zod-слой ручной формы не трогается (D-08) |
| Транзакция N копий | API/Backend (`db/queries/devices.ts`) | — | better-sqlite3 sync-транзакция живёт в query-слое рядом с custody-транзакциями (D-06) |
| «Следующий по шаблону» | API/Backend (lib/, чистая функция) | Browser (клиентский префилл) | Одна pure-функция: клиент считает префилл из пропса, сервер авторитетно пересчитывает последовательность (client value — только стартовая точка, редактируемая оператором) |
| Валидация входа клона | API/Backend (server action + zod) | — | requireSession первым, белый список 3 полей, N 1..100 (T-03-01/02, D-03) |
| Клон-диалог | Browser (новый компонент) | API/Backend (action) | Механика movement-dialogs: useActionState, useCloseOnOk, echo-values |

## Standard Stack

### Core (всё уже установлено — НОВЫХ ЗАВИСИМОСТЕЙ НЕТ, Out of Scope REQUIREMENTS)

| Library | Version (установлено) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-kit | 0.31.10 | `generate` 0001 (recreation nullable serial) | Проектный контракт: только generate+migrate (PROJECT.md Key Decisions, drizzle-kit #6060) [VERIFIED: package.json + node_modules] |
| drizzle-orm/better-sqlite3 | 0.45.2 | `db.transaction((tx) => …)` для N-insert атомарности | 6 прецедентов в db/queries/movements.ts [VERIFIED: grep] |
| better-sqlite3 | 13.0.3 | Host-side runner миграции + sync-драйвер | FK ON по умолчанию с 13.x — главный факт риска [VERIFIED: probe] |
| zod | 4.5.4 | Белый список клон-экшена (count 1..100, inventory ≤80) | T-03-02, паттерн CommonFields [VERIFIED: lib/device-schema.ts] |
| vitest | 4.1.11 | Матрица D-02/Discretion: инкремент, транзакция, миграция | tests/*.test.ts, helpers.ts [VERIFIED: vitest.config.ts] |
| shadcn/ui (Base UI) | 4.19.1 / @base-ui/react 1.7 | Dialog/Input/Label/Button клон-диалога | Компоненты уже в components/ui [VERIFIED: device-dialog.tsx imports] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tests/helpers.ts (createTempDb/applyMigrations/insertDevice) | — | Фикстуры тестов миграции и клона | Уже покрывают применением 0001+0001 statement-at-a-time [VERIFIED: tests/helpers.ts] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Обычный UNIQUE-индекс на nullable-колонке (выбор) | Partial index `WHERE serial_normalized IS NOT NULL` | Эквивалентная семантика, но лишний diff схемы и нестандартный для проекта паттерн; probe показал избыточность |
| То же | Expression index `COALESCE(serial_normalized,'')` | Хуже: '' коллапсирует все пустые в одну группу — НАРУШАЕТ NULL-парность; drizzle-эмит нестерилен |
| Host-side runner (выбор) | Оставить `npx drizzle-kit migrate` в deploy | Невозможно: падает на заполненной базе (probe, exit 1 молча) |
| Кастомный клон-диалог (выбор) | Реюз device-dialog.tsx | Запрещён D-01 |
| `nextInventoryNumber` на клиенте как источник истины | Серверный пересчёт последовательности | Сервер обязан сам инкрементить N-1 раз: клиент присылает только отредактированный СТАРТ (tamper-поверхность минимизирована) |

**Installation:** ничего не устанавливается. **Version verification:** версии сняты с node_modules/package.json проекта (не из training data).

## Package Legitimacy Audit

> Фаза не устанавливает внешних пакетов (REQUIREMENTS Out of Scope: «любые новые npm-зависимости»).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| — | — | — | — | — | — | none — новых установок нет |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Карточка устройства /devices/[id]          (route group (card))
  │  ряд кнопок: «Редактировать» · custody-кнопки · «Дублировать» (NEW, D-01)
  ▼
CloneDialog (NEW клиентский компонент)
  │  поля: Количество 1..100 (дефолт 1) · Инвентарный номер (префилл nextInventoryNumber(inventory оригинала))
  │  useActionState → formAction                    echo-values при ошибке (React 19 reset)
  ▼
cloneDeviceAction (actions.ts, NEW)
  │  1. requireSession()                            T-03-01
  │  2. zod: { deviceId int+, count int 1..100,     T-03-02, D-03
  │           inventoryNumber ≤80 optional }
  │  3. getDevice(deviceId) → 404-эквивалент = generic error
  │  4. inventorySequence(inventoryStart, count)    серверный пересчёт N значений
  ▼
cloneDevices() (db/queries/devices.ts, NEW)
  │  db.transaction((tx) => N × tx.insert(devices)) better-sqlite3 sync-tx, auto-rollback
  │    каждая строка: serialNumber=NULL, serialNormalized=NULL,
  │    ...inventoryPair(inv), notes=NULL, status='in_stock', currentEmployeeId=null,
  │    наследование: typeKey, model, purchaseDate, purchasePrice, supplier,
  │    warrantyUntil (D-04) + конфиг-поля своего типа
  │    attachments/movements НЕ трогаются (D-05/D-06)
  │  UNIQUE-коллизия → SQLITE_CONSTRAINT_UNIQUE → throw uniqueCodeOf(e)  → откат всего
  ▼
refresh() → сообщение «Создано N копий» на карточке (D-07)

── Параллельная ветка: миграция (один раз, до UI) ──
db/schema.ts (−notNull ×2) → drizzle-kit generate → drizzle/0001_*.sql (файл не править)
  → scripts/migrate.mjs (NEW): PRAGMA foreign_keys=OFF → BEGIN → стейтменты →
    INSERT __drizzle_migrations(created_at=journal.when) → COMMIT → PRAGMA foreign_keys=ON
  (npx drizzle-kit migrate на заполненной базе падает молча — см. Pitfall 1)
```

### Recommended Project Structure

```
db/schema.ts                        # −notNull у serialNumber/serialNormalized (индексы не трогать)
db/queries/devices.ts               # + cloneDevices() рядом с createDevice; uniqueCodeOf/inventoryPair уже тут
lib/inventory-increment.ts          # NEW чистая функция nextInventoryNumber (прецедент pure-lib: device-csv.ts)
lib/device-schema.ts                # БЕЗ ИЗМЕНЕНИЙ: serial min(1) остаётся (D-08)
app/(app)/devices/actions.ts        # + cloneDeviceAction по контракту createDeviceAction
app/(app)/devices/clone-dialog.tsx  # NEW по механике movement-dialogs.tsx
app/(app)/(card)/devices/[id]/page.tsx  # кнопка в ряду действий (строки 235–257)
scripts/migrate.mjs                 # NEW host-side runner миграций (замена/обёртка drizzle-kit migrate)
drizzle/0001_*.sql + meta/          # артефакты generate (без ручных правок)
tests/inventory-increment.test.ts   # NEW матрица инкремента
tests/clone-queries.test.ts         # NEW транзакция/наследование/NULL-пары/откат
tests/schema.test.ts                # + nullable serial и NULL-пары serial (зеркало inventory-теста)
```

### Pattern 1: Миграция — обычный UNIQUE уже даёт NULL-пары

**What:** снятие NOT NULL не требует partial/expression index.
**When to use:** эта фаза; любой будущий «nullable + unique» в проекте.
**Example (probe-протокол):**
```js
// VERIFIED: probe на better-sqlite3 13.0.3 / SQLite 3.53.4, :memory:
db.exec('CREATE TABLE t (id integer primary key autoincrement, sn text)');
db.exec('CREATE UNIQUE INDEX t_sn_uq ON t (sn)');
// 3 вставки NULL — все легальны; дубль непустого → SQLITE_CONSTRAINT_UNIQUE
// Сообщение: 'UNIQUE constraint failed: devices.serial_normalized' →
// существующий uniqueCodeOf() смапит в { code: 'serialNormalized' } как раньше
```
Schema diff — только:
```ts
serialNumber: text('serial_number'),        // было .notNull()
serialNormalized: text('serial_normalized'), // было .notNull()
```

### Pattern 2: Host-side runner миграции (единственный рабочий путь для recreation)

**What:** применяет 0001 к заполненной базе там, где `drizzle-kit migrate` молча падает.
**When to use:** применение 0001 на проде; дефолт для будущих migration-запусков проекта.
**Example (рецепт, все 13 post-проверок зелёные):**
```js
// VERIFIED: probe end-to-end против drizzle/0001, сгенерированного drizzle-kit 0.31.10
const db = new Database(process.env.DATABASE_PATH)
db.pragma('journal_mode = WAL'); db.pragma('busy_timeout = 5000')
db.pragma('foreign_keys = OFF')            // ДО BEGIN — единственное место, где PRAGMA работает
db.exec('BEGIN')
for (const stmt of pendingStatements) db.exec(stmt)  // split по '--> statement-breakpoint'
// pending = journal.entries с created_at(when) > MAX(created_at) в __drizzle_migrations
db.exec(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`,
        [sha256(file), entry.when])       // created_at=when → CLI-совместимый трекинг
db.exec('COMMIT')
db.pragma('foreign_keys = ON')             // восстановить после COMMIT
```
Совместимость: drizzle-orm `SQLiteSyncDialect.migrate` решает «применять ли» сравнением `lastDbMigration.created_at < folderMillis` (hash не сравнивается — VERIFIED: node_modules/drizzle-orm/sqlite-core/dialect.js:657-671) — заполнение `created_at = journal.when` делает состояние легальным и для последующего `npx drizzle-kit migrate`.

### Pattern 3: Транзакция N вставок (паттерн movements.ts)

**What:** всё-или-ничего пакет копий; сбой в середине не оставляет «половину».
**Example:**
```ts
// db/queries/devices.ts — VERIFIED: паттерн db/queries/movements.ts (6 call sites)
type DbHandle = typeof db
type Tx = Parameters<Parameters<DbHandle['transaction']>[0]>[0]

export function cloneDevices(source: DeviceRow, inventoryStart: string | null, count: number): number[] {
  const inventories = inventorySequence(inventoryStart, count) // N значений или все null
  try {
    return db.transaction((tx) =>
      inventories.map((inv) =>
        tx.insert(devices).values({
          typeKey: source.typeKey,
          model: source.model,
          serialNumber: null,
          serialNormalized: null,             // D-05/D-08: NULL-пара напрямую
          ...inventoryPair(inv),              // '' уже не дойдёт: null → NULL/NULL (Pitfall 5 фазы 3)
          purchaseDate: source.purchaseDate,  // D-04: закупочный блок целиком
          purchasePrice: source.purchasePrice,
          supplier: source.supplier,
          warrantyUntil: source.warrantyUntil,
          notes: null,                        // D-05: никогда не копируются
          ramGb: source.ramGb, ramUpgraded: source.ramUpgraded, ssdGb: source.ssdGb,
          screenDiagonal: source.screenDiagonal, panelType: source.panelType,
          portCount: source.portCount, peripheralKind: source.peripheralKind,
          status: 'in_stock',                 // T-04-02: статус/владелец не из payload
          // currentEmployeeId отсутствует → NULL
        }).returning({ id: devices.id }).get()!.id,
      ),
    )
  } catch (e) { throw uniqueCodeOf(e) }       // SQLITE_CONSTRAINT_UNIQUE → { code } → откат tx
}
```

### Pattern 4: Чистая функция «следующий по шаблону»

**What:** префилл и серверная последовательность из одной функции.
**Example:**
```ts
// lib/inventory-increment.ts — VERIFIED прецеденты: lib/normalize.mjs (pure ESM), movement-schema padStart
export function nextInventoryNumber(raw: string | null | undefined): string {
  if (!raw) return ''                                // пустой оригинал → пустое поле (SC 3)
  const m = raw.trim().match(/^(.*?)(\d+)$/)
  if (!m) return ''                                  // нет хвостового числа → пусто, молча (SC 3)
  const [, prefix, digits] = m
  return prefix + String(Number(digits) + 1).padStart(digits.length, '0')
}
// 'AB-001'→'AB-002' · 'INV 007'→'INV 008' · 'AB-099'→'AB-100' (паддинг — минимум, перенос переполняет)
// 'ABC' → '' · null → '' · последовательность = N-1 свёрток от отредактированного старта
```
Работает на RAW значении (не normalizeInventory) — сохраняет регистр/префикс оператора; уникальность обеспечивает normalize на записи (inventoryPair), не подсказка.

### Pattern 5: Клон-диалог (механика movement-dialogs)

**What:** открыт/закрыт снаружи, форма внутри, закрытие по успеху.
**Example (каркас — VERIFIED: movement-dialogs.tsx:333-349, 233-235):**
```tsx
export function CloneDialog({ deviceId, inventoryNumber }: { deviceId: number; inventoryNumber: string | null }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="secondary" size="xl" data-device-clone-id={deviceId} />}>
        Дублировать
      </DialogTrigger>
      <DialogContent className="max-w-md p-6">
        <DialogHeader><DialogTitle>Дублировать устройство</DialogTitle></DialogHeader>
        <CloneDialogForm deviceId={deviceId} suggested={nextInventoryNumber(inventoryNumber)} onDone={close} />
      </DialogContent>
    </Dialog>
  )
}
// CloneDialogForm: useActionState(cloneDeviceAction, {}) + useCloseOnOk(state, onDone);
// uncontrolled inputs + echo values при ошибке (4886f6a); успех → close + сообщение «Создано N копий» (D-07)
```

### Anti-Patterns to Avoid

- **`drizzle-kit push` для смены схемы:** запрещён Key Decision (push тихо роняет UNIQUE, drizzle-kit #6060).
- **Правка сгенерированного 0001 (PRAGMA-жонглирование в файле):** PRAGMA foreign_keys внутри BEGIN — no-op в ЛЮБОЙ обёртке; файл остаётся как сгенерирован, исправляется раннер. `defer_foreign_keys` не спасает от RESTRICT (probe: SQLITE_CONSTRAINT_TRIGGER).
- **Expression index COALESCE(serial_normalized,''):** коллапсирует пустые значения в одну уникальную группу — вторая копия с пустым серийником станет невозможной.
- **Реюз device-dialog.tsx:** запрещён D-01 (форма тащит пер-типовые секции, смену типа, 14 полей).
- **Чтение status/currentEmployeeId из payload клона:** только query-слой хардкодит (T-04-02).
- **inventoryPair('') вместо null:** normalize('') → '' и UNIQUE на '' схлопнет вторую копию (Pitfall 5 фазы 3); пустой ввод экшена → null до query-слоя.
- **Ослабление zod min(1) на serialNumber в CommonFields:** D-08 явно запрещает — NULL пишет только query-слой клона.
- **movement-события на клон:** создание ≠ перемещение, D-06; таймлайн копий рождается чистым.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Атомарный пакет вставок | Ручные BEGIN/COMMIT по better-sqlite3 | `db.transaction((tx) => …)` drizzle-orm | auto-rollback на throw; тип `Tx` уже выведен в movements.ts |
| Маппинг UNIQUE-коллизий | Свой разбор ошибок в экшене | `uniqueCodeOf` + `uniqueFieldError` | Уже различает serial/inventory по сообщению; сообщение после recreation сохраняет формат (probe п.3/4) |
| NULL-пара инвентарника | Отдельная логика для клона | `inventoryPair` | Пишет NULL/NULL для falsy — точное поведение уже в проде |
| Префилл подсказки | Отдельная клиентская и серверная логики | Одна pure-функция lib | D-02 требует vitest-покрытие; дубли = дрейф |
| Применение миграций в тестах | Своя накатка | tests/helpers.ts applyMigrations | Statement-at-a-time уже работает и для recreation (probe A) |
| Диалоговая механика | Новый каркас Dialog/state | movement-dialogs каркас (useActionState + useCloseOnOk) | Байт-предсказуемое поведение, уже отлажено на 6 диалогах |

**Key insight:** весь мутированный контур (коллизии, NULL-пары, транзакции, диалоги) уже существует в кодовой базе — фаза собирает фичу из 5 переиспользованных паттернов; единственные действительно новые артефакты — сама 0001-миграция, её runner и чистая функция инкремента.

## Runtime State Inventory

> Фаза содержит единственную миграцию схемы вехи — инвентаризация обязательна. Пройдены все 5 категорий.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | SQLite `data/app.db`: devices.serial_number/serial_normalized NOT NULL + UNIQUE `devices_serial_norm_uq`; все существующие строки имеют непустые серийники (форма min(1) не пропускала пустые) — data migration НЕ нужна, 0001 копирует данные as-is (probe п.13: devices/movements/attachments целы). Дочерние ссылки: movements.device_id, attachments.device_id (RESTRICT) — причина падения CLI, учитывается раннером | Схема-миграция 0001 через runner; данных не касается |
| Live service config | Деплой: `npx drizzle-kit migrate` задокументирован в README.md (строки 23, 132, 159, 192) и deploy.sh; cron ночного бэкапа — «копия файла», от миграции не зависит; WAL-режим персистентен в файле | Обновить README/deploy-шаг на runner (или задокументировать одноразовое применение) — план фазы |
| OS-registered state | None — verified: ни systemd/launchd, ни Task Scheduler, ни pm2 в проекте; деплой = docker compose / host Node | — |
| Secrets/env vars | None new — DATABASE_PATH уже существует и используется мигратором; AUTH_* не затрагиваются | — |
| Build artifacts | drizzle/meta/_journal.json + 0001_snapshot.json регенерируются generate (коммитятся); .next/standalone не содержит схемы; node_modules не трогается | Закоммитить drizzle/0001 + meta после generate |

**Канонический вопрос:** после обновления всех файлов репо старую схему держит только файл `data/app.db` на сервере — снимается ровно одним действием: применением 0001 раннером при деплое.

## Common Pitfalls

### Pitfall 1: `drizzle-kit migrate` молча падает на заполненной базе
**What goes wrong:** exit 1 без сообщения об ошибке; миграция не применена, схема осталась NOT NULL; хендлеры продолжают писать NOT NULL — падение обнаружится только при первой попытке создать копию.
**Why it happens:** drizzle-orm SQLiteSyncDialect.migrate оборачивает ВСЕ стейтменты в явный BEGIN (dialect.js:657) → `PRAGMA foreign_keys=OFF` из файла — no-op; better-sqlite3 13 включает FK на соединении по умолчанию (probe: `pragma foreign_keys` → 1 на дефолтном соединении) → `DROP TABLE devices` = неявный DELETE FROM с немедленным RESTRICT от attachments/movements. transactionProxy глатывает ошибку (push в массив без rethrow — bin.cjs connections.ts).
**How to avoid:** применять 0001 только через runner с `PRAGMA foreign_keys=OFF` ДО BEGIN (Pattern 2); на проде проверить `SELECT notnull FROM pragma_table_info('devices') WHERE name LIKE 'serial%'` → обе 0.
**Warning signs:** «applying migrations…» дважды без галочки «applied successfully»; `__drizzle_migrations` не получил строки 0001.

### Pitfall 2: defer_foreign_keys кажется спасением, но не спасает
**What goes wrong:** замена PRAGMA в 0001 на `PRAGMA defer_foreign_keys=ON` → тот же молчаливый провал.
**Why:** RESTRICT — немедленное действие; defer работает только для NO ACTION-класса (probe: SQLITE_CONSTRAINT_TRIGGER FOREIGN KEY constraint failed).
**How to avoid:** не идти этим путём; единственный рычаг — FK OFF на соединении до BEGIN.

### Pitfall 3: Тесты зелёные, прод сломан (расхождение раннеров)
**What goes wrong:** витест-раннер applyMigrations исполняет стейтменты по одному БЕЗ транзакции — PRAGMA из файла там работает, миграция применяется, тесты миграции зелёные.
**Why:** другой порядок исполнения, чем у прод-CLI.
**How to avoid:** прод-проверка после миграции (pragma_table_info-ассерт в приёмке); опционально тест раннера на временной заполненной базе.
**Warning signs:** уверенность «тесты прошли — на проде само применится».

### Pitfall 4: Подсказка на normalized-значении ломает паддинг/регистр
**What goes wrong:** `nextInventoryNumber(normalizeInventory('ab-001'))` даст 'AB-002' — операторский регистр префикса потерян; SC 3/D-02 работают на шаблоне оригинала.
**How to avoid:** функция принимает RAW inventoryNumber; нормализация — на записи (inventoryPair), не в подсказке.

### Pitfall 5: Пустой инвентарник клона как '' вместо null
**What goes wrong:** `inventoryPair('')` сегодня безопасен (falsy → null), но ручная сборка values с `inventoryNumber: ''` даст normalized '' и UNIQUE-схлопывание второй копии.
**How to avoid:** экшен мапит '' → null до query-слоя (паттерн commonPayload: `inventory === '' ? undefined : inventory`).

### Pitfall 6: `refresh()` забыт — реестр/карточка не перерисовались
**What goes wrong:** копии созданы, но не видны без ручного reload (Pitfall 1 фазы 3).
**How to avoid:** refresh() после успешной мутации в экшене — контракт actions.ts.

### Pitfall 7: Клиент — источник истины последовательности
**What goes wrong:** экшен доверяет присланному списку/последнему значению → tamper-поверхность.
**How to avoid:** клиент шлёт только count и отредактированный СТАРТ; сервер сам сворачивает nextInventoryNumber N-1 раз; zod-капы (≤80, int 1..100).

## Code Examples

Паттерны 1–5 выше — все с источниками (probe-протоколы / файлы node_modules / кодовая база). Дополнительно:

### Контракт клон-экшена (по createDeviceAction, actions.ts)
```ts
// VERIFIED: контракт из app/(app)/devices/actions.ts:105-133
export async function cloneDeviceAction(_prev: unknown, formData: FormData): Promise<CloneFormState> {
  await requireSession()                                   // T-03-01 — всегда первым
  const values = echoCloneValues(formData)                 // 'count','inventoryNumber'
  const parsed = cloneSchema.safeParse({                   // z.object({ deviceId: z.coerce.number().int().positive(),
    deviceId: formData.get('deviceId'),                    //   count: z.coerce.number().int().min(1).max(100),   // D-03
    count: formData.get('count'),                          //   inventoryNumber: z.string().min(1).max(80).optional() })
    inventoryNumber: textOf(formData, 'inventoryNumber') || undefined,
  })
  if (!parsed.success) return { ...cloneFieldErrorsOf(parsed.error), values }
  const source = getDevice(parsed.data.deviceId)
  if (!source) return { error: CLONE_ERROR, values }
  try {
    const ids = cloneDevices(source, parsed.data.inventoryNumber ?? null, parsed.data.count)
  } catch (e) { return { ...uniqueFieldError(e), values } } // 'уже есть' — русская копия, D-06
  refresh()                                                // Pitfall 6
  return { ok: true, created: ids.length }                 // D-07: «Создано N копий»
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| better-sqlite3 ≤12: FK OFF по умолчанию на соединении | better-sqlite3 13: FK **ON** по умолчанию | 13.x | Рекреационные миграции через drizzle-orm-раннер ломаются на заполненных базах; проектный openDb уже ставил FK ON явно — поведение рантайма не изменилось, изменился CLI-путь [VERIFIED: probe] |
| «partial vs expression index» какcandidates для NULL-пар | Обычный UNIQUE на nullable-колонке | всегда (SQLite-семантика NULL) | Меньший diff схемы; зеркалит inventory_normalized [VERIFIED: probe + sqlite docs] |
| drizzle-kit push | generate+migrate (проектное правило) | Key Decision | Без изменений — подтверждается новым риском Pitfall 1 |

**Deprecated/outdated:** `middleware.ts` (Next 16 → proxy.ts) — фазу не затрагивает; упомянуто во избежание регрессий при обновлении README.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | «Дублировать» рендерится только там, где ряд действий существует (статус ≠ disposed): для disposed ряд скрыт целиком (page.tsx:243) — клонирование списанного устройства недоступно | Architecture Patterns / Open Questions | Оператор не сможет клонировать списанную закупку; обход — временно… нет механизма; потребует решения владельца, если понадобится |
| A2 | Инкремент хвоста через Number (не BigInt) достаточен: инвентарные хвосты ≤ 80 символов, практически < 2^53 | Pattern 4 | Только теоретический; zod кап 80 символов ловит абсурд |
| A3 | Подтверждение «Создано N копий» — инлайн-сообщение/тост на карточке после закрытия диалога (D-07 не фиксирует механизм) | Pattern 5 | Косметика; ретаргет без ограничений |
| A4 | Runner scripts/migrate.mjs станет постоянным способом миграций проекта (замена CLI-шага в README/deploy), а не одноразовым скриптом | Runtime State Inventory / Pattern 2 | Если оставить CLI — будущие recreation-миграции снова молча упадут; решение плана фазы |

## Open Questions (RESOLVED — 2026-09-17, plan 09-01 + UI-SPEC)

1. Клонирование disposed → **A1**: кнопка не рендерится на disposed-карточке (09-01-PLAN assumptions A1, Task 3; UI-SPEC Default 13).
2. «Создано N…» механика → **A3**: инлайн-линия `data-clone-created` под рядом действий, wrapper-owned (Task 3; UI-SPEC Default 8).
3. Судьба `drizzle-kit migrate` → **A4**: полная замена раннером `node scripts/migrate.mjs` в README + deploy.sh (Task 1 step 4); CLI для нерекреационных миграций НЕ остаётся.

1. **Клонирование со списанной карточки (disposed)?**
   - What we know: ряд действий на disposed скрыт целиком (D-03 фазы 4, view-only); CONTEXT не квалифицирует статус кнопки «Дублировать».
   - What's unclear: нужна ли оператору возможность клонировать списанную закупку.
   - Recommendation: A1 — кнопка живёт в существующем ряду (disposed → недоступна); если владелец захочет иное — однострочный ретаргет (вынести кнопку из статусного условия).
2. **Механика подтверждения «Создано N копий»** — тост vs инлайн у ряда действий.
   - Recommendation: инлайн-сообщение рядом с рядом действий (меньше нового UI-примитива; в репо тостов нет).
3. **Судьба `npx drizzle-kit migrate` в README/deploy.sh.**
   - Recommendation: заменить шаг на `node scripts/migrate.mjs` повсеместно (одинаковая семантика трекинга, закрывает Pitfall 1 навсегда); альтернатива — оставить CLI для нерекреационных миграций и задокументировать runner как обязательный для 0001.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | runner, vitest, Next | ✓ | 22.23.0 | — |
| better-sqlite3 | транзакция клона, runner | ✓ | 13.0.3 | — |
| drizzle-kit | generate 0001 | ✓ | 0.31.10 | — |
| drizzle-orm | transaction API, migrator-семантика | ✓ | 0.45.2 | — |
| vitest | матрица тестов | ✓ | 4.1.11 | — |
| next / react | клон-диалог, экшен | ✓ | 16.3.3 / 19.2.8 | — |
| zod | белый список экшена | ✓ | 4.5.4 | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none (внешних сервисов фаза не требует)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.11 (environment node) |
| Config file | vitest.config.ts (alias @, server-only stub) |
| Quick run command | `npx vitest run tests/inventory-increment.test.ts` (или целевой файл) |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REG-06/SC3, D-02 | nextInventoryNumber: паддинг, многозначные, не-числовой хвост, пустой оригинал, перенос, последовательность | unit | `npx vitest run tests/inventory-increment.test.ts` | ❌ Wave 0 |
| REG-06/SC1, D-06 | cloneDevices: N вставок одной транзакцией; коллизия в середине → 0 новых строк; { code } наружу | unit (temp db) | `npx vitest run tests/clone-queries.test.ts` | ❌ Wave 0 |
| REG-06/SC2, D-05 | serial NULL/NULL-пары легальны; копии in_stock без holder; notes/фото/движения не копируются | unit (temp db) | `npx vitest run tests/clone-queries.test.ts` | ❌ Wave 0 |
| REG-06/SC4, D-04 | Наследование закупочного блока + конфиг-полей своего типа; спарсинг чужого типа | unit (temp db) | `npx vitest run tests/clone-queries.test.ts` | ❌ Wave 0 |
| D-03 | count 1..100: 0/101 → zod reject (экшен-уровень) | unit (schema) | `npx vitest run tests/device-schema.test.ts` (новые кейсы) | ✅ (расширить) |
| D-08 | Миграция 0001: serial-колонки nullable; NULL-пары serial легальны; дубль непустого отклонён; данные/триггеры/CHECK целы | unit (temp db, applyMigrations) | `npx vitest run tests/schema.test.ts` (новые кейсы) | ✅ (расширить; зеркало inventory-теста) |
| SC1 UI, D-07 | Диалог открывается, «Создано N копий» на карточке | smoke-ассерт data-атрибута (прецедент фазы 2: компонентного раннера в репо нет) | в составе suite | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run <затронутые файлы>`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** полный suite зелёный + `npm run build` + lint перед `/gsd:verify-work`; приёмка миграции на проде — pragma-ассерт Pitfall 1

### Wave 0 Gaps
- [ ] `tests/inventory-inventory-increment.test.ts` → `tests/inventory-increment.test.ts` — матрица SC 3/D-02
- [ ] `tests/clone-queries.test.ts` — транзакционность/наследование/NULL-пары/откат (createTempDb + applyMigrations)
- [ ] Расширить `tests/schema.test.ts` — nullable serial + NULL-пары + сохранение данных 0001
- [ ] Раннер миграции: fixtures нет — при желании тест на заполненной temp-базе против Pitfall 1/3

*(Framework install не нужен — vitest в devDependencies)*

## Security Domain

> security_enforcement: true, ASVS level 1 (config.json). Домен обязателен.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (косвенно) | requireSession() на всех путях мутации (T-03-01) |
| V3 Session Management | no | Существующая jose-сессия не затрагивается |
| V4 Access Control | yes | requireSession() первым стейтментом клон-экшена; deviceId валидируется до getDevice |
| V5 Input Validation | yes | zod-белый список: deviceId int+, count int 1..100, inventoryNumber ≤80 optional; strict — лишние ключи = tampering → reject (T-03-02); echo-values для ошибок |
| V6 Cryptography | no | Новых криптопримитивов нет |
| V7 Error Handling | yes | { code }-маппинг uniqueCodeOf/uniqueFieldError; русские копии, внутренности (SQLITE-коды) не покидают сервер |

### Known Threat Patterns for {Next 16 server actions + SQLite/drizzle}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Crafted POST клона с status/currentEmployeeId (эскалация состояния) | Tampering/Elevation | Поля отсутствуют в белом списке; query-слой хардкодит in_stock/null (T-04-02) |
| DoS транзакции гигантским N | DoS | D-03: zod max(100); SQLite один писатель — sync-транзакция ≤100 вставок ~мс |
| Инъекция через инвентарник/подсказку | Tampering | drizzle bind-параметры повсюду; строка только в values, не в SQL-тексте |
| Mass assignment через FormData | Tampering | Паттерн commonPayload/typedPayload — читаются только 3 именованных поля |
| Коллизия как побочный канал существующих инвентарников | Information Disclosure | Коллизия → бизнес-ошибка поля («уже есть») — существующий UX-контракт D-17 |

## Sources

### Primary (HIGH confidence)
- Probe-протоколы настоящего исследования (2026-09-16, песочница внутри проекта, удалена после): SQLite NULL/UNIQUE-семантика; drizzle-kit generate 0001 (полный SQL); drizzle-kit migrate на пустой и заполненной базе; defer_foreign_keys-отвержение; runner-рецепт + 13-пунктовая post-батарея — всё против установленных better-sqlite3 13.0.3 / drizzle-kit 0.31.10 / drizzle-orm 0.45.2 / SQLite 3.53.4
- node_modules/drizzle-orm/sqlite-core/dialect.js:643-676 — SQLiteSyncDialect.migrate: явный BEGIN, сравнение created_at < folderMillis
- node_modules/drizzle-orm/migrator.js:3-30 — readMigrationFiles: folderMillis=journal.when, hash=sha256(file)
- node_modules/drizzle-kit/bin.cjs (connections.ts) — connectToSQLite/better-sqlite3 transactionProxy, глотание ошибок
- Кодовая база: db/schema.ts; db/queries/devices.ts (uniqueCodeOf, inventoryPair, createDevice); db/queries/movements.ts (транзакции, Tx); app/(app)/devices/actions.ts; device-actions.tsx; device-dialog.tsx; movement-dialogs.tsx (useCloseOnOk); app/(app)/(card)/devices/[id]/page.tsx:235-257; lib/device-schema.ts:172-181; lib/normalize.mjs; db/index.ts (pragmas, UDF norm); tests/helpers.ts; tests/schema.test.ts; drizzle/0000_amusing_talon.sql (триггеры, частичный индекс); drizzle.config.ts; package.json

### Secondary (MEDIUM confidence)
- README.md:23,132,159,192 — задокументированный шаг `npx drizzle-kit migrate` (то, что раннер заменит)
- .planning/PROJECT.md Key Decisions; .planning/STATE.md Blockers [Phase 9]

### Tertiary (LOW confidence)
- None — все утверждения либо probe-верифицированы, либо помечены [ASSUMED] с указанием риска

## Metadata

**Confidence breakdown:**
- Миграция: HIGH — полный end-to-end probe обеих веток (CLI-провал и runner-успех) с 13 проверками целостности на заполненной базе
- Стек/паттерны: HIGH — всё собрано из существующих, читаемых файлов кодовой базы; версии сняты с node_modules
- Pitfalls: HIGH — каждый воспроизведён (Pitfall 1/2/3) или взят из задокументированных прецедентов прошлых фаз (4–7)
- UI: MEDIUM-HIGH — механика диалога читается из кода, но рендер-поведение без компонентного раннера подтверждается только на UAT

**Research date:** 2026-09-16
**Valid until:** ~2026-10-16 (30 дней; стек фиксирован в package.json, риска дрейфа нет)
