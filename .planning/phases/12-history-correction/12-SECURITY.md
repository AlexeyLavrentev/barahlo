---
phase: 12
slug: history-correction
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-09-28
---

# Phase 12 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| FormData → Server Action → query layer | Actions напрямую POST-абельны; payload'ы правки/удаления — untrusted (ids, eventType, слоты, дата, комментарий) | movement/device ids, person slots, date, comment |
| RSC props → client island | Сериализованный снапшот таймлайна + employees через границу сервер/клиент | display strings, ids (префилл диалогов) |
| Migration 0002 → prod DB | Снятие append-only меняет легальные операции уровня БД | DDL: DROP TRIGGER ×2 |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-12-01 | Tampering | editMovement/deleteMovement WHERE | high | mitigate | Составной `WHERE id AND device_id` + `.changes===0 → MOVEMENT_GONE`; тест «чужой movementId» (tests/movement-edit.test.ts) | closed |
| T-12-02 | Tampering | editMovementSchema (eventType/слоты) | high | mitigate | z.enum от кейстоуна + strictObject; слоты выводит сервер из (тип, ввод), лишние → NULL; матрица schema-тестов | closed |
| T-12-03 | Tampering | replay-валидность цепочки | high | mitigate | In-tx replay: INVALID_CHAIN throw = полный ROLLBACK, ноль записей (D-03); тест «zero writes»; ORDER BY occurredAt ASC, id ASC | closed |
| T-12-04 | Spoofing | Смена слота на неактивного | medium | mitigate | assertActiveEmployee по CHANGED слотам; нетронутый архивный id сохраняется (OQ2); тесты | closed |
| T-12-05 | Tampering | Снятие append-only | high | mitigate | Только миграция 0002 в цепочке (generate --custom + scripts/migrate.mjs); drizzle-kit push запрещён; инверсионные тесты schema/migrate-runner; verifier: ноль runtime-обходов | closed |
| T-12-06 | DoS | Гонка двух правок | low | accept | Один writer (WAL) + in-tx replay + .changes-гард; single-user app | closed |
| T-12-07 | Spoofing | Сессия при прямом POST | high | mitigate | requireSession первой строкой обоих действий; source-gate тест | closed |
| T-12-08 | Tampering | movementId/deviceId из скрытых input'ов | high | mitigate | Серверный составной WHERE + replay по device_id (T-12-01); MOVEMENT_GONE generic | closed |
| T-12-09 | Tampering | eventType/слоты вне контракта | high | mitigate | zod strictObject кейстоуна; селект клиента — удобство, не авторитет | closed |
| T-12-10 | Information Disclosure | {code}-детали в UI | medium | mitigate | movementMutationErrorOf мапит коды в русские копии ДО возврата; source-gate negative-grep | closed |
| T-12-11 | DoS | Двойной submit удаления | low | mitigate | Pending-disabled + серверный .changes-гард (второй вызов — MOVEMENT_GONE) | closed |
| T-12-12 | Repudiation | Правка истории без аудита | low | accept | Аудит правок отклонён владельцем осознанно (CONTEXT discretion, single-оператор) | closed |
| T-12-SC | Tampering | npm installs | n/a | accept | Ноль новых пакетов (UI-SPEC Registry Safety) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| T-12-06 | Гонка двух одновременных правок | Один writer (WAL) + in-tx replay; single-user — риск теоретический | Владелец (план 12-01 threat model) | 2026-09-28 |
| T-12-12 | Правка без аудиторского следа | Прямая правка выбрана владельцем на старте вехи (корректирующие записи отклонены) | Владелец (CONTEXT.md discretion) | 2026-09-28 |
| T-12-SC | — | Фаза не устанавливает пакетов | — | 2026-09-28 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-28 | 13 | 13 | 0 | orchestrator (L1 short-circuit: plan-time register, все митигации доказаны source-gates тестами + gsd-verifier 19/19 + UAT 9/9 sign-off) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-28
