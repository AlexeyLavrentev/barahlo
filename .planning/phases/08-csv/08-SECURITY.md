---
phase: 8
slug: csv
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-09-16
---

# Phase 8 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| operator browser → /api/devices/export | untrusted query params + session cookie; фильтры проходят через существующий сентинел-парсер | query params (untrusted), session cookie |
| CSV file → Excel/Numbers | собранный файл — поверхность исполнения формул; новые колонки (вкл. свободный текст panelType) расширяют её | 20-колоночный CSV, BOM + «;» + CRLF |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-08-01 | Tampering/Elevation | новые текстовые ячейки (panelType — свободный текст) | high | mitigate | Единственный путь сборки `buildCsv(deviceCsvHeader(), cells)` (lib/device-csv.ts:150) — все 20 ячеек и заголовок проходят esc() TAB-гвард (CWE-1236); bypass-путей нет (grep: raw join/replaceAll — чисто); тест-пин `['=1+1', '\t=1+1']` + инъекционные фикстуры (model `=1+1;@cmd`, panelType `=1+1`) | closed |
| T-08-02 | Information Disclosure | exportDevices через /api/devices/export | high | mitigate | `await requireSession()` — литерально первое действие GET-хендлера (route.ts, source assertion в тестах); `Cache-Control: no-store` из csvResponseHeaders (lib/csv.ts:61); zero-drift контракт парсер→deviceWhere не тронут | closed |
| T-08-03 | Tampering | parseDevicesSearchParams (query-параметры) | low | accept | Существующий парсер деградирует мусор в неактивные сентинелы (T-03-04, фаза 5); фаза его не трогает | closed |
| T-08-SC | Tampering | npm-установки | low | accept | Ноль установок в фазе (REQUIREMENTS §Out of Scope); no-CSV-dependency тест охраняет поверхность | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-08-1 | T-08-03 | Парсер фильтров фазы 5 деградирует невалидные значения в неактивные сентинелы (T-03-04 discipline); фаза 8 его не меняла — поверхность не расширялась | orchestrator (auto, L1) | 2026-09-16 |
| AR-08-2 | T-08-SC | Ноль новых npm-зависимостей; требование REQUIREMENTS §Out of Scope, охраняется тестом | orchestrator (auto, L1) | 2026-09-16 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-16 | 4 | 4 | 0 | orchestrator (ASVS L1 short-circuit: register authored at plan time, grep-depth verification, прецедент фазы 7) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-16
