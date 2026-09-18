---
phase: 11
slug: k
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-09-18
---

# Phase 11 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → /api/search | q — единственный недоверенный вход; ищет по всей БД сессии | q ≤ 100 символов |
| /api/search → клиент | JSON-результаты рендерятся как текст; поиск требует сессию | JSON групп ≤ 6+6 |
| браузер → хоткей | глобальный keydown перехватывается на window | event.code + модификаторы |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-11-01 | Information Disclosure | app/api/search/route.ts | high | mitigate | `requireSession()` первый statement (route.ts:28-35, прецедент export/attachments); proxy default-deny api/* — слой 1; без сессии 307 /login, данных нет; live-зонд UAT подтвердил 307 | closed |
| T-11-02 | Tampering (SQLi/LIKE) | q → predicates | high | mitigate | Предикаты фаз 5/7 переиспользованы как есть: drizzle-биндинг + `escape '\'` + экранирование wildcards; роут только trim+cap 100 (route.ts:28-35), SQL-текст не трогает (V5) | closed |
| T-11-03 | Information Disclosure (UX) | island fetch | low | mitigate | Истёкшая сессия: 307→/login HTML ловится content-type-гвардом до res.json() (command-palette.tsx:92-98) — пустой результат, не падение | closed |
| T-11-04 | Tampering (UX) | window keydown | low | mitigate | Один листенер; preventDefault только на совпавшей комбинации; toggle-ветка первая, проба чужого диалога с self-exclusion (:214-224) | closed |
| T-11-05 | Tampering (race) | abortable fetch | low | mitigate | AbortController на каждый ввод и закрытие; глотается только AbortError — last-response-wins инверсия невозможна | closed |
| T-11-SC | Tampering (supply chain) | npm installs | high | mitigate→accept | Ноль новых пакетов: `git diff` package.json пуст (verifier-факт по всей цепочке 9e51571..6c7036f); палитра — композиция установленных Base UI примитивов | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-11-1 | T-11-SC | Ноль установок пакетов (cmdk/Radix запрещены REQUIREMENTS); composition over download | orchestrator (auto, L1) | 2026-09-18 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-18 | 6 | 6 | 0 | orchestrator (ASVS L1 short-circuit: register plan-time; митигации верифицированы verifier'ом построчно — route.ts:28-35, command-palette.tsx:92-98/214-224, пустой package.json diff; live-зонд 307 из UAT) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-18
