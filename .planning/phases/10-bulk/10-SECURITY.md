---
phase: 10
slug: bulk
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-09-18
---

# Phase 10 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| browser → server action | Подделанный POST к bulk-экшенам мимо UI (server actions обходят matcher-proxy периметр) | FormData: deviceIds[], employeeId (assign), occurredAt, comment |
| FormData payload → query-слой | deviceIds-массив (гигантский, с дублями, чужие id), employeeId-инъекция в accept | массив ≤20 id, одна строка ≤500 |
| query result → dialog UI | Blockers/results едут в клиентский стейт и рендерятся оператору | модели/инвентарники/статусы строк |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-10-01 | Tampering/Elevation | bulk-экшены → bulk query fns | high | mitigate | in-tx SELECT-превалидация → blockers (ноль записей) + guard-UPDATE `WHERE id AND status=<precondition>`, `.changes===0` → throw → полный откат (movements.ts L373–494, verifier probe: in-batch дубликат → ILLEGAL_TRANSITION откат PASS); eventType/статусы никогда из payload (T-04-02) | closed |
| T-10-02 | Spoofing | оба bulk-экшена | high | mitigate | `await requireSession()` первой строкой (actions.ts L696+, T-03-01/V2) | closed |
| T-10-03 | Tampering/DoS | zod-слой | medium | mitigate | strictObject: deviceIds 1..20 int (cap=PAGE_SIZE) + дедуп Set в экшене; occurredAt «не в будущем», comment ≤500 | closed |
| T-10-04 | Tampering | bulkAcceptDevices | medium | mitigate | accept-схема БЕЗ employeeId (инъекция = отказ парсинга); держатель события returned читается из tx-снапшота | closed |
| T-10-05 | Information Disclosure | action → BulkFormState | low | mitigate | наружу только русские копи и данные строк; `{ code }`-детали в лысом catch (V7) | closed |
| T-10-06 | Tampering | SQL через deviceIds | low | accept | drizzle parameterized inArray; сырой SQL не пишется | closed |
| T-10-SC | Tampering | npm installs | high | accept | `git diff` package.json за фазу ПУСТ (verifier-факт); Package Legitimacy Audit: zero | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-10-1 | T-10-06 | drizzle parameterized queries повсеместно — сырой SQL в фазе отсутствует | orchestrator (auto, L1) | 2026-09-18 |
| AR-10-2 | T-10-SC | Ноль установок пакетов; git diff package.json пуст (проверено verifier'ом по всей цепочке коммитов фазы) | orchestrator (auto, L1) | 2026-09-18 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-18 | 7 | 7 | 0 | orchestrator (ASVS L1 short-circuit: register plan-time; митигации верифицированы verifier'ом построчно — whitelists L180–209, requireSession L696+, guard-UPDATE L373–494, пустой package.json diff) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-18
