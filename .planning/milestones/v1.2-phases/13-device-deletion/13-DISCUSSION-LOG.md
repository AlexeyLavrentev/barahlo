# Phase 13: Удаление устройств - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-28
**Phase:** 13-Удаление устройств
**Areas discussed:** Поверхность удаления, Форма подтверждения

---

## Поверхность удаления

| Option | Description | Selected |
|--------|-------------|----------|
| 1а | Кнопка на карточке, все статусы вкл. disposed; у disposed — отдельная тихая зона вне скрытого custody-ряда | ✓ |
| 1б | Только у не-disposed | |

**User's choice:** «все рек» → 1а
**Notes:** главный сценарий фазы — «списал/добавил по ошибке» при любом статусе.

## Форма подтверждения

| Option | Description | Selected |
|--------|-------------|----------|
| 2а | Красный диалог: модель + серийник + «N записей истории, M фото»; «Не удалять»/«Удалить» | ✓ |
| 2б | 2а + type-to-confirm инвентарником | |

**User's choice:** «все рек» → 2а
**Notes:** type-to-confirm отвергнут — один оператор, лишняя механика.

## Claude's Discretion

- Файлы фото удаляются с диска после COMMIT (сбой диска ≠ откат транзакции)
- Redirect на /devices после удаления; 404-контракт покрывает прямые заходы
- Guard `WHERE id` + `.changes` → DEVICE_GONE; без статус-предусловия
- Parity поверхностей структурный (deviceWhere/join), без списков исключений + тест-parity
- Ноль новых пакетов; кинжал-тесты на каскад-полноту (ноль сирот)

## Deferred Ideas

None — discussion stayed within phase scope
