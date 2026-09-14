---
status: testing
phase: 6-dashboard
source: [06-VERIFICATION.md]
started: 2026-09-14T14:10:00Z
updated: 2026-09-14T14:10:00Z
---

## Current Test

number: 1
name: Visual hierarchy + overflow backstops
expected: |
  Tiles grid (4 types then 4 statuses, quiet white tiles), two-column blocks («Гарантия», лента), counter rows with chevrons, «Ближайшие сроки» sub-header, top-5 two-line rows; overflow probes with long model/name truncate before pill/serial/date, title attrs carry full texts.
awaiting: user response

## Tests

### 1. Visual hierarchy + overflow backstops
expected: Открой `/` на сидированной базе: сетка тайлов (4 типа, затем 4 статуса — тихие белые карточки), зона из двух блоков («Гарантия», «Последние перемещения»), строки-счётчики с шевронами, подзаголовок «Ближайшие сроки», двухстрочные ряды топ-5. Пробы на переполнение: длинная модель и длинное имя в ленте, длинная модель в топ-5 — усечение до пилюли/серийника/даты, layout не ломается, title несёт полный текст. «Списано»-тайл нейтральный; единственная destructive-окраска — пилюля «Списание» в ленте.
result: [pending]

### 2. Deep-link click-through
expected: Клик по тайлу типа, тайлу статуса, каждому гарантийному счётчику (≤30, ≤60, Истекла) и ряду топ-5; в ленте — клик по модели и по имени сотрудника. Каждый клик открывает предфильтрованный /devices (или карточку устройства/сотрудника); число в заголовке списка для гарантийного счётчика совпадает с числом на дашборде.
result: [pending]

### 3. WR-01 semantic confirmation (живые данные)
expected: На устройствах с известными датами (сегодня, +60, +61, вчера, +70, NULL): «≤ 30» и «≤ 60» включают гарантию до сегодняшнего дня; +60 внутри «≤ 60», +61 ни в одном счётчике; вчера — только в «Истекла»; топ-5 — ближайшие живые даты по возрастанию, все оранжевые (зелёных нет), истёкшие/NULL в списке отсутствуют, но входят в «Истекла».
result: [pending]

### 4. Judgment-tier prohibition sign-off
expected: Прочитать три запрета против кода и подписать: (a) ни у одного счётчика нет параллельной реализации предиката — тайлы это GROUP BY parity-пины, гарантийные счётчики/топ-5 КОМПОЗИЦИЯ warrantyPredicate; (b) таблица маршрутов ленты совпадает с UI-SPEC («склад» только в assigned/returned/transferred; to_repair сохраняет «от {держатель}»; received/from_repair/disposed без маршрута), SELECT читает append-only — мутиций на дашборде нет; (c) нет второй гарантийной математики или цветовой логики на странице (только WarrantyDate), истёкшие никогда не попадают в «живой» топ-5.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
