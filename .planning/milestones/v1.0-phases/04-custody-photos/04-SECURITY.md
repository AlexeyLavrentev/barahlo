---
phase: 04
slug: custody-photos
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-09-04
---

# Phase 04 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Server Action POST ↔ custody actions | движения минуют proxy — requireSession() первой строкой | перевод/приём/ремонт/списание |
| payload ↔ переходы статусов | guard-UPDATE с precondition в WHERE (.changes решает) | status/currentEmployeeId ТОЛЬКО из БД-строки |
| movements ↔ история | append-only триггеры RAISE(ABORT) | события не редактируются |
| Бинарный POST ↔ photo routes | multipart: размер/магия/кап | фото устройств |
| GET/DELETE ↔ файловая система | containment под UPLOADS_DIR, IDOR-пара attachmentId+device |jpeg-файлы |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-04-01 | Spoofing/Elevation | custody + photo actions/routes | high | mitigate | requireSession() первой строкой каждого действия и route handler'а (review: verified) | closed |
| T-04-02 | Tampering | payload → переходы статусов | high | mitigate | guard-UPDATE precondition в tx; статус/держатель только из БД-строки; тесты на 7 переходов из disposed | closed |
| T-04-03 | Repudiation | подделка истории | high | mitigate | append-only триггеры RAISE(ABORT) + тест; компенсация только новым событием | closed |
| T-04-08 | Tampering/Info Disclosure | upload/serve photo routes | high | mitigate | magic-byte gate (sharp metadata); ≤10MB raw; IDOR-пара; containment; Cache-Control private; EXIF/GPS strip | closed |
| T-04-09 | Tampering | storageKey пути | medium | mitigate | ключ генерит сервер (uuid+thumb-суффикс); клиент не влияет; assertInsideUploads | closed |
| T-04-11 | Elevation | мутации disposed | medium | mitigate | DISPOSED guard в queries и роутах (upload/delete/все переходы) — smoke-ассерты | closed |
| T-04-04 | DoS | return-all / бинарный флуд | low | accept | одна tx на десятки строк; caps 10MB/8шт; LAN, один пользователь | closed |
| T-04-05 | DoS | перебор дат/сотрудников | low | accept | zod + enum; произошедшее-не-в-будущем | closed |
| T-04-06 | Repudiation | возврат из списания | low | accept | финальность E-03 (юзер-решение), греп-гейт | closed |
| T-04-07 | DoS | — | low | accept | LAN | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-11 | T-04-04 | return-all одна tx на десятки строк — масштаб ОК | План 04-01 (accept) | 2026-09-02 |
| AR-12 | T-04-05/07 | перебор входов — clamp/enum/LAN | План 04-01/02 (accept) | 2026-09-02 |
| AR-13 | T-04-10 | бинарный флуд ограничен caps | План 04-03 (accept) | 2026-09-02 |
| AR-14 | T-04-06 | списание финально (юзер-решение в DISCUSSION) | Владелец | 2026-09-02 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-04 | 10 (дедуп по 3 планам) | 10 | 0 | orchestrator (L1, ASVS 1; подтверждения: gsd-code-reviewer «adversarially verified clean» по гвардам/tx/append-only/IDOR/magic-byte/caps/containment; gsd-verifier: все 8 prohibition wired, smoke-матрица; UAT 5/5) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-04
