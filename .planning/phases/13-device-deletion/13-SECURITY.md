---
phase: 13
slug: device-deletion
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-09-29
---

# Phase 13 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| FormData → deleteDeviceAction → query layer | Действие напрямую POST-абельно; deviceId из скрытого input — untrusted | deviceId |
| attachments.storage_key → диск | Ключ из БД превращается в путь ФС при unlink; испорченный ключ не должен выйти за uploads-корень | file paths |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-13-01 | Spoofing | Сессия при прямом POST | high | mitigate | requireSession первой строкой deleteDeviceAction; source-gate тест прикрепляет | closed |
| T-13-02 | Tampering | Повторное удаление / чужой id | medium | mitigate | Единственный guard `.changes===0 → DEVICE_GONE`; throw в tx = полный откат; тесты double-delete + unknown id | closed |
| T-13-03 | Tampering/Elevation | unlink путей из storage_key | high | mitigate | Ключи только из БД-снапшота (никогда из входа); resolveUploadPath/assertInsideUploads кидает PATH_ESCAPE, глотается как ENOENT; unlink строго после COMMIT (D-04) | closed |
| T-13-05 | Tampering | Гонка двух вкладок | medium | mitigate | Тот же .changes-guard: вторая попытка — DEVICE_GONE; верифицировано в браузере (две вкладки, alert в открытом диалоге) | closed |
| T-13-07 | Tampering | Частичный каскад (осиротевшие строки) | medium | mitigate | Все три DELETE в одном db.transaction; тест «ноль сирот» raw-SQL счётчиками | closed |
| T-13-SC | Tampering | npm-установки | n/a | accept | Ноль новых пакетов (13-RESEARCH Package Legitimacy Audit: not applicable) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| T-13-SC | — | Фаза не устанавливает пакетов | — | 2026-09-29 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-29 | 6 | 6 | 0 | orchestrator (L1 short-circuit: plan-time register, митигации доказаны source-gates + verifier 17/17 + UAT 9/9 sign-off + браузерные истины гонки/overflow) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-29
