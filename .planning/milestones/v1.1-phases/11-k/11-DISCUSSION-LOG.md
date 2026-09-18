# Phase 11: ⌘K глобальная палитра - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-09-18
**Phase:** 11-k
**Mode:** --auto (рекомендованные дефолты; единственный внешний вход — STATE blocker [Phase 11], закрыт D-01)

## Транспорт поисковой поверхности (STATE blocker [Phase 11])

| Option | Description | Selected |
|--------|-------------|----------|
| A. GET-роут /api/search | requireSession-first, no-store, AbortController-friendly; прецеденты export/attachments | ✓ |
| B. Server action | Короче, но фетч-семантика палитры (отмена, повтор на ввод) чужда action-модели | |

**Auto-selected:** A. Контракт: requireSession-first, GET-only, trim/cap/фолд, LIMIT, no-store, JSON обеих групп.

## Параметры результатов

**Auto-selected:** группы «Устройства»/«Сотрудники», лимит 6+6, «Показать все» → список с ?q=; архивные с бейджем.

## Клавиатура

**Auto-selected:** ⌘K/Ctrl+K по event.code, повтор = toggle; ↑↓ циклично, Enter — переход+закрытие, Esc — закрытие; клик = Enter; инертна при открытом диалоге.

## «Скачать ведомость»

**Auto-selected:** пункт палитры → /api/devices/export (весь парк, без фильтров — палитра глобальна), закрывает палитру.

## Долги вехи (D-08)

**Auto-selected:** оба deferred WR-01 (route dup-param ф8 из 08-REVIEW.md; dedup пушей хука ф7 из 07-REVIEW.md — «решение до Фазы 11» роадмапом) входят в скоуп фазы отдельной задачей, до подключения палитры как консюмера хука.

## Claude's Discretion

- Структура палитры/стили — ui-phase; сигнатура JSON; тест-матрица; механика «инертен при диалоге»

## Deferred Ideas

- Поиск по держателю — дважды отклонён
- История запросов — запрещена SC 4
- FTS5/релевантность — Out of Scope
