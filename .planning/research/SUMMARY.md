# Project Research Summary

**Project:** Barahlo — учёт корпоративной техники
**Domain:** Internal IT asset tracking — single-manager CRUD web app, LAN-deployed, Russian UI, replaces a spreadsheet (50–200 employees, hundreds of devices)
**Researched:** 2026-08-31
**Confidence:** MEDIUM-HIGH (Stack: HIGH — verified against npm registry + official vendor docs; Features/Architecture/Pitfalls: MEDIUM — multi-source synthesis with practitioner corroboration)

## Executive Summary

This is a single-user internal asset registry, and the expert consensus on how to build it is remarkably uniform: **a server-rendered monolith over one relational database with one append-only event table for custody history**. No microservices, no separate API, no external search engine, no notification infrastructure, no cloud services. The domain's real risks are not scale — hundreds of rows and one writer are trivial — but *data trust*: the #1 documented failure mode of asset-inventory systems is the registry going stale until the user reopens the spreadsheet. Every architectural and UX decision below is shaped by keeping the registry truthful and the «мгновенный точный ответ» promise intact.

The recommended approach: **one Next.js 16 (App Router) application** — Server Components read SQLite directly, Server Actions mutate — over **SQLite (better-sqlite3) + Drizzle ORM**, styled with **Tailwind v4 + shadcn/ui** restyled to the Apple aesthetic, deployed as **one Docker container** (`node:24-slim`, standalone output) with `data/app.db` + `data/uploads/` volume mounts as the entire system state. Two modules are the keystone: a code-defined `device_schema.ts` (per-type field definitions driving forms, validation, and the filter panel from one place) and `services/movements.ts` (the transactional invariant: append-only `movements` INSERT + denormalized `devices.current_employee_id`/`status` UPDATE in one transaction). Auth is a ~50-line bcrypt + jose signed-cookie session gated by middleware — deliberately not NextAuth/Auth.js (beta, merged into Better Auth, wrong weight for one account).

The key risks are all cheap to prevent in the right phase and nearly unrecoverable if missed: (1) **mutable assignment history** — the movements table must exist in the first migration, before any device CRUD, because lost history cannot be retrofitted; (2) **status drift** — holder/status may only change through action buttons («Выдать»/«Вернуть»/«В ремонт»/«Списать») that write events, never through free field editing; (3) **EAV collapse** — the fixed-per-type-fields decision is correct, defend it with typed nullable columns; (4) **auth and backups bolted on late** — auth middleware (covering API *and* photo routes) plus a rehearsed backup routine ship in the foundation phase; (5) **serial search failing on real-world input** (wrong case, Cyrillic homoglyphs, partial serial) — normalized columns with UNIQUE indexes from day one.

## Key Findings

### Recommended Stack

Full detail in [STACK.md](./STACK.md). One Next.js app, one SQLite file, one Docker container; anything solving multi-user/multi-server/internet-scale problems is dead weight.

**Core technologies:**
- **Next.js 16 (App Router) + React 19 + TypeScript** — full-stack framework; Server Components + Server Actions eliminate a separate REST layer; Turbopack default; best-documented self-hosting story with an official Docker example
- **SQLite + better-sqlite3 13** — correct at this scale by sqlite.org's own criteria (one writer, hundreds of rows, internal server); zero administration; backup = copy one file; WAL mode
- **Drizzle ORM + drizzle-kit** — typed schema doubling as documentation; keeps a near-mechanical Postgres escape hatch
- **Tailwind CSS v4 + shadcn/ui** — the only realistic path to hand-tuned Apple-minimal design; component-kit admin themes actively fight the aesthetic
- **jose + bcryptjs** — ~50-line single-account session (HS256 JWT in HttpOnly cookie); not NextAuth/Auth.js v5 (beta, migrating to Better Auth)
- **zod 4** (Server Action validation), **sharp** (resize/re-encode/EXIF-strip photo uploads), **papaparse** (only if CSV import ever arrives — export is plain string building), **lucide-react**

**Critical version constraints:**
- Node 24 LTS (Node 20 is EOL); Docker image must be `node:24-slim` (glibc) — **never Alpine** with better-sqlite3
- drizzle-orm and drizzle-kit bump in lockstep; zod v4 needs @hookform/resolvers@latest
- Next 16: use `proxy.ts`, not `middleware.ts` (deprecated); `next lint` removed — run ESLint directly or Biome
- No i18n libraries (single Russian locale; `Intl.DateTimeFormat('ru-RU')` suffices); no Redis, no TanStack Query, no Postgres, no `node:sqlite` (still RC)

### Expected Features

Full detail in [FEATURES.md](./FEATURES.md). The PROJECT.md Active list maps almost exactly onto the category's table stakes — no scope additions needed.

**Must have (table stakes — missing one makes it worse than the spreadsheet):**
- Asset registry with 4 fixed per-type field sets (ноутбук / монитор / док-станция / периферия)
- Search by serial / inventory number (substring, case-insensitive, instant)
- Assign / reassign / return with **automatically logged** movement history timeline
- Employee cards (name + department) with issued-asset list; offboarding is a top real-world query
- Statuses: используется / на складе / в ремонте / списано (archive, never delete)
- Purchase + warranty fields with on-screen expiry highlighting (no email infra)
- Field filters incl. «ноуты без апгрейда RAM» and «гарантия < N дней» — this IS the core pain scenario
- Dashboard summary (counts by type/status, warranty watchlist, recent movements)
- Fast paginated lists at hundreds of records; single-account login; Russian UI with Apple aesthetic

**Should have (differentiators, v1.x with explicit triggers):**
- Saved smart filters (trigger: same filter entered twice)
- Global ⌘K search across assets + employees (trigger: asset count ~150+ or search feels slow)
- Clone asset / bulk create (trigger: first multi-unit purchase)
- QR label sheet → asset page (trigger: physical stickers or annual инвентаризация)
- Printable handover act / акт приёма-передачи (trigger: first formal HR/accounting request)
- Warranty watchlist tile (trivially cheap once dashboard exists)
- Photos are in-scope for v1 but are the first thing to cut if the schedule slips

**Defer (v2+):** audit/spot-check mode, locations beyond department, consumables tracking.

**Anti-features (competitors have them; building any is pure cost here):** custom field constructor, roles/permissions/LDAC/SSO, employee self-service, software/license tracking, network discovery agents, depreciation, procurement pipeline, email notifications, reservations, CSV import, native mobile app, 1D barcode hardware support.

### Architecture Approach

Full detail in [ARCHITECTURE.md](./ARCHITECTURE.md). A single server-rendered monolith over ~6 tables (`users`, `sessions`/cookie, `device_types`, `devices`, `employees`, `movements`, `attachments`) with photos as files on disk behind an auth-checked route. Two patterns carry the domain: **(1) hybrid custody tracking** — append-only `movements` (INSERT-only, never UPDATE/DELETE) plus denormalized current state on `devices`, written in one transaction; corrections are new compensating events, never history edits. **(2) code-defined per-type field schemas** — one typed module (`device_schema.ts`) is the single source of truth for form rendering, server validation, card display, and the filter panel; the DB uses a wide `devices` table with typed nullable per-type columns (no EAV, no JSON-tail, no field constructor). Search is SQL `LIKE` over indexed columns; the dashboard is a pure read model of aggregates built last.

**Major components:**
1. **Auth gate** — single account, session cookie, middleware on *everything* including `/api` and photo routes
2. **Devices module + `device_schema.ts`** — CRUD, per-type forms, device card (specs, purchase, warranty, photos, timeline); the schema module is the keystone
3. **Employees module** — directory with archive semantics (`is_active`), issued-asset list
4. **Movements service** — the transactional core: assign/transfer/return/repair/dispose as atomic event+projection writes
5. **Attachments module** — client-resized, sharp-re-encoded, EXIF-stripped photos on disk, streamed through an authenticated route
6. **Search/filters + Dashboard** — indexed SQL reads; dashboard built last as a pure consumer

### Critical Pitfalls

Full detail in [PITFALLS.md](./PITFALLS.md). Top 6, all with phase-specific prevention:

1. **Mutable assignment history** — if custody lives in overwritable columns, the «кто когда имел» timeline is unrecoverable after the first reassignment. *Prevent:* append-only `movements` in the **first migration**, event + projection in one transaction, corrective events for mistakes.
2. **Status drift (the #1 documented asset-tracker failure)** — free-editable status/holder fields go stale, trust dies, the spreadsheet returns. *Prevent:* state changes only via primary action buttons that write events; hide direct status editing; one-tap return; offboarding bulk-return.
3. **EAV collapse** — a generic attributes table turns the flagship filter («ноуты без апгрейда RAM») into a self-join pivot over untyped text. *Prevent:* typed nullable columns + `device_schema.ts`; a 5-minute migration is the cheap path for new fields.
4. **Hard-deleted employees/devices orphan history** — deletes break FKs or blank out timeline evidence exactly when a разборка needs it. *Prevent:* archive-only semantics (`is_active=false`, status «списано»); no delete buttons; block delete on devices with movements.
5. **Serial search breaks on real input** — wrong case, Cyrillic lookalikes (С→C, О→O…), trailing whitespace, partial serials → «не найдено» → user distrusts the system. *Prevent:* `serial_normalized`/`inventory_normalized` columns (uppercase, trimmed, homoglyph-mapped) with UNIQUE indexes; substring search across serial + inventory + model.
6. **Auth and backups bolted on late** — unauthenticated `/api` and `/uploads` routes, no rate limit/CSRF, plaintext passwords; and no backup routine means a dead disk erases the registry the spreadsheet at least had in the cloud. *Prevent:* auth middleware **first** in the foundation phase covering every route; bcrypt hash, HttpOnly/SameSite cookie, login rate limit, CSRF on mutations, TLS at the reverse proxy; nightly DB+uploads backup with one rehearsed restore; CLI password-reset script shipped in v1.

Also worth carrying into plans: photos must be client-resized (~1600px) and server-re-encoded with sharp (HEIC, EXIF GPS stripping, ≤6 per device) — original phone bytes stored nowhere; real `DATE` columns for warranty/purchase; CSV **export** (with UTF-8 BOM and `;` delimiter for Russian Excel) in v1 to kill the parallel-spreadsheet failure mode; and no RBAC/ERP scope creep — the second user, if ever, gets a second identical account.

## Implications for Roadmap

Based on combined research, a 7-phase structure. The ordering is heavily front-loaded: **schema correctness, auth, and backup discipline all land in Phase 1** because pitfalls 1/3/5/6 are cheap to prevent before data exists and expensive or impossible to fix after.

### Phase 1: Foundation — Skeleton, Schema, Auth, Backups
**Rationale:** Every route is auth-gated, and every later phase depends on the schema being right the first time. Pitfalls research is unambiguous: the movements table, normalized serial columns, and indexes must exist in the first migration — retrofitting is the one thing you cannot do later.
**Delivers:** Next.js 16 scaffold (TS, Tailwind v4, shadcn/ui init); full Drizzle schema (all ~7 tables, wide `devices` with typed nullable per-type columns, normalized serial/inventory columns with UNIQUE indexes, all indexes for the flagship filters); single-account auth (bcrypt + jose cookie) with middleware covering pages, API, and static routes; login rate limit + CSRF; backup routine (DB + uploads) with one rehearsed restore; Docker/compose deployment skeleton; CLI password-reset script.
**Addresses:** Single-account login (FEATURES P1)
**Avoids:** Pitfalls 1 (schema part), 3, 5 (schema part), 6; backup debt; dates-as-strings debt
**Uses:** Full STACK.md core; official Next.js Docker example

### Phase 2: Employees Directory
**Rationale:** Zero dependencies; required as the FK target for devices and movements; and the simplest screen on which to establish the Apple-aesthetic list/detail patterns that every later screen reuses.
**Delivers:** Employee CRUD, department field, archive semantics (`is_active`) with no delete button, archived employees still rendering in history context.
**Addresses:** Employee cards (name-only part); offboarding groundwork
**Avoids:** Pitfall 4 (delete orphans) — archive flow built here from day one

### Phase 3: Device Registry
**Rationale:** The heart of the app; needs employees for nothing, but everything else needs it. The `device_schema.ts` keystone module is built here.
**Delivers:** `device_types` + wide `devices` table; `device_schema.ts` (per-type fields: labels, input types, validation, filter metadata); type-aware create/edit forms (react-hook-form only for the device card form); paginated list with default «активные» filter; device card with common fields; status column populated (creation = «поступление» groundwork) but **no state fields in edit forms**.
**Addresses:** Registry with per-type fields; asset card; statuses (display side); photos as first-cut candidate
**Avoids:** Pitfall 3 (EAV — CHECK constraints per type); Pitfall 2 groundwork (status/holder excluded from edit forms); structured-facts-in-notes debt (RAM-upgrade is a boolean column)

### Phase 4: Custody — Movements and Timeline
**Rationale:** The transactional core and the app's reason to exist; requires devices + employees. Photos could swap with this phase (they only need devices).
**Delivers:** «Выдать»/«Вернуть»/«В ремонт»/«Из ремонта»/«Списать» actions as atomic event+projection transactions; per-device movement timeline starting with «поступление»; employee card issued-asset list; one-tap return; offboarding «сдать всю технику» bulk return; corrections as compensating events.
**Addresses:** Assignment/return with automatic history; movement timeline; employee issued-asset list; statuses (mutation side)
**Avoids:** Pitfall 1 (fully), Pitfall 2 (action-based transitions — no UI path changes state without an event)

### Phase 5: Photos
**Rationale:** Only depends on devices; parallelizable with Phase 4 if desired. Upload constraints must be defined in the plan before the first photo lands.
**Delivers:** Client-side resize (Canvas, ~1600px, Safari/HEIC decode) → Server Action/Route Handler with MIME+size+count limits → sharp re-encode to JPEG + ~400px thumbnail, EXIF stripped, UUID filenames under `data/uploads/` → `attachments` metadata in same transaction → authenticated streaming route, thumbnails in lists, `next/image` on the card.
**Addresses:** Asset photos (FEATURES P1, first candidate to cut if slipping)
**Avoids:** Pitfall 7 (unbounded storage, HEIC breakage, EXIF GPS leakage, unauthenticated static files)

### Phase 6: Search, Filters, Warranty Highlighting, CSV Export
**Rationale:** Needs device fields finalized (Phase 3) and custody in place (Phase 4); this is where the Core Value («мгновенный точный ответ») becomes user-visible.
**Delivers:** Global substring search across serial_normalized + inventory_normalized + model; filter panel generated from `device_schema` translated to SQL (encoding the «IS NULL or false» nuances once); «ноуты без апгрейда RAM»; warranty-expiry highlight and window filter (real DATE math); CSV export of the device list (UTF-8 BOM, `;` delimiter, RFC 5987 Cyrillic filename).
**Addresses:** Search; field filters; warranty highlighting; export
**Avoids:** Pitfall 5 (search usability — verify with Cyrillic-keyboard typing tests); parallel-spreadsheet divergence

### Phase 7: Dashboard + v1.x Differentiators (stretch)
**Rationale:** Pure read model over everything above — built last, cheap, inherits correctness from the core. v1.x features are trigger-driven additions, not launch blockers.
**Delivers:** Counts by type/status, warranty watchlist tile, «в ремонте дольше N дней» drift widget, recent movements, every tile linking into a filtered list. Then, by trigger: saved smart filters, ⌘K search, clone asset, QR label sheet, bulk actions, printable handover act.
**Addresses:** Dashboard; all FEATURES P2/P3 differentiators
**Avoids:** Pitfall 2 (drift surfacing widgets); scope creep (each v1.x item ships only on its trigger)

### Phase Ordering Rationale

- **Dependency-driven:** auth gates everything → employees is the FK target → devices needs the schema module → movements needs devices + employees → search/filters need finalized fields + custody → dashboard consumes all. This mirrors ARCHITECTURE.md's recommended build order 1:1.
- **Pitfall-driven:** the four "cannot fix later" pitfalls (1, 3, 5-schema, 6) are all neutralized in Phase 1's migration and middleware; the "trust-erosion" pitfalls (2, 4) are neutralized by building actions/archive before data entry begins in earnest.
- **Value-driven:** the flagship query («ноуты без апгрейда RAM») and search — the product's Core Value — land in Phase 6, immediately after the data they operate on is trustworthy; the dashboard (a convenience) comes last.
- **A note for the roadmapper:** ARCHITECTURE.md describes the monolith in stack-agnostic terms (HTMX/vanilla JS, routes/views); STACK.md resolves this to Next.js idioms — App Router routes, Server Components, Server Actions. Treat ARCHITECTURE's component boundaries and data model as authoritative; map its routes/views layout onto Next App Router conventions, not literally.

### Research Flags

Phases likely needing deeper research during planning (`/gsd:plan-phase --research-phase`):
- **Phase 5 (Photos):** the most Next.js-specific plumbing — FormData in Server Actions vs Route Handlers, sharp inside the standalone Docker image, authenticated streaming interplaying with `next/image`. Patterns exist but are scattered; a focused pass would de-risk it.
- **Phase 1 (Foundation), lightly:** only if unfamiliar with Next 16 specifics (`proxy.ts` on Node runtime, Server Actions + zod, Drizzle SQLite setup). Official docs cover all of it — a light check, not full research.

Phases with standard patterns (skip research-phase):
- **Phase 2 (Employees), Phase 3 (Registry), Phase 4 (Custody):** plain CRUD + the transaction pattern already fully specified in ARCHITECTURE.md (including code).
- **Phase 6 (Search/Filters):** SQL LIKE + filter-builder over a typed schema — well-documented, fully specified in research.
- **Phase 7 (Dashboard):** aggregate queries + cards — trivial.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified against npm registry + official vendor docs on 2026-08-31; SQLite-over-Postgres and avoid-NextAuth calls backed by official guidance |
| Features | MEDIUM | Anchored on Snipe-IT's official product page (primary) corroborated by independent secondary sources; no hands-on product trials |
| Architecture | MEDIUM | Synthesized from multiple independent engineering/community sources per topic; no single authoritative spec exists for this domain — but the core patterns (hybrid event log, typed columns, monolith) are unanimous |
| Pitfalls | MEDIUM | Corroborated across multiple independent sources; items marked [PE] (action-based transitions, Cyrillic homoglyph normalization, backup discipline) are practitioner experience, MEDIUM-LOW |

**Overall confidence:** MEDIUM-HIGH. The stack decisions are as solid as research gets; domain patterns are consensus-backed. No finding contradicts another file — ARCHITECTURE's session-options and HTMX wording were resolved by STACK's specific choices (signed cookie, React Server Components), noted above for the roadmapper.

### Gaps to Address

- **CSV `;` delimiter + BOM for Russian Excel:** well-established but MEDIUM confidence (not verified against a Microsoft doc). Verify with a real Russian-locale Excel during Phase 6 — a 5-minute test.
- **RAM-upgrade signal:** «без апгрейда RAM» needs a decision finalized at requirements/Phase 3 — research recommends an explicit manager-set boolean `ram_upgraded` (simplest, unambiguous) over current-vs-base-RAM comparison. Confirm with the user.
- **Cyrillic homoglyph map:** the normalization table (А→A, В→B, С→C…) is practitioner advice; build a small typing-test fixture in Phase 6 to validate coverage.
- **HEIC client-side decode:** Safari/iOS canvas decoding is reported to work natively but wasn't tested; verify with a real iPhone photo in Phase 5 (server-side sharp re-encode is the fallback that makes this gap non-blocking).
- **Session mechanism:** STACK specifies a jose-signed JWT cookie; ARCHITECTURE left DB-table vs signed cookie open. Decide signed cookie in Phase 1 planning (simpler ops at one user; either works).
- **Initial data entry:** user starts clean (CSV import explicitly rejected), but the plan should acknowledge a manual-entry ramp — the fast-entry path (clone-adjacent entry, keyboard-first forms) matters before any UI polish cycles.

## Sources

Aggregated from the four research files; see each file for the complete annotated list.

### Primary (HIGH confidence)
- npm registry (fetched 2026-08-31) — authoritative versions: next 16.3.3, react 19.2.8, drizzle-orm 0.45.2, better-sqlite3 13.0.3, tailwindcss 4.3.3, jose 6.2.10, zod 4.5.4, sharp 0.35.4
- nextjs.org — Next 16 announcement, self-hosting guide, official `with-docker` example (standalone, node:24-slim, non-root)
- sqlite.org — official "when to use" criteria (one writer, unlimited readers)
- orm.drizzle.team, ui.shadcn.com, nodejs.org release/API docs, authjs.dev (v5 beta → Better Auth status)
- Snipe-IT official product page + label/barcode docs (fetched directly) — feature-landscape anchor

### Secondary (MEDIUM confidence)
- Heap Engineering (JSONB vs typed columns), GitLab engineering docs (STI caution), Azure Architecture Center (event sourcing), thoughtbot (state transitions), brandur.org + HN (soft deletion critique), DBA.SE / r/PostgreSQL (EAV antipattern), Evolveum (JSONB vs EAV measurements)
- OWASP Session Management Cheat Sheet, Invicti, Auth0 — auth in internal/LAN tools
- Motadata, CyCognito, Virima, AssetIT, Itemit — stale-data failure modes; BlueTally, Asset Panda — warranty alerting norms
- Reftab, AssetTiger, Timly, Cheqroom comparisons (GetApp, vendor pages) — competitor feature matrix
- Stack Overflow / DBA.SE / softwareengineering.SE threads — photo pipeline, search mechanics, FK deletes

### Tertiary (LOW confidence — validate during implementation)
- r/sysadmin, r/selfhosted, r/webdev, r/PostgreSQL threads — practitioner sentiment (SQLite consensus, LAN security norms, client-side image resize)
- **[PE]** practitioner experience items: action-based state transitions, Cyrillic homoglyph normalization, backup discipline for solo LAN tools, CSV semicolon/BOM convention for Russian Excel

---
*Research completed: 2026-08-31*
*Ready for roadmap: yes*
