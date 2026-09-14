---
phase: 5
slug: search-filters
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-09-14
---

# Phase 5 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Браузер → /devices URL params | searchParams (q, type, status, department, warranty, ram, page) полностью клиентски управляемы | untrusted text → server parse (query-params.ts) → bound SQL params |
| Браузер → /api/devices/export | GET с теми же параметрами, ответ — файл выгрузки | untrusted params + DB content → CSV (formula-injection guard) |
| CSV → Excel/Numbers | открывается как таблица; ячейки могут интерпретироваться как формулы | DB strings → RFC-4180 cells (esc() tab-prefix, CWE-1236) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-05-01 | Tampering (SQL через q) | db/queries/devices.ts deviceWhere | high | mitigate | параметризованный LIKE: pattern из свёрнутого q, `escape '\'` на трёх LIKE, только column refs интерполируются | closed |
| T-05-02 | DoS (LIKE wildcards) | query-params.ts + deviceWhere | medium | mitigate | серверный cap 100, экранирование `\ % _`, escape на всех LIKE | closed |
| T-05-03 | Tampering (reflected XSS через q) | search-box.tsx, page.tsx | low | accept | React text-узлы, ноль dangerouslySetInnerHTML — см. Accepted Risks | closed |
| T-05-04 | Tampering (filter params → SQL) | query-params.ts | high | mitigate | keystone-гварды isDeviceTypeKey/isDeviceStatusKey, WARRANTY_VALUES, zod для department; все значения — drizzle params | closed |
| T-05-05 | DoS / info leakage (невалидные params) | query-params.ts, export route | medium | mitigate | деградация к «all»-сентинелам, ни одного throw, никогда 500 | closed |
| T-05-06 | Elevation (доверие клиенту, RAM-чип) | db/queries/devices.ts ramPredicate | low | accept | серверный предикат сам ограничен type=laptop — враждебный `?type=monitor&ram=1` инертен | closed |
| T-05-07[03] | Tampering (stored XSS в новых span) | lib/warranty-date.tsx | low | accept | только React text + Intl-даты — см. Accepted Risks | closed |
| T-05-08[03] | Repudiation (расхождение фильтра и цвета) | lib/warranty.ts | medium | mitigate | единый WARRANTY_WARN_DAYS=60 + warrantyState; фильтр и цвет импортируют один модуль | closed |
| T-05-09 | Information Disclosure (неавторизованный экспорт) | app/api/devices/export/route.ts | high | mitigate | requireSession() первым стейтментом + default-deny proxy покрывает api/* | closed |
| T-05-10 | Tampering (CSV formula injection, CWE-1236) | lib/csv.ts esc() | high | mitigate | tab-prefix `/^[=+\-@\t\r]/` на каждой ячейке (заголовок и строки) через buildCsv; негативная матрица 26 тестов | closed |
| T-05-11 | Tampering (MIME confusion) | lib/csv.ts csvResponseHeaders | low | mitigate | захардкоженный Content-Type, nosniff, no-store, RFC 5987 filename | closed |
| T-05-12 | Tampering (SQL через export params) | export route → deviceWhere | high | mitigate | тот же parseDevicesSearchParams + toDeviceListFilters + общий deviceWhere — один предикат, два вызывающего | closed |
| T-05-13 | DoS (self-inflicted, perf-тест) | tests/devices-perf.test.ts | low | accept | test-fixture-only — см. Accepted Risks | closed |
| T-05-14 | Tampering (seed в проде) | scripts/seed.mjs | high | mitigate | Guard 1 NODE_ENV=production→exit(1), Guard 2 непустая БД→exit(1) | closed |
| T-05-07[06] | Tampering (q parse после 05-06) | app/(app)/devices/search-box.tsx | low | accept | 74eb0d9 трогает только клиентский остров; query-params.ts не менялся — см. Accepted Risks | closed |
| T-05-08[06] | DoS (навигационный ритм search-box) | search-box.tsx reconciliation | low | accept | absorption+adoption терминируются, debounce единственный, пуш-лупа нет — см. Accepted Risks | closed |
| T-05-SC | Tampering (supply chain) | package.json | low | accept | ноль новых CSV/serialization-зависимостей; хенд-ролл escaper (протестирован мутационно) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-1 | T-05-03 | q эхоится только как React text/value инпута; dangerouslySetInnerHTML отсутствует во всём app/ | gsd-security-auditor (plan-time disposition, verified) | 2026-09-14 |
| AR-2 | T-05-06 | Серверный предикат самодостаточен: type=laptop AND (ram IS NULL OR !=1) независимо от URL | gsd-security-auditor (plan-time disposition, verified) | 2026-09-14 |
| AR-3 | T-05-07[03] | WarrantyDate рендерит только React text + Intl-форматирование дат | gsd-security-auditor (plan-time disposition, verified) | 2026-09-14 |
| AR-4 | T-05-13 | Perf-тест — fixture-only, потолок щедрый, в рантайме недостижим | gsd-security-auditor (plan-time disposition, verified) | 2026-09-14 |
| AR-5 | T-05-07[06] | G-5-1 фикс не менял парсер/роуты — поверхность клиентского стейт-острова | gsd-security-auditor (new-surface check 05-06) | 2026-09-14 |
| AR-6 | T-05-08[06] | Reconciliation-ветки терминируют; риск навигационного лупа перекрыт absorption | gsd-security-auditor (new-surface check 05-06) | 2026-09-14 |
| AR-7 | T-05-SC | CSV-писатель хенд-ролл (26 тестов + мутационная проба), новые зависимости не вводились | gsd-security-auditor (plan-time disposition, verified) | 2026-09-14 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-14 | 17 (unique; 22 строки в 6 планах, T-05-SC ×6 задедуплицированы) | 17 | 0 | gsd-security-auditor, ASVS L1 |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-14
