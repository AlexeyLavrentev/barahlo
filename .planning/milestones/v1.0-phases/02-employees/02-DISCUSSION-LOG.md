# Phase 2: Employees - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-01
**Phase:** 2-employees
**Mode:** --auto (полностью автономный прогон; все выборы — recommended-дефолты, ни одного вопроса пользователю)
**Areas discussed:** Список сотрудников, Архивирование, Справочник отделов, Дубли имён, Поиск в списке, Визуальный язык

---

[--auto] Selected all gray areas: Список сотрудников, Архивирование, Справочник отделов, Дубли имён, Поиск в списке, Визуальный язык

## Список сотрудников

[auto] Q: «Список-строки или карточки?» → Selected: «список-строки, server-side pagination» (recommended default)

| Option | Description | Selected |
|--------|-------------|----------|
| Список-строки | имя + отдел в строке, плотно, пагинация | ✓ |
| Карточки | крупные плитки — на 200 сотрудников не эргономично | |
| Таблица | жёсткие колонки — избыточно для 2 полей | |

## Архивирование

[auto] Q: «Как архивировать?» → Selected: «кнопка + подтверждение, фильтр Активные/Архив, разархивирование» (recommended default)

## Справочник отделов

[auto] Q: «Где CRUD отделов?» → Selected: «инлайн в форме сотрудника (combobox с созданием), без отдельной страницы» (recommended default; YAGNI)

| Option | Description | Selected |
|--------|-------------|----------|
| Инлайн в форме | выбор + создание на лету, unique уже в схеме | ✓ |
| Отдельная страница настроек | admin-раздел справочника | |

## Дубли имён

[auto] Q: «Unique на имя?» → Selected: «не enforced — реальные однофамильцы, различаются отделом» (recommended default)

## Поиск в списке

[auto] Q: «Поиск по имени сейчас?» → Selected: «нет — Phase 5 (FIND-01 с гомоглифами)» (recommended default; YAGNI)

## Визуальный язык

[auto] Q: «Источник дизайн-гайдов?» → Selected: «skill apple-design, наследуется фазами 3–6» (подтверждено PROJECT.md)

## Claude's Discretion

- Форма инлайн-создания отдела (по apple-design)
- Сортировка (имя asc)
- Разметка пагинации

## Deferred Ideas

- Поиск/фильтр по имени — Phase 5
- Печатная карточка/акт выдачи — v1.x
