---
status: testing
phase: 13-Удаление устройств
source: [13-02-PLAN.md human-check / 13-VALIDATION.md Manual-Only]
started: 2026-09-28T11:40:00Z
updated: 2026-09-28T11:40:00Z
---

## Current Test

number: 1
name: Юзерский UAT — удаление устройств
expected: |
  Сценарии SC1–SC5 проходят в браузере вручную; оператор подтверждает sign-off.
awaiting: user response

## Tests

Оркестратор прогнал через Playwright MCP на prod-сборке (:3100, dev-БД) — все pass. Жертвы UAT (dev-данные): устройство 11 (in_stock, 3 записи) и устройство 107 (спиcано → удалено целиком) — удалены безвозвратно.

### 1. Зона и диалог (SC1)
expected: Тихая зона «Удалить устройство» на карточке (все статусы); диалог: модель, серийник/инвентарник, счётчики «N записей истории и M фото будут удалены безвозвратно.», «Не удалять»/красная «Удалить»
result: pass (playwright) — «3 записи истории и 0 фото» (плюрализация верна), custody-ряд не задет

### 2. Отмена без действий (SC1)
expected: «Не удалять» закрывает диалог, карточка на месте, ноль изменений
result: pass (playwright)

### 3. Удаление → redirect → 404 (SC1)
expected: После подтверждения — redirect на /devices; старый URL отвечает 404
result: pass (playwright) — /devices/11 → 404

### 4. Каскад и лента (SC2)
expected: История уходит с устройством; лента дашборда чиста
result: pass (playwright) — лента без SN-LVCF11; ноль сирот прикреплён юнит-матрицей (каскад/rollback/файлы)

### 5. Parity поверхностей (SC3)
expected: Реестр/поиск/⌘K/CSV/счётчики не знают удалённого
result: pass (playwright) — substring-поиск «LVCF11» → «Ничего не найдено»; дашборд чист; ⌘K/CSV/«выданное» прикреплены parity-обходом юнит-тестов

### 6. Зона на disposed (SC5/D-01)
expected: У списанного устройства зона удаления есть; custody-ряд и «Редактировать» скрыты
result: pass (playwright) — устройство 107 спиcано через UI (заодно доказано «Списать работает как раньше», SC4), зона видна, лишнего нет

### 7. Списанное удаляется целиком (главный сценарий)
expected: «Списал по ошибке» → удаление устройства с disposed-статуса работает
result: pass (playwright) — 107 удалён, 404

### 8. Удаление ≠ списание (SC4)
expected: Списание работает как раньше; удаление не создаёт записей movements
result: pass (playwright + unit) — списание выполнено в рамках UAT; счётчик movements до==после прикреплён юнит-тестом

### 9. Backstop
expected: Устройство без истории/фото (клон-младенец) удаляется; файлы фото исчезают с диска
result: pass (unit) — childless no-op тест; existsSync false для оригинала+thumb

## Summary

total: 9
passed: 9
issues: 0
pending: 1 (юзерский sign-off)
skipped: 0
blocked: 0

## Gaps
