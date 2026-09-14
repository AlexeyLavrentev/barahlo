---
phase: 03
slug: device-registry
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-09-02
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Server Action POST ↔ приложение | devices actions минуют proxy — requireSession() первой строкой | мутации устройств |
| payload ↔ SQL | typeKey-зависимый zod-whitelist (strictObject — чужие ключи отбрасываются) | модель/серийник/инвентарник/пер-типовые |
| normalized-номера ↔ UNIQUE | запись normalized в каждой мутации; коллизия = русский copy, не 500 | serialNormalized/inventoryNormalized |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-03-01 | Spoofing/Elevation | devices create/update actions | high | mitigate | requireSession() первой строкой; PUBLIC_PATHS не расширялись (review: «authz perimeter clean») | closed |
| T-03-02 | Tampering | payload → SQL | medium | mitigate | zod-strictObject whitelist по typeFields(typeKey); статус/держатель/typeKey(edit) не читаются (grep-гейты + тесты); drizzle-параметризация | closed |
| T-03-03 | Tampering | рендер значений (модель/серийник/notes) | low | mitigate | React-экранирование; truncate CSS-only; без innerHTML | closed |
| T-03-04 | DoS | перебор page/type | low | accept | enum-валидация типа; Number.isInteger+clamp страницы (WR-01, 6ae3541); один пользователь LAN | closed |
| T-03-05 | Repudiation/DoS | удаление данных устройств | low | accept | удаляющего пути нет — греп-гейт = 0 (EMP-03-стиль); списание — фаза 4 | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-09 | T-03-04 | перебор page/type — clamp+enum достаточны для одного пользователя в LAN | План 03-01 (accept) | 2026-09-01 |
| AR-10 | T-03-05 | нет удаляющего пути; списание через статус в фазе 4 | План 03-02 (accept) | 2026-09-01 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-02 | 5 (дедуп по 2 планам) | 5 | 0 | orchestrator (L1 grep-depth, ASVS 1; подтверждения: gsd-code-reviewer 0 Critical — authz/zod/parameterized/no-delete verified, gsd-verifier 11/14 + все греп-гейты воспроизведены, UAT 4/4, WR-01/02/03 fixed 6ae3541/e577e40/838199d) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-02
