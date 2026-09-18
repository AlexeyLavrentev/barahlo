---
status: complete
phase: 08-csv
source: [08-VERIFICATION.md]
started: 2026-09-16T09:00:00Z
updated: 2026-09-16T09:20:00Z
---

## Current Test

[testing complete]

## Tests

### 1. RU-Excel — «21,5» число, не «21.май»
expected: Колонка «Диагональ, ″» с дробной диагональю читается Excel'ом как число при RU-локали (запятая-десятичная ячейка); dot-вариант «21.5» датой НЕ возвращается.
result: pass

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

Нет. 8/8 must-haves верифицировано автоматикой (08-VERIFICATION.md); единственный
ручной пункт — поведение локали Excel, vitest-невоспроизводимо.

## Вне UAT (решение зафиксировано)

- **WR-01 (08-REVIEW, warning)** — дублированный query-параметр рушит паритет
  CSV↔страница на malformed URL (предсуществующая строка route.ts:43 фазы 5).
  Решение: defer до Фазы 11, записано в deferred-items.md и 08-REVIEW.md;
  при планировании Фазы 11 добавить в её scope явно (SC сейчас не упоминает).
