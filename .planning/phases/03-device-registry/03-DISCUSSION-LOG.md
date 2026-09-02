# Phase 3: Device Registry - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-02
**Phase:** 3-device-registry
**Mode:** --auto (автономный прогон; все выборы — recommended-дефолты)
**Areas discussed:** Наборы полей по типам, Вид периферии, Обязательность серийника, Список устройств, Карточка устройства

---

[--auto] Selected all gray areas: Наборы полей по типам, Вид периферии, Обязательность серийника, Список устройств, Карточка устройства

## Наборы полей по типам

[auto] Q: «Пер-типовые поля?» → Selected: «общие + laptop(RAM/флаг/SSD), monitor(диагональ/матрица), dock(порты), peripheral(вид) — через device_schema keystone» (recommended; совпадает со схемой v1)

## Вид периферии

[auto] Q: «Свободный текст или список?» → Selected: «фиксированный список: мышь/клавиатура/гарнитура/веб-камера/прочее» (recommended — фильтруемость)

| Option | Description | Selected |
|--------|-------------|----------|
| Фиксированный список | select, 5 значений | ✓ |
| Свободный текст | опечатки дробят будущие фильтры | |

## Обязательность серийника

[auto] Q: «Серийник у периферии без серийника?» → Selected: «обязателен у всех; конвенция — вписывать инвентарник из 1С» (recommended; схема NOT NULL+UNIQUE, Core Value)

## Список устройств

[auto] Q: «Фильтр по типу?» → Selected: «dropdown + колонки модель/тип/серийник/инвентарник/держатель/статус, пагинация 20» (recommended; D-01 паттерны фазы 2)

## Карточка устройства

[auto] Q: «Что в карточке?» → Selected: «все поля типа группами; статус/держатель — просмотр без редактирования; edit через тот же диалог» (recommended; REG-04 — фаза 4)

## Claude's Discretion

- Группировка полей, порядок колонок, формат даты/цены, текст подсказки

## Deferred Ideas

- Фото — Phase 4; статусы-действия — Phase 4; поиск/фильтры — Phase 5; клон — v1.x
