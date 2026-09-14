---
phase: 6
slug: dashboard
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-09-14
---

# Phase 6 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Браузер → `/` | дашборд — read-only RSC за requireSession + default-deny proxy | только чтение: агрегаты, лента, deep-link hrefs |
| Дашборд → /devices, карточки | все hrefs через buildDevicesQuery (URLSearchParams) или шаблоны над целочисленными PK из БД | никаких пользовательских строк в разметке/URL |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-06-01 | Information Disclosure (`/` без сессии) | app/(app)/page.tsx, proxy.ts | high | mitigate | Слой 1: proxy matcher покрывает `/`, PUBLIC_PATHS=['/login'] exact → redirect; Слой 2: requireSession() первый стейтмент; smoke-dashboard: 307 → /login | closed |
| T-06-02 | Tampering (XSS: лента/тайлы/топ-5) | page.tsx | medium | mitigate | ноль dangerouslySetInnerHTML; hrefs только через buildDevicesQuery или шаблоны над int-PK; текст — React-children/title (авто-escape) | closed |
| T-06-03 | Tampering (query params на `/`) | page.tsx | low | accept | дашборд не принимает props/searchParams — поверхность пуста; см. Accepted Risks | closed |
| T-06-04 | Information Disclosure (IDOR-пробы ссылок ленты/топ-5) | карточки, listRecentMovements, nearestExpiringWarranties | low | accept | карточки требуют сессию + zod + notFound; поля ленты/топ-5 ⊆ полей авторизованных списков — паритет экспозиции; см. Accepted Risks | closed |
| T-06-SC | Tampering (npm supply chain) | package.json | — | n/a | diff package.json/lock за фазу пуст — ноль новых пакетов | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-1 | T-06-03 | DashboardPage без props/searchParams — нечего подделывать; read-only страница-сводка | gsd-security-auditor (plan-time disposition, code-fact verified) | 2026-09-14 |
| AR-2 | T-06-04 | IDOR-пробы упираются в защищённые карточки (requireSession+zod+notFound); экспозиция полей ленты/топ-5 ⊆ авторизованных списков (listRecentMovements даже отбрасывает comment против listTimeline) | gsd-security-auditor (plan-time disposition, code-fact verified) | 2026-09-14 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-14 | 5 | 5 | 0 (2 open-ниже-порога задокументированы как accepted) | gsd-security-auditor, ASVS L1 |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-14
