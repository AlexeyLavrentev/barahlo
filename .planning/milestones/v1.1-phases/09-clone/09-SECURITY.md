---
phase: 9
slug: clone
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-09-17
---

# Phase 9 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → server action | CloneDialogForm POST-ит FormData напрямую в cloneDeviceAction (server actions POST-аемы, proxy-периметр не покрывает) | FormData: deviceId, count, inventoryNumber |
| host shell → migrate runner | scripts/migrate.mjs исполняется оператором на прод-базе с DATABASE_PATH | SQL-стейтменты миграции 0001 |
| dialog input → SQL values | строка инвентарника клона попадает в INSERT devices | одна строка ≤ 80 символов |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-09-01 | Tampering/Elevation | cloneDeviceAction | high | mitigate | zod `strictObject` из 3 именованных полей (actions.ts:308) — status/currentEmployeeId/notes в белом списке отсутствуют как класс (T-03-02); query-слой хардкодит `status:'in_stock'`, holder не пишется (devices.ts:630, T-04-02) — crafted POST не эскалирует состояние копий | closed |
| T-09-02 | DoS | cloneDeviceAction → cloneDevices | medium | mitigate | `count: z.coerce.number().int().min(1).max(100)` (actions.ts:312, D-03); SQLite один писатель, sync-транзакция ≤100 вставок ~мс | closed |
| T-09-03 | Tampering | FormData → SQL | medium | mitigate | читаются ровно 3 именованных поля (паттерн commonPayload); drizzle bind-параметры повсюду — строка только в values | closed |
| T-09-04 | Information Disclosure | коллизия инвентарника | low | accept | коллизия → бизнес-ошибка поля («уже есть», byte-exact uniqueFieldError); SQLITE-коды не покидают сервер (V7) | closed |
| T-09-05 | Tampering | scripts/migrate.mjs на проде | medium | mitigate | runner идемпотентен (pending по created_at, повторный запуск no-op — проверено на dev-БД); `PRAGMA foreign_keys = ON` после COMMIT (migrate.mjs:92); pragma-ассерт `serial% notnull=0` — шаг приёмки деплоя | closed |
| T-09-SC | Tampering | npm installs | low | accept | `git diff d34c202..HEAD -- package.json` пуст; review+verifier подтвердили ноль установок | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-09-1 | T-09-04 | Коллизионная копия — существующий UX-контракт D-17 (бизнес-ошибка поля, без утечки SQLITE-деталей) | orchestrator (auto, L1) | 2026-09-17 |
| AR-09-2 | T-09-SC | Фаза не устанавливает пакетов (REQUIREMENTS §Out of Scope); diff package.json пуст | orchestrator (auto, L1) | 2026-09-17 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-17 | 6 | 6 | 0 | orchestrator (ASVS L1 short-circuit: register plan-time, grep-свидетельства: strictObject+хардкод статуса, max(100), FK ON после COMMIT, пустой package.json diff) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-17
