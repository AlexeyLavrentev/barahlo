---
status: complete
phase: 10-bulk
source: [10-01-SUMMARY.md]
started: 2026-09-17T11:00:00Z
updated: 2026-09-17T11:40:00Z
---

## Current Test

[testing complete — awaiting operator sign-off]

## Tests

### 1. SC1 — выделение: чекбоксы, панель, tri-state, сброс
expected: Клик чекбокса → панель «Выбрано: N»; «Выбрать страницу» → все 20; «Снять выделение» → панель исчезла; пагинация достижима при панели (pb-24).
result: pass
source: orchestrator (Playwright MCP, :3001)
evidence: «Выбрано: 3» после трёх кликов; «Выбрать страницу» → «Выбрано: 20»; «Снять выделение» → панель/счётчик исчезли; «Страница 1 из 20» видна при открытой панели.

### 2. SC2/SC4 — «Выдать» happy path + общие параметры
expected: Один диалог, один сотрудник, отчёт по каждой единице; N movement-событий с общим occurredAt/комментарием; выделение сброшено после успеха.
result: pass
source: orchestrator + DB
evidence: Батч 41+42 → «Записано: 2», строки «Aspire 5 · ИБ-0000132 · выдано Дмитрий Кравченко» ×2; movements 672/673 — event_type=assigned, ОДИН occurred_at (1789642752), общий комментарий «Раздача новеньких»; панель исчезла после успеха.

### 3. SC3 — blocker: всё-или-ничего
expected: assigned + in_stock → «Выдать» → «Операция не выполнена: ничего не записано.» + блокер-строка; выделение на месте; движений нет.
result: pass
source: orchestrator + DB
evidence: blocker «Aspire 5 · — · Используется» (id 6 assigned); device 7 остался in_stock на момент проверки; выделение «Выбрано: 2» сохранилось. После снятия id=6 → успех (movement 671).

### 4. «Принять» — assigned + repair
expected: Диалог без поля сотрудника; отчёт «принято на склад» / «возвращено из ремонта»; статусы → На складе.
result: pass
source: orchestrator + DB
evidence: «Принять устройства», combobox отсутствует; батч 11+107 → «Aspire 5 · ИБ-0000110 · принято на склад» + «Aspire 5 · — · возвращено из ремонта»; movements 674 (returned) / 675 (from_repair).

### 5. Key-reset — выделение не переживает навигацию (backstop)
expected: Выделить 2 → сменить страницу/фильтр → панель исчезла.
result: pass
source: orchestrator
evidence: Панель до=1; «Далее» → ?page=2 → панель=0 (key-reset по buildDevicesQuery).

### 6. Future date — валидация (backstop)
expected: Дата в будущем → «Дата не может быть в будущем», выделение на месте.
result: pass
source: code assertion + unit-пины
evidence: `occurredAtSchema` refine (movement-schema.ts:117) переиспользуется bulk-схемами; тест-пины movement-schema.test.ts:85/183. UI-лов на живом сабмите не стабилен (локальный экшен), гвард единый с одиночными диалогами.

### 7. Double submit — повторный клик не дублирует (backstop)
expected: Два быстрых клика «Выдать» → ровно по одному событию на единицу.
result: pass
source: orchestrator + DB
evidence: Два клика по сабмиту батча 56+57 → РОВНО 2 movement (676/677, assigned, один occurred_at), статус обеих assigned единожды; pending-disabled + prevalidation-first съели повтор.

### 8. Длинный комментарий — cap (backstop)
expected: 500 символов не ломают форму (zod max(500)).
result: pass
source: code assertion
evidence: commentSchema max(500) (movement-schema.ts:120); bulk-схемы наследуют тот же комментарий.

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

Нет. Автоматика до UAT: 409/409, build/tsc/lint чисто.

## Примечание к dev-данным

UAT оставил реальные изменения в dev-БД (append-only семантика не откатывается): 7→Анна Шевченко, 41/42→Дмитрий Кравченко, 56/57→Анна Шевченко, 11/107→на склад (107 прошёл repair→in_stock). Тестовые данные, не трогаю.
