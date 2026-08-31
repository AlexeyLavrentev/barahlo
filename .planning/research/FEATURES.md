# Feature Research

**Domain:** Internal IT asset tracking — equipment inventory web app for a single manager (50–200 employees, hundreds of devices)
**Researched:** 2026-08-31
**Confidence:** MEDIUM

> Confidence rationale: competitor feature data is anchored on Snipe-IT's official product page and docs (fetched directly, primary source) and corroborated by independent secondary sources (GetApp, BlueTally, Cheqroom, r/sysadmin). No hands-on product trials were done. Per the source-seam, raw web-search claims are LOW confidence; every load-bearing claim below is corroborated across at least two independent sources or comes from a vendor's own page.

## Feature Landscape

### Table Stakes (Users Expect These)

Features any asset-tracking product has; missing one makes the tool feel worse than the spreadsheet it replaces.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Asset registry with per-type field sets | Every product in the category (Snipe-IT, Reftab, AssetTiger, Timly) is built around a centralized registry as the single source of truth; a laptop needs RAM/SSD/serial fields a monitor does not | MEDIUM | Fixed schema per type (ноутбук / монитор / док-станция / периферия) as already decided in PROJECT.md — no field constructor. Type determines which fields exist and which are filterable |
| Search by serial / inventory number | The #1 stated scenario («где серийник ABC123»); universal in the category | LOW | Substring, case-insensitive, as-you-type across serial + inventory number + model name; indexed columns; hundreds of rows is trivial |
| Assignment / return with automatic custody tracking | "Assets retain full history including checkouts, checkins" is Snipe-IT's headline; «у кого что» is the category's reason to exist | LOW–MEDIUM | For a solo manager this collapses to assign / reassign / return — no request/approval ceremony, no EULA acceptance. Every action writes an event row |
| Movement history timeline per asset | "Who had it and when" is cited across verticals as the accountability core (disputes, audits, offboarding) | LOW | Cheap if event-sourced from day one; effectively impossible to retrofit if only the current holder is stored — the events table must exist before the first assignment ships |
| Employee card (name + department) with issued-asset list | Every competitor links users to their assets; offboarding («что собрать с уходящего сотрудника») is a top real-world query | LOW | Employees are lightweight records, not logins; department enables grouping and filtered views |
| Statuses: in use / in stock / repair / retired | Category-standard (Snipe-IT: deployed / ready to deploy / pending / archived) | LOW | Retired items must remain in the database (history integrity) — archive, never delete |
| Purchase + warranty fields with expiry highlighting | Warranty-expiration alerts/tracking is a standard ITAM feature (BlueTally, Asset Panda, Timly reminders); PROJECT.md requires «гарантия истекает» highlighting | LOW | Store purchase date, supplier, cost, warranty-until; compute green/amber/red expiry state at render time — no notification infrastructure needed |
| Field filters («ноуты без апгрейда RAM», «гарантия < 60 дней») | This IS the core pain scenario; in generic tools it degenerates into a report-builder exercise | MEDIUM | Typed per-type fields make this a simple filter UI (field + operator + value). Design note: «без апгрейда RAM» needs a reliable signal — either an explicit boolean "RAM upgraded" or current RAM vs. base-RAM field; a boolean set by the manager is simplest and unambiguous |
| Dashboard summary | Competitor dashboards show counts by status/category plus recent activity at a glance | LOW–MEDIUM | Units by type and status, warranty-expiring count, recent movements; every tile links into a filtered list |
| Fast lists at hundreds of records | Stated constraint («списки должны летать»); a modern baseline | LOW | Server-side pagination + indexed serial/inventory columns |
| Single-account login | Any internal web app needs a gate; stated requirement | LOW | One user, one password hash, session cookie |

### Differentiators (Competitive Advantage)

Features that set the tool above "generic asset register" — all aligned with the Core Value: instant precise answer.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Saved smart filters / views | Turns the killer query («ноуты без апгрейда RAM») into a one-click bookmark; competitors bury this in report builders | LOW–MEDIUM | Persist named filter state; ship with 2–3 sensible presets. Natural evolution of the filters feature |
| Global command search (одна строка — всё) | Serial, inventory no., employee, model — one Apple-style ⌘K box answering in seconds; reinforces the Apple-aesthetic goal | LOW–MEDIUM | Single endpoint searching assets + employees; keyboard-first, best-in-class feel for one power user |
| Clone asset / bulk create | Buying 20 identical monitors: create one card, clone 19. Real manager pain that competitors solve with CSV import (rejected here) | LOW | "Duplicate" button pre-filling the create form |
| Per-employee printable handover act (акт приёма-передачи) | Russian office reality when issuing equipment; no mainstream competitor does this for the RU context | LOW–MEDIUM | Generate a printable page/PDF from the assignment record; covers the formal side without any workflow machinery |
| Warranty expiry watchlist | Front-page list «истекает в ближайшие 60 дней» directly drives purchase decisions (warranty service vs. replacement) | LOW | Just a canned filter surfaced on the dashboard |
| Asset photos | Distinguishing 15 visually identical monitors; Reftab, AssetTiger, Shelf all support images | LOW–MEDIUM | A few photos per card + thumbnail in lists; local file storage on the internal server, no external CDN |
| QR labels → asset page | Scanning a sticker on the device opens its card on the intranet; Snipe-IT proves the pattern (QR encodes the asset URL, works from any phone) | MEDIUM | Printable PDF sheet of QR labels per asset; requires stable per-asset routes. v1.x — a solo manager rarely confuses which laptop is which; becomes valuable at scale or with annual inventory checks |
| Bulk actions on list selection | Assign or update 10 docks at once after a multi-unit purchase | MEDIUM | Selection checkboxes + «выдать сотруднику…» action; only worth building if multi-item purchases are frequent |

### Anti-Features (Commonly Requested, Deliberately NOT Built)

Competitors have all of these; for a single-manager internal deployment they are pure cost.

| Feature | Why Requested / Why Competitors Have It | Why Problematic Here | Alternative |
|---------|------------------------------------------|----------------------|-------------|
| Custom field constructor | Snipe-IT's fieldsets, Reftab's custom fields — their flexibility sells to diverse customers | Schema-in-DB complexity, weak typing kills reliable filters («RAM = 8GB»), config UI burden on one user | Fixed field set per type, changed in code when types evolve (already a Key Decision) |
| Roles / permissions / LDAP / SSO / multi-user | Table stakes for per-seat SaaS | Exactly one operator; no second party to authorize | Single login + password (decided) |
| Employee self-service (portal, asset requests, EULA/signatures on checkout) | Snipe-IT requestable assets + acceptance signatures | Employees never log in; an approval workflow has no second participant | Manager records the assignment; printable handover act covers the formal side |
| Software / license / contract tracking (full ITAM suite) | Snipe-IT and Reftab track licenses, seats, contracts | Doubles the domain model; explicitly out of scope — this registry is about hardware | Hardware-only registry |
| Network discovery agents / auto-inventory | GLPI/Lansweeper-style headline feature for large estates | Heavy server-side infra, agent deployment, and false confidence: the manager buys and hands out every device personally, so the registry is accurate by construction | Manual registry maintained by the one person who touches every unit |
| Depreciation / accounting module | AssetTiger and enterprise ITAM advertise it; бухгалтерия may eventually ask | Finance-system territory with jurisdiction-specific rules; massive scope creep | Store cost + purchase date; accounting lives in accounting software |
| Procurement pipeline («заказано → в пути → получено») | Timly and co. track purchase orders | Explicitly out of scope; pollutes the status taxonomy with process states | Record the fact of purchase (date, supplier, cost) on the card |
| Email / notification engine | Competitors send warranty and check-in emails | SMTP infrastructure + preference UI to serve one user who opens the app anyway | On-screen expiry highlighting + dashboard badges — state, not push |
| Reservations / booking calendar | Cheqroom, Reftab differentiate on this | No competing borrowers in a one-manager shop | Not needed |
| CSV import | Standard migration path in every competitor | Dead feature from day one — user explicitly starts clean (Key Decision) | — |
| Native mobile app | Snipe-IT/Reftab offer apps | One user, office LAN; app-store friction is absurd for this deployment | Responsive web; phone-camera QR covers the mobile case |
| 1D barcode / handheld-scanner hardware support | Snipe-IT supports C39 + handheld scanners | Extra hardware for zero gain at this scale | QR via phone camera, or plain search |

## Feature Dependencies

```
[Types with fixed field sets]
    └──requires──> [Asset registry]
                       ├──requires──> [Assignment (writes event)]
                       │                  └──requires──> [Movement history timeline]
                       ├──requires──> [Field filters]
                       │                  └──enhances──> [Saved smart filters] ──enhances──> [Dashboard watchlist]
                       └──requires──> [Search over serial/inventory]
[Employees] ──requires──> [Assignment links] ──> [Employee card w/ issued assets] ──> [Printable handover act]
[Warranty/purchase fields] ──requires──> [Expiry highlighting] ──> [Dashboard watchlist]
[Stable asset URLs/IDs] ──requires──> [QR label sheet export]
[List view w/ pagination] ──requires──> [Bulk actions]
[Asset form] ──requires──> [Clone asset]
[Registry + statuses + events] ──(read-only)──> [Dashboard]
```

### Dependency Notes

- **Movement history requires event-sourcing from the first assignment:** the classic asset-tracker rewrite is "we stored only the current holder, now we need history." The append-only events table must ship in the same phase as assignment.
- **Filters require typed per-type fields:** without typed fields, "RAM without upgrade" and "warranty < 60 days" degrade to free-text guessing. Types before filters, filters before saved views.
- **Dashboard is a pure read model** over registry + statuses + events: build last, cheap, and it inherits correctness from the core.
- **QR labels need stable per-asset routes** plus a PDF-render step; trivial data-wise but keep out of the core phase.
- **Saved filters / global search / watchlist are enhancements** — none blocks anything else; order by user feedback after v1.

## MVP Definition

### Launch With (v1)

Research confirms the PROJECT.md Active list maps almost exactly onto the category's table stakes — no scope additions needed, only prioritization:

- [ ] Registry with 4 types (ноутбук / монитор / док-станция / периферия), fixed per-type fields
- [ ] Asset card: model, serial, inventory no., RAM, SSD, type fields, photos, cost, purchase date/supplier, warranty-until, free notes
- [ ] Assign / reassign / return with automatically logged movement history timeline
- [ ] Employee cards (name + department) with list of issued assets
- [ ] Instant search by serial / inventory number / model
- [ ] Field filters, including «без апгрейда RAM» (needs the RAM-upgrade signal decided up front) and warranty windows
- [ ] Statuses: используется / на складе / в ремонте / списано
- [ ] Dashboard: counts by type/status, warranty-expiring highlight, recent movements
- [ ] Single-account login
- [ ] Russian UI with Apple-aesthetic design (differentiator in feel, not scope)

### Add After Validation (v1.x)

- [ ] Saved smart filters — trigger: user re-enters the same filter twice
- [ ] Global ⌘K search — trigger: asset count grows past ~150 or search starts feeling slow
- [ ] Clone asset / bulk create — trigger: first multi-unit purchase
- [ ] QR label sheet export (PDF) — trigger: manager wants physical stickers or plans an inventory check
- [ ] Bulk actions — trigger: repeated multi-assign sessions
- [ ] Printable handover act — trigger: first formal request from HR/accounting
- [ ] Warranty expiry watchlist as dashboard tile — trivially cheap, add whenever dashboard exists

### Future Consideration (v2+)

- [ ] Audit / spot-check mode (physical inventory verification against the registry) — useful at annual инвентаризация; defer until asked
- [ ] Locations beyond department (rooms/shelves) — only if the office grows physically distributed
- [ ] Consumables tracking (e.g., the RAM upgrade kits themselves before installation) — interesting but out of scope; once installed, the kit becomes a field update on the laptop

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Registry + per-type fields | HIGH | MEDIUM | P1 |
| Search by serial/inventory | HIGH | LOW | P1 |
| Assignment + auto history | HIGH | LOW–MEDIUM | P1 |
| Field filters | HIGH | MEDIUM | P1 |
| Employee cards + issued assets | HIGH | LOW | P1 |
| Statuses | MED–HIGH | LOW | P1 |
| Purchase/warranty + expiry highlighting | HIGH | LOW | P1 |
| Dashboard summary | MEDIUM | LOW–MEDIUM | P1 |
| Login (single account) | MEDIUM | LOW | P1 |
| Photos | MEDIUM | LOW–MEDIUM | P1 (in requirements; first thing to cut if v1 slips) |
| Saved smart filters | MED–HIGH | LOW–MEDIUM | P2 |
| Global ⌘K search | MEDIUM | LOW–MEDIUM | P2 |
| Clone / bulk create | MEDIUM | LOW | P2 |
| QR label export | MEDIUM | MEDIUM | P2 |
| Warranty watchlist tile | MEDIUM | LOW | P2 |
| Bulk actions | MEDIUM | MEDIUM | P3 |
| Printable handover act | MEDIUM | LOW–MEDIUM | P3 |
| Audit mode, locations, consumables | LOW–MEDIUM | MEDIUM–HIGH | P3 (v2+) |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Snipe-IT | Reftab | AssetTiger | Timly | Barahlo Approach |
|---------|----------|--------|------------|-------|------------------|
| Custom fields | Fieldsets per model, arbitrary | Custom fields | Custom fields | Configurable | Fixed per-type schema (typed, filterable) |
| Checkout/check-in | One-click + kits + EULA/signature | Yes + reservations | Yes | Yes | Assign/reassign/return, zero ceremony |
| History | Full retained per asset | Yes | Yes | Yes | Append-only events, timeline UI |
| Search/filters/reports | Search + report suite | Filters | Filters | Search | Instant search + typed filters + saved views |
| Labels | QR + C39, bulk print, templates | QR | QR/barcode | QR | PDF sheet of QR links (v1.x) |
| Dashboard | Counts + recent activity | Yes | Yes | "360° overview" | Counts + warranty watchlist + recent movements |
| Warranty alerts | Email alerts | Email | Email | Reminders | On-screen highlighting, no email infra |
| Maintenance | Maintenance log + expected check-in | Yes | Yes | Strong (Wartung focus) | Status «в ремонте» + notes only |
| Depreciation | In product (not advertised) | Limited | Yes | Yes | Skip — accounting's job |
| Users/auth | LDAP/SAML/SCIM, per-seat | Multi-user | Multi-user | Multi-user | Single account |
| Entity types | Assets, licenses, accessories, consumables, components | HW + SW | Assets | Equipment, rooms, employees | Hardware only |
| Scale calibration | Unlimited (self-host) | Free tier | Free ≤ 250 assets — our target size sits right where their paid tiers begin | Per-resource SaaS | Self-hosted on internal server, no per-asset pricing trap |

Key insight: the project's target scale (hundreds of assets, one manager) is exactly where commercial products' free tiers end and paid tiers begin, and where their per-seat and discovery features are dead weight. The competitive position is "Snipe-IT's core (registry + custody + history + labels) without the enterprise scaffolding, in Russian, with an Apple-grade UI and the RAM-upgrade question answerable in one click."

## Sources

- [Snipe-IT official product page](https://snipeitapp.com/product) — primary source, fetched directly (features, statuses, history, labels, reports, entity types)
- [Snipe-IT docs: Asset Labels](https://snipe-it.readme.io/docs/asset-labels) and [Barcodes](https://snipe-it.readme.io/docs/barcodes) — QR/1D label mechanics
- [Reftab — Asset Panda alternatives page](https://www.reftab.com/asset-panda-alternatives) — IT-focused positioning, free tier
- [Bulbthings: Asset Panda vs Asset Tiger](https://bulbthings.com/blog/asset-panda-vs-asset-tiger) — AssetTiger free ≤250 assets
- [GetApp: Reftab vs Timly](https://www.getapp.com/operations-management-software/a/reftab/compare/inventar-services-2-0/) — Timly positioning
- [Cheqroom IT asset management](https://www.cheqroom.com/solutions/it-asset-management/) and [AssetControl audit log](https://assetcontrol.cloud/features/audit-ready-activity-log) — audit-trail value framing
- [BlueTally warranty/EOL tracking](https://bluetally.com/features/warranty-end-of-life-tracking), [Asset Panda warranty alerts](https://www.assetpanda.com/resource-center/blog/how-to-set-up-automated-warranty-expiration-alerts/) — warranty alerting norms
- [SolarWinds ITAM checklist](https://www.solarwinds.com/blog/essential-it-asset-management-checklist), [CloudAware feature list](https://cloudaware.com/blog/asset-management-software-features/), [InvGate 15 ITAM tools](https://blog.invgate.com/it-asset-management-software) — table-stakes consensus (secondary)
- r/sysadmin and r/ITManagers threads — practitioner sentiment on assignment workflows and per-asset pricing

---
*Feature research for: internal IT asset tracking (Barahlo)*
*Researched: 2026-08-31*
