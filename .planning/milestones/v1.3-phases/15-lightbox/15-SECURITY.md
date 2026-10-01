---
phase: 15
slug: lightbox
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-10-01
---

# Phase 15 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| photo-grid DOM → зум-стейдж | Клиентские события (wheel/pointer/key) читаются компонентом; внешних данных и новых входов фаза не вводит | клиентские события, без сети/хранилища |
| existing attachment route → `<img src>` | URL full/thumb строится из числовых id через существующий авторизованный роут (`?device=&variant=`); периметр не менялся (D-05, нулевой diff app/api за фазу) | бинарные фото за session-cookie |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-15-01 | Tampering | canMutate-гейт кнопки «Удалить фото» | low | accept | Клиентский гейт — UX, не граница доверия; серверный DELETE-роут перепроверяет disposed/cap (assertDeviceAcceptsPhotos, D-06) — не тронут | closed |
| T-15-02 | Tampering | fileName/alt/счётчик/aria-label в DOM лайтбокса | low | mitigate | React экранирует текстовые узлы; копии — шаблонные литералы из чисел; `dangerouslySetInnerHTML` в photo-grid.tsx / zoom-stage.tsx отсутствует (grep, 2026-10-01) | closed |
| T-15-03 | Information Disclosure | `<img src>` full/thumb | low | accept | URL из числовых id через существующий роут — периметр 307/404 не менялся (верификатор: нулевой diff app/api через диапазон фазы) | closed |
| T-15-04 | Elevation of Privilege | жестовое состояние стейджа | low | accept | Жесты не читают сеть/хранилище и не влияют на авторизацию; максимум последствий — визуальное состояние одной панели | closed |
| T-15-SC | Tampering | npm/pip/cargo installs (supply chain) | high | mitigate | D-04: ноль новых зависимостей; acceptance-гейт `git diff c7db4bb..HEAD -- package.json package-lock.json` пуст (проверено исполнителями, ревьюером и верификатором 2026-10-01); Package Legitimacy Gate не применим — список устанавливаемого пуст | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-15-01 | T-15-01 | canMutate — клиентская UX-отрисовка; серверный DELETE перепроверяет disposed/cap независимо | план 15-01/15-02 (plan-time), оператор — sign-off UAT 2026-10-01 | 2026-10-01 |
| AR-15-02 | T-15-03 | Выдача фото осталась на авторизованном роуте фазы 4; расширений периметра фаза не делала | план 15-01 (plan-time), оператор — sign-off UAT 2026-10-01 | 2026-10-01 |
| AR-15-03 | T-15-04 | Жестовое состояние не пересекает границ доверия | план 15-02 (plan-time), оператор — sign-off UAT 2026-10-01 | 2026-10-01 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-01 | 5 | 5 | 0 | orchestrator (short-circuit: register@plan-time, ASVS L1, grep-свидетельства + верификатор) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-01
