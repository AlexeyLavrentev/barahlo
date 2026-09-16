---
phase: 7
slug: live
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-09-16
---

# Phase 7 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| browser → RSC | q и page crosses via the URL and is re-validated server-side before touching SQL (parseEmployeesSearchParams: trim + cap 100 + enum fallback; page integer guard + clamp) | user-controlled search text |
| RSC → Database | q becomes a LIKE pattern; the pattern remains a drizzle bind parameter, never SQL text; wildcards escaped with `escape '\\'` | query predicate |
| RSC → Browser | empty-state copy and link hrefs render user-influenced q back into the page | reflected text / hrefs |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-07-01 | Tampering | employeeSearchPredicate / listEmployees | high | mitigate | drizzle bind parameter (T-05-01 class); no SQL concatenation; LIKE wildcards `%_\` escaped with `escape '\\'` — «%» stays literal. Verified by 07-REVIEW (no injection findings) + wildcard-escape tests in tests/employee-search.test.ts | closed |
| T-07-02 | DoS | Abusive long/multi-token q | low | mitigate | input maxLength 100 (UAT scenario 9: cap enforced) + server trim/100-char cap (query-params.ts) + 20-token ceiling in predicate; LIKE scan over 50–200 employees is milliseconds | closed |
| T-07-03 | Tampering (supply chain) | package installs | low | accept | zero new npm packages this phase (lockfile untouched; code review IN-scope confirmed "no new runtime deps") | closed |
| T-07-04 | Tampering / DoS | /employees searchParams parsing | medium | mitigate | server-side validation only: hostile q/page/filter degrade to safe sentinels, never a 500 (V5 Input Validation). Verifier re-verified hostile-URL degradation at HEAD | closed |
| T-07-05 | Tampering (XSS/href injection) | Empty-state copy, link hrefs | low | mitigate | links built exclusively by buildEmployeesQuery (URLSearchParams API); static Russian copy; React escapes interpolated text — q never rendered as raw HTML. Code review: clean | closed |
| T-07-06 | Spoofing / Elevation of Privilege | /employees page authorization | high | mitigate | `await requireSession()` remains the first action before any data access (V4 Access Control); asserted in 07-01 acceptance + unauthenticated /employees → 307 /login (executor probe) | closed |
| T-07-07 | Tampering (regression) | Device live search after hook refactor | medium | mitigate | structural guarantee (lib/normalize.mjs + db/index.ts byte-untouched — verifier re-verified git-clean) + untouched green device suites + UAT scenario 2 (G-5-1/G-5-2 class re-run on devices, PASS post G-7-1 fix) | closed |
| T-07-08 | Information Disclosure | /employees search surface | low | accept | no new unauthenticated surface: requireSession-first preserved; search reads only the employees registry behind the session | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| T-07-03 | T-07-03 | Zero new packages this phase — the supply-chain surface does not grow; lockfile diff empty | operator (auto-verified) | 2026-09-16 |
| T-07-08 | T-07-08 | Search reads the employees registry behind the existing session guard; no new disclosure surface | operator (auto-verified) | 2026-09-16 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-16 | 8 | 8 | 0 | orchestrator (ASVS L1 short-circuit: threats_open 0, register authored at plan time; mitigations cross-checked against 07-REVIEW.md findings and 07-VERIFICATION.md re-runs) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-16
