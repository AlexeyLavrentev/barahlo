# Phase 13: Удаление устройств - Context

**Gathered:** 2026-09-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Оператор удаляет ошибочно добавленное устройство целиком одним подтверждённым действием — вместе с его историей и фото — и устройство гарантированно исчезает со всех поверхностей учёта: реестр (список/фильтры), substring-поиск, ⌘K-палитра, дашборд (счётчики + лента), обе CSV-выгрузки, «выданное» у сотрудников. Удаление ≠ списание: «Списать» работает как раньше, удаление не создаёт записей и не архивирует. Прямые заходы на старый URL — 404 (контракт фазы 2). Правка полей устройства и правка истории (фаза 12) не трогаются.

</domain>

<decisions>
## Implementation Decisions

### Поверхность удаления
- **D-01:** Кнопка «Удалить» живёт на карточке устройства и доступна для **всех** статусов, включая disposed. У disposed-карточки custody-ряд остаётся скрытым (D-03 фазы 4), кнопка удаления — отдельная тихая зона вне этого ряда (главный сценарий фазы: «списал по ошибке» / «добавил по ошибке» при любом статусе).
- **D-02:** Подтверждение — красный диалог по прецеденту «Удалить запись?» (фаза 12): модель + серийник/инвентарник устройства, счётчики «N записей истории, M фото будут удалены безвозвратно», кнопки «Не удалять» / «Удалить» (bg-destructive, pending). Нативные confirm запрещены; type-to-confirm НЕ вводится — один оператор.

### Механика удаления
- **D-03:** Жёсткое удаление в ОДНОЙ транзакции: строки `movements` и `attachments` удаляются явно (FK RESTRICT не даст иначе), затем строка `devices` — `WHERE id` + `.changes===0 → DEVICE_GONE` (гонка/повторное удаление — дешёвый явный отказ).
- **D-04:** Файлы фото (оригинал + thumb из lib/photos) удаляются с диска (`data/uploads/`) вместе с БД-строками; удаление файлов — после успешного COMMIT (сбой диска не должен откатывать честную транзакцию БД; осиротевший файл — не осиротевшая запись). storage_key берётся из БД до удаления строк.
- **D-05:** После успеха — redirect на `/devices` (карточки больше нет); повторный заход на старый URL отвечает 404 через существующий notFound() контракт фазы 2.
- **D-06:** Parity поверхностей структурный: удаление строки devices само выводит устройство из общего `deviceWhere` (реестр, substring-поиск, CSV), ⌘K (тот же предикат), счётчиков дашборда (zero-default итерация), ленты (innerJoin devices), «выданного» у сотрудника (currentEmployeeId-фильтр). Никаких «списков исключений» — отдельный тест-parity.

### Claude's Discretion
- Тексты диалога/ошибок — по копирайт-контракту нового UI-SPEC (DELETE_ERROR-семейство фазы 12 байт-точное)
- SERVER guard: удаление не требует статуса-предусловия (удаляется любой статус, включая assigned — владелец понимает, что техника «у сотрудника» исчезает из его карточки)
- Ноль новых пакетов; кинжал-тесты: cascade-полнота (ноль сирот movements/attachments), parity-тест «устройства нет нигде»
- Дашборд-счётчики/лента продолжают работать после удаления (тест на пустой/непустой базе)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Планирование и требования
- `.planning/ROADMAP.md` §Phase 13 — Success criteria 1–5 (404, каскад в одной транзакции, parity deviceWhere, удаление ≠ списание, карточки сотрудников)
- `.planning/REQUIREMENTS.md` §DEL — DEL-01, DEL-02 дословно
- `.planning/phases/12-history-correction/12-CONTEXT.md` — прецеденты вехи (replay-движок, dispose-семантика, диалоговые паттерны)
- `.planning/phases/12-history-correction/12-01-SUMMARY.md`, `12-02-SUMMARY.md` — свежие сигнатуры/паттерны

### Код — слои, которые фаза трогает
- `db/queries/devices.ts` — deviceWhere (parity всех поверхностей), listDevices
- `db/queries/movements.ts` — лента (innerJoin devices), listIssuedByEmployee; DELETE-триггер уже снят миграцией 0002
- `db/queries/attachments.ts` + `lib/photos.ts` — storage_key/thumbKey/uploadsDir; удаление файлов на диске
- `app/(app)/devices/actions.ts` — контракт Server Actions (requireSession-first, {code}→копии, refresh); DELETE_ERROR фазы 12
- `app/(app)/devices/device-actions.tsx` + `device-dialog.tsx` — ряд действий карточки (куда встаёт тихая зона удаления)
- `app/(app)/employees/archive-confirm-dialog.tsx`, фаза 12 `movement-edit-dialogs.tsx` — шаблоны confirm-диалогов
- `app/(app)/(card)/devices/[id]/page.tsx` — карточка (не трогается кроме зоны удаления), 404-контракт
- `tests/movement-edit.test.ts` — bootstrap + source-gates паттерн

### Гайды
- `/Users/aleksey/.zcode/skills/vercel-react-best-practices/SKILL.md` — USER MANDATE (с фазы 3)
- Гайды apple-design — Apple-эстетика (токены, деструктив #D70015)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Confirm-диалог-шаблон (archive-confirm-dialog, MovementDeleteConfirmDialog фазы 12) — WR-01 split, useCloseOnOk, красный деструктив
- EmployeeOption-free serialization: snapshot-дисциплина card page (dialogDeviceOf) — модели/серийники на клиент строками
- DELETE_ERROR + movementMutationErrorOf-паттерн (actions.ts) — {code}→русские копии
- tests/movement-edit.test.ts bootstrap — temp-DB + applyMigrations (0002 уже в цепочке)

### Established Patterns
- Один-tx + guard `.changes` — deleteDevice наследует; DELETE без статус-предусловия, только существование
- source-gates (readFileSync-тесты) — requireSession-first, ноль машинных кодов
- D-05 names-as-text, D-03 view-only disposed — не трогаются; удаление = отдельная зона (D-01)

### Integration Points
- deviceWhere — единственная точка правды видимости; НИКАКИХ изменений (parity структурный)
- lib/photos deleteFilesOf(deviceId) — новый маленький хелпер рядом с uploadsDir/thumbKey
- Лента дашборда и «выданное» — не меняются вовсе (структурное исчезновение)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 13-Удаление устройств*
*Context gathered: 2026-09-28*
