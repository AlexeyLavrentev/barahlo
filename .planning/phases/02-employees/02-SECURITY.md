---
phase: 02
slug: employees
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-09-02
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Server Action POST ↔ приложение | действия минуют proxy-периметр — requireSession() обязателен первой строкой | мутации сотрудников/отделов |
| URL-параметры ↔ SQL | /employees/[id], filter, page → валидация до any-SQL | id/page/filter |
| Пользовательский ввод ↔ рендер | имена/отделы в строках, диалогах, подтверждениях | текстовые ноды (React-экранирование) |
| npm-установки ↔ репо | shadcn/lucide-react/@base-ui/react | блокирующий human-чекпоинт пройден владельцем 2026-09-01 |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-02-01 | Spoofing/Elevation | все employees actions | high | mitigate | requireSession() первой строкой каждого действия; PUBLIC_PATHS не расширялись | closed |
| T-02-SC | Tampering | npm: shadcn/lucide-react/@base-ui/react | high | mitigate | blocking-human чекпоинт (approved 2026-09-01); ловушки base-ui-react/@base-ui-components задокументированы; компоненты в репо, не runtime | closed |
| T-02-02 | Tampering | SQL (filter/page/сортировка) | medium | mitigate | drizzle-параметризация; filter — enum, page — Number+clamp | closed |
| T-02-07 | Tampering | /employees/[id] ID-параметр | medium | mitigate | z.coerce.number().int().positive() до SQL; мусор → notFound() | closed |
| T-02-03 | Tampering | рендер имён/отделов | low | mitigate | React-экранирование; innerHTML запрещён | closed |
| T-02-04 | Tampering | FormData в .set() | low | mitigate | zod-whitelist {name, departmentName} / {id} / {id, archived} | closed |
| T-02-09 | Info Disclosure | error.tsx | low | mitigate | договорная строка в UI; детали только в console.error | closed |
| T-02-05 | Spoofing | CSRF на action-POST | low | accept | same-origin Next + cookie sameSite=lax + single-user LAN | closed |
| T-02-06 | DoS/Repudiation | потеря данных сотрудника | low | accept | удаляющего пути нет (EMP-03, FK restrict) | closed |
| T-02-08 | DoS | массовая мутация | low | accept | единственная мутация — обратимый isActive-флаг | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-07 | T-02-05 | CSRF: same-origin Server Actions + lax-cookie + один пользователь в LAN | План 02-01 (accept), согласовано с фазой 1 | 2026-08-31 |
| AR-08 | T-02-06/08 | Нет удаляющего пути; мутации только обратимым флагом | План 02-02 (accept) | 2026-08-31 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-02 | 10 (уникальных, дедуп по 3 планам) | 10 | 0 | orchestrator (L1 grep-depth, ASVS 1; подтверждения: gsd-code-reviewer 0 Critical («requireSession first in every action», zod whitelist, parameterized Drizzle, no delete path), gsd-verifier 12/14, UAT 4/4) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-02
