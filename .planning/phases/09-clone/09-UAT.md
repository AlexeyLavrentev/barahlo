---
status: testing
phase: 09-clone
source: [09-VERIFICATION.md]
started: 2026-09-17T06:00:00Z
updated: 2026-09-17T06:00:00Z
---

## Current Test

number: 1
name: Ряд действий + линия успеха (backstop 1)
expected: |
  На карточке активного устройства (in_stock/assigned/repair) в ряду действий
  видна кнопка «Дублировать» (secondary), порядок «Редактировать → Дублировать →
  custody → Списать (последним)». После успешного клона под рядом появляется
  линия «Создано {N устройства/устройств}» нейтральным ink (не зелёная, не акцент),
  с data-clone-created. На списанной карточке кнопки нет.
awaiting: orchestrator (Playwright MCP) + user sign-off

## Tests

### 1. Ряд действий + линия успеха (backstop 1)
expected: Кнопка «Дублировать» secondary в ряду (не на disposed); после успеха — инлайн «Создано N…» под рядом, нейтральный ink.
result: [pending]

### 2. Disabled-сабмит + сброс линии (backstop 2)
expected: Во время полёта экшена сабмит неактивен (повторный клик не создаёт дублей); при следующем открытии диалога линия успеха очищена.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps

Нет. 9/11 must-haves верифицировано автоматикой (392/392, миграция на dev-БД раннером);
2 пункта — браузерные истины из UI-SPEC backstop'ов (компонентного раннера в репо нет).
