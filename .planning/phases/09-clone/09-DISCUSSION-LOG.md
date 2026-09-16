# Phase 9: Клон устройства - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-16
**Phase:** 09-clone
**Mode:** --auto (юзер-промптов не было; все зоны закрыты рекомендованными дефолтами)
**Areas discussed:** подсказка инвентарника при N>1, наследование полей, верхняя граница N, поведение после создания, движения копий, семантика миграции serial

---

## Подсказка инвентарника при N>1

| Option | Description | Selected |
|--------|-------------|----------|
| A. Стартовое поле + инкремент от предыдущего | Префилл «следующий по шаблону», правится стартовое; AB-002→AB-003→… | ✓ |
| B. Одно поле только для первой копии | Остальные копии без инвентарника | |
| C. N отдельных полей | Диалог пухнет, против SC 3 «редактируемая автоподсказка» | |

**Auto-selected:** A (recommended default)
**Notes:** Не распознан шаблон → пустое поле, ничего молча (SC 3). Чистая функция в lib + vitest.

## Наследование полей

| Option | Description | Selected |
|--------|-------------|----------|
| A. Закупка+поставщик+конфиг типа; notes/serial/inventory/фото/история/владелец нет | «Копия готова к выдаче» (SC 4) | ✓ |
| B. Только буквальный SC 4 (без поставщика и конфига) | Копия не готова к выдаче — против цели SC | |

**Auto-selected:** A (recommended default)

## Верхняя граница N

| Option | Description | Selected |
|--------|-------------|----------|
| A. 1..100 | Партия >100 нереалистична; неограниченный N — DoS-поверхность | ✓ |
| B. 1..50 | | |
| C. Без границы | | |

**Auto-selected:** A (recommended default)

## Поведение после создания

| Option | Description | Selected |
|--------|-------------|----------|
| A. Остаться на карточке оригинала + «Создано N копий» | | ✓ |
| B. Редирект на первую копию | Теряется контекст оригинала | |
| C. Редирект в реестр с фильтром «на складе» | Лишний навигационный скачок | |

**Auto-selected:** A (recommended default)

## Движения копий

| Option | Description | Selected |
|--------|-------------|----------|
| A. Ноль movement-событий | Создание ≠ перемещение (append-only custody, D-08 фазы 4); таймлайн чист | ✓ |
| B. «created»-событие в movements | Ломает семантику append-only custody-лога | |

**Auto-selected:** A (recommended default)

## Семантика миграции serial → nullable

| Option | Description | Selected |
|--------|-------------|----------|
| A. NULL-пары легальны, механизм — план фазы | STATE blocker [Phase 9] прямо оставляет механизм плану (research NULL-pair рецепт) | ✓ |
| B. Зафиксировать partial unique index в CONTEXT | Преждевременно — decision-heavy решение план-левела | |

**Auto-selected:** A (recommended default). Плюс D-08: пустой серийник в ручной форме НЕ легализуется — zod min(1) остаётся, клон-путь пишет NULL напрямую.

---

## Claude's Discretion

- Механизм миграции (partial unique index vs expression index) — план фазы
- Расположение чистой функции шаблона/инкремента; имена экшена/диалога
- Копи диалога; тест-матрица (транзакционность, шаблон, NULL-пары, наследование, N=100, collision-откат)

## Deferred Ideas

- Пустой серийник в обычной форме — вне REG-06
- Шаблоны устройств («пресеты») — не запрошено
- Печать этикеток — V2-04 QR, future
