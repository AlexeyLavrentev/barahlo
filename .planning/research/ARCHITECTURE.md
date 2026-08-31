# Architecture Research

**Domain:** Internal IT asset tracking (single-manager web app, self-hosted, 50–200 employees, hundreds of devices)
**Researched:** 2026-08-31
**Confidence:** MEDIUM (synthesized from multiple independent community/engineering sources per topic; no single authoritative spec exists for this domain)

## Standard Architecture

### System Overview

Small internal asset trackers (Snipe-IT, Hatchbox-style inventory tools, countless in-house builds) converge on the same shape: **a single server-rendered monolith over a single relational database, with one append-only event table for custody history**. No microservices, no separate API, no external search engine.

```
┌────────────────────────────────────────────────────────────────────┐
│                        Browser (office LAN)                        │
│              Russian-language UI, Apple-style aesthetics           │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ HTML forms / light JS (HTMX or vanilla)
┌──────────────────────────────▼─────────────────────────────────────┐
│                     Web App (single monolith)                      │
├────────────────────────────────────────────────────────────────────┤
│  Auth middleware          │ session cookie, single account gate    │
├────────────────────────────────────────────────────────────────────┤
│  Route/Controller layer   │ devices │ employees │ movements │      │
│                           │ search  │ dashboard  │ photos │ auth   │
├────────────────────────────────────────────────────────────────────┤
│  Domain services          │ validation, per-type field schemas,    │
│                           │ movement transactions, filter builder  │
├────────────────────────────────────────────────────────────────────┤
│  Persistence              │ repo/query functions                   │
├────────────────────┬─────────────────────┬─────────────────────────┤
│  ┌───────────────┐ │  ┌───────────────┐  │  ┌───────────────────┐  │
│  │ Relational DB │ │  │ Photo store   │  │  │ Sessions          │  │
│  │ (SQLite or    │ │  │ (disk dir or  │  │  │ (DB table or      │  │
│  │  Postgres)    │ │  │  DB blobs)    │  │  │  signed cookie)   │  │
│  └───────────────┘ │  └───────────────┘  │  └───────────────────┘  │
└────────────────────┴─────────────────────┴─────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Auth gate | One login+password account; every route except `/login` requires a valid session | Server-side session (DB table or signed cookie), httpOnly secure cookie, bcrypt/argon2 password hash |
| Devices module | Device CRUD, per-type forms, device card (specs, purchase, warranty, photos, timeline) | One `devices` table; per-type field schema defined in code |
| Device types | Reference data: which fields belong to which type (laptop/monitor/dock/peripheral) | Small `device_types` lookup table + in-code field definitions driving form rendering and validation |
| Employees module | Directory: name + department; list of devices currently held | `employees` table; devices linked via denormalized `current_employee_id` |
| Movements module | Full custody history: who, when, from whom / to whom; timeline per device | **Append-only `movements` table**, written in the same transaction as the denormalized custody update |
| Attachments module | Device photos/documents: upload, store, serve authenticated | `attachments` metadata table + files on disk (or DB blobs); served via authorized route, downscaled on upload |
| Search & filters | Instant lookup by serial/inventory/model; field filters ("laptops without RAM upgrade", "warranty expiring") | SQL `WHERE` over indexed columns; one search box fanning out over 3–4 text columns; no external search engine |
| Dashboard | Counts by type/status, custody summary, repair/disposed lists, expiring-warranty highlight | A handful of aggregate SQL queries; zero caching needed at this scale |

## Recommended Project Structure

Stack-agnostic monolith layout (maps directly onto Django, Rails, Laravel, Node/Express+HTMX, etc.):

```
src/ (or app/)
├── routes/               # HTTP layer: thin controllers, one file per module
│   ├── auth.ts           #   login, logout, session
│   ├── devices.ts        #   list, card, create, edit, dispose
│   ├── employees.ts      #   directory, employee card
│   ├── movements.ts      #   assign / transfer / return / repair / dispose actions
│   ├── search.ts         #   global search box endpoint
│   └── dashboard.ts      #   aggregates
├── services/             # domain logic, no HTTP knowledge
│   ├── device_schema.ts  #   per-type field definitions (single source of truth
│   │                     #   for forms, validation, AND filter UI)
│   ├── movements.ts      #   custody transitions as transactions
│   └── filters.ts        #   structured filter → SQL clause builder
├── db/
│   ├── schema.sql        #   tables, indexes, constraints
│   └── queries/          #   repo functions per module
├── views/                # server-rendered templates + partials
│   ├── layouts/
│   ├── devices/          #   list, card, form
│   ├── employees/
│   └── dashboard/
├── files/                # photo storage root (gitignored; outside web root)
└── static/               # css, js, fonts
```

### Structure Rationale

- **routes/ vs services/:** the one piece of domain logic worth isolating is movement transactions (event insert + custody update must be atomic) and the per-type field schema (used by forms, validation, and filters — it must live in exactly one place). Everything else can stay thin.
- **`device_schema.ts` is the keystone:** it defines, per type, which fields exist, their labels (Russian), input types, and validation. Forms render from it, payloads validate against it, the filter panel builds from it. This is what makes "fixed fields per type" cheap — adding a field is one entry, not a schema-migration-plus-five-views affair (only the column itself needs a migration).
- **files/ outside the web root:** photos must not be served as raw static files — they sit behind the same auth as everything else, so they are streamed through a controller route after the session check.

## Data Model (the core of this domain)

Five tables plus sessions. This is deliberately a fraction of the 30-table "full ITAM lifecycle" schemas — those model procurement workflows, licenses, and locations, all of which are out of scope here.

```sql
users(id, login, password_hash)                      -- exactly one row
sessions(token, user_id, created_at, expires_at)     -- or signed cookies

device_types(id, key, name)                          -- laptop, monitor, dock, peripheral

devices(
  id, type_id        -> device_types,
  -- common fields (every type)
  model, serial_number, inventory_number,             -- unique-ish, indexed
  status,                                             -- in_stock | assigned | repair | disposed
  current_employee_id -> employees NULL,              -- denormalized custody (see Movements)
  purchase_date, purchase_price, supplier,
  warranty_until,                                     -- nullable; drives expiry highlighting
  notes,
  -- type-specific fields: typed, nullable columns (see "Per-Type Fields")
  ram_gb, ram_upgraded, ssd_gb,                       -- laptop
  screen_diagonal, panel_type,                        -- monitor
  port_count,                                         -- dock
  peripheral_kind,                                    -- peripheral
  created_at, updated_at
)

employees(
  id, name, department,
  is_active                                           -- archive left employees, keep history
)

movements(                                            -- APPEND-ONLY, never UPDATE/DELETE
  id, device_id -> devices,
  event_type,                                         -- received | assigned | transferred
                                                      -- | returned | to_repair | from_repair | disposed
  from_employee_id -> employees NULL,
  to_employee_id   -> employees NULL,
  comment,
  occurred_at,                                        -- user-visible date; may differ from created_at
  created_at
)

attachments(
  id, device_id -> devices,
  file_name, mime_type, byte_size, kind,              -- photo | document
  storage_key,                                        -- path under files/, or NULL if stored as blob
  created_at
)
```

**Indexes:** `devices(serial_number)`, `devices(inventory_number)`, `devices(type_id, status)`, `devices(current_employee_id)`, `devices(warranty_until)` (partial, where not null), `movements(device_id, occurred_at)`. Everything else is unnecessary at hundreds of rows.

### Per-Type Fields Without the EAV Mess

The research is unambiguous on this: **EAV (rows-as-attributes) is the mess to avoid**, and this project is structurally immune to the problem that pushes people toward it, because PROJECT.md already fixes the field sets in code — there is no user-defined-field constructor. That leaves three sane patterns:

| Pattern | Verdict here | Why |
|---------|-------------|-----|
| **Wide table, typed nullable columns** (recommended) | **Use it** | 4 stable types × ~4–5 fields ≈ 20 extra columns. Sparse NULLs cost nothing at hundreds of rows. The killer filters ("RAM not upgraded", "warranty expiring") become plain indexed `WHERE` clauses — no joins, no JSON path expressions. Adding a field = one migration + one entry in `device_schema`. Hardware categories don't churn, so migration cost is near zero. |
| JSON column for type-specific tail | Fallback | Viable (GIN-indexable in Postgres, `json_extract` in SQLite), but it buys nothing here — field sets are fixed — and makes the flagship filters uglier and slower. The Heap engineering post's 80% JSONB slowdown is a hot-table story, not this scale, but there's simply no upside to pay for. Reach for it only if type fields start churning every week. |
| Class-Table Inheritance (per-type detail tables) | Escape hatch | Typed columns with real FKs, at the price of a join per detail fetch and more migrations. Only worth it if some type grows FK-heavy fields (e.g., peripherals referencing a catalog). Keep in mind as the documented evolution path, don't build it now. |
| EAV / attribute constructor | Reject | User already rejected the constructor. EAV makes every query a pivot, kills type safety, and is the classic "six months later every feature hurts" trap. |

GitLab's engineering docs ban single-table inheritance for *large evolving* schemas (type proliferation, NULL bloat); that caution doesn't transfer to four frozen hardware types in a single-user app. The honest trade: this table stays readable because a comment block (and `device_schema.ts`) documents which columns belong to which type.

### Movement History: Append-Only Events + Denormalized Current State

The consensus pattern for custody tracking is the **hybrid**, and it fits perfectly:

1. **`movements` is append-only** — INSERT only, never UPDATE or DELETE. Each row is an immutable custody event: type, from, to, when, comment. This *is* the "кто когда имел" timeline; no separate audit log needed (the event log and the audit trail are the same thing here — if a field like `warranty_until` also matters historically, add a lightweight `audit_log(entity, entity_id, field, old, new, at)` later, but don't build it up front).
2. **`devices.current_employee_id` + `devices.status` are the denormalized projection** — "who has it now" and list filtering read them directly, with no "latest event" subquery on every row. Both writes happen **inside one transaction** with the movement INSERT:

```typescript
// services/movements.ts — the single most important invariant in the app
function transfer(deviceId: number, toEmployeeId: number, comment?: string) {
  db.transaction(() => {
    const dev = db.one(`SELECT current_employee_id, status FROM devices WHERE id = ?`, deviceId);
    db.run(
      `INSERT INTO movements (device_id, event_type, from_employee_id, to_employee_id, comment, occurred_at)
       VALUES (?, 'transferred', ?, ?, ?, ?)`,
      [deviceId, dev.current_employee_id, toEmployeeId, comment, today()],
    );
    db.run(`UPDATE devices SET current_employee_id = ?, status = 'assigned' WHERE id = ?`, [toEmployeeId, deviceId]);
  });
}
```

Why not pure event sourcing (derive current state by replaying events)? Because replay machinery, snapshots, and projections solve problems this app doesn't have — a single user means no concurrent-transition races (thoughtbot's state-transition caveat is moot), and "who has it now" must be indexable for list filters. Why not a single mutable `assignments` row (current holder overwritten in place)? Because it destroys exactly the history this project exists to answer, and bolting on an audit table afterwards recreates the hybrid anyway. Every movement mutation the UI offers ("I entered the wrong employee") should be implemented as a **corrective event** or, pragmatically, an edit of the *last* event by the single trusted user — never as silent history rewriting.

## Data Flow

### Request Flow

```
[User action: assign laptop #12 to Ivanov]
    ↓
POST /devices/12/transfer  (form)
    ↓
Auth middleware ──✗──> redirect /login
    ↓ (valid session)
movements controller → services/movements.transfer()
    ↓
TRANSACTION: INSERT movements + UPDATE devices.current_employee_id/status
    ↓
redirect → device card re-renders: timeline shows new entry, custody shows Ivanov
```

### Read Flows

1. **Device card:** `devices` row (with type + current employee joined) + `movements` timeline (last-N, indexed by `device_id, occurred_at`) + `attachments` — 3 queries, single-digit milliseconds.
2. **Global search:** one input → `WHERE serial_number LIKE ? OR inventory_number LIKE ? OR model LIKE ?` (case-insensitive). At hundreds of rows a sequential scan is millisecond-fast; no FTS infrastructure needed. If typo tolerance ever matters, SQLite FTS5 / Postgres `pg_trgm` is a contained upgrade inside `db/queries/` — not an external engine.
3. **Filters ("laptops without RAM upgrade"):** filter panel built from `device_schema` → translated to straight SQL: `WHERE type_id = 'laptop' AND (ram_upgraded IS FALSE OR ram_upgraded IS NULL)`. The "IS NULL or false" nuance is the kind of thing to encode once in `services/filters.ts`.
4. **Dashboard:** a few `GROUP BY` aggregates over `devices` + one range scan on `warranty_until`. Highlight = compare `warranty_until` to `today() + 30/60/90 days` in the query.

### Photos

```
upload → controller (auth-checked) → validate mime/size → downscale to ~1600px client-side
       → write file to files/<device_id>/<uuid>.jpg → INSERT attachments metadata (same transaction)
view  → GET /attachments/<id>/file → auth check → stream from disk with long cache headers
```

Store bytes on disk with metadata in the DB (recommended: simpler streaming, OS caching, resize variants), **or** as DB blobs if the stack lands on SQLite and single-file backup outweighs everything else — both are defensible at this scale; the non-negotiable part is serving through the authenticated route, never as raw static files. Backups = `db dump + files/ directory`, cron-able to any internal share.

## Architectural Patterns

### Pattern 1: Server-Rendered Monolith + Session Auth

**What:** One deployable app renders HTML on the server; auth is a classic server-side session behind an httpOnly cookie; interactivity (search-as-you-type, inline filter forms, photo preview) sprinkled via HTMX or a little vanilla JS.
**When to use:** Always for this project — single user, LAN-only, form-driven CRUD, no mobile client.
**Trade-offs:** Forfeits offline-rich-client behavior nobody asked for; in exchange: one process to deploy on the internal server, one auth story, no CORS, validation written once. SPA+API would double the auth/validation surface for zero benefit here. JWT is strictly worse than sessions at this scale (revocation pain, no horizontal scaling to justify it).

### Pattern 2: Append-Only Event Log with Denormalized Projection

**What:** Described above — immutable `movements` + maintained current state on `devices`, committed atomically.
**When to use:** Any "who had what when" question is a product requirement (it is here — it's in the project title of requirements).
**Trade-offs:** Two writes per action instead of one; the invariant "projection matches last event" must live in one service function so it can't drift. Do **not** generalize into full event sourcing.

### Pattern 3: Code-Defined Type Schemas (single source of truth)

**What:** Per-type field definitions live in one typed module and drive form rendering, server validation, card display, and the filter panel.
**When to use:** When field sets are fixed per type but you don't want a migration touching five view files each time.

```typescript
// services/device_schema.ts (excerpt)
const LAPTOP: TypeSchema = {
  key: "laptop", label: "Ноутбук",
  fields: [
    { key: "ram_gb",        label: "RAM, ГБ",    type: "int",  filter: "range" },
    { key: "ram_upgraded",  label: "RAM апгрейд", type: "bool", filter: "exact" },
    { key: "ssd_gb",        label: "SSD, ГБ",    type: "int",  filter: "range" },
  ],
};
```

**Trade-offs:** Columns and schema entries must be added in two places (migration + definition) — acceptable; what you must never do is let the DB hold field *definitions* (that's the EAV/constructor path already rejected).

## Recommended Build Order (dependency-driven)

Each stage only depends on the ones before it; stages are phase-sized.

```
1. Skeleton + DB + Auth        ── everything is gated; schema laid down up front
       │
2. Employees directory         ── zero dependencies; FK target for everything else
       │
3. Device registry             ── types + devices + per-type forms + list/pagination
       │
       ├── 4. Movement history ── needs devices + employees; the transactional core
       └── 5. Photos           ── needs devices only (parallelizable with 4)
               │
6. Search + filters + warranty highlight ── needs device fields finalized (3) & custody (4)
               │
7. Dashboard                   ── aggregates over everything; pure read, built last
```

1. **Foundation:** app skeleton, DB schema (all tables — migrations are cheap now, annoying mid-phase), login/session. Auth first because *every* route is behind it.
2. **Employees:** trivial CRUD, required as FK target for devices/movements; also seeds the UI style (Apple-aesthetic list/detail patterns) on the simplest screen.
3. **Device registry:** `device_types`, `devices`, `device_schema` module, type-aware create/edit forms, paginated list. The heart of the app.
4. **Movement history:** movements table + assign/transfer/return/repair/dispose actions + device timeline + employee card custody list. (Photos could swap order with this — photos only need devices.)
5. **Search & filters:** global search box, filter panel generated from `device_schema`, warranty-expiry highlight (a filter + a visual state, both cheap once 3 exists).
6. **Dashboard:** counts by type/status, "у кого что", repair/disposed views, expiring-warranty block. Last because it's a pure consumer of everything above.

## Scaling Considerations

This app will never face scaling pressure in its stated lifetime — one user, LAN, hundreds of devices. The honest table:

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Hundreds of devices / 1 user (the actual case) | Nothing. Plain SQL, offset pagination, sequential-scan search. |
| ~10K devices / a few concurrent users | Add partial index on `warranty_until`, keyset pagination if pages feel slow, FTS5/`pg_trgm` if search needs fuzz. Still one process, one DB. |
| 100K+ devices / multi-site | Not this product. At that point you're buying Snipe-IT, not building it. |

**First bottleneck (theoretical):** photo storage growth if someone uploads originals — solved at upload time by client-side downscaling, not by architecture.

## Anti-Patterns

### Anti-Pattern 1: EAV / user-defined attribute constructor

**What people do:** `fields(id, name)`, `values(device_id, field_id, value)` "for flexibility."
**Why it's wrong:** every filter becomes a self-join pivot, types vanish, validation scatters. The project explicitly rejected the constructor — EAV is its database shadow.
**Do this instead:** wide table with typed nullable columns + code-defined per-type schema (Pattern 3).

### Anti-Pattern 2: Mutable history

**What people do:** one `assignments` row per device, overwritten on each transfer; or "fixing" wrong entries by editing old movement rows.
**Why it's wrong:** destroys the custody timeline that is the app's reason to exist; "кто когда имел" becomes unanswerable.
**Do this instead:** append-only `movements`; corrections are new events (or an explicit edit of the last event by the single trusted user).

### Anti-Pattern 3: SPA + separate API for an internal form app

**What people do:** React frontend + REST/GraphQL backend "because modern."
**Why it's wrong:** two deployables on an internal server, dual auth (sessions + tokens), CORS, duplicated validation, for an app whose richest interaction is a filter panel.
**Do this instead:** server-rendered monolith; HTMX/Alpine for the handful of dynamic bits.

### Anti-Pattern 4: External search engine

**What people do:** stand up Elasticsearch/Meilisearch alongside the app.
**Why it's wrong:** a second service to run, back up, and sync — for a corpus where `LIKE` over three columns returns in single-digit milliseconds.
**Do this instead:** SQL `LIKE` now; FTS5/`pg_trgm` inside the same DB if fuzzy matching is ever wanted.

### Anti-Pattern 5: Photos as raw static files (or unbounded uploads)

**What people do:** drop uploads into a web-server-served `static/uploads/` folder.
**Why it's wrong:** bypasses auth entirely — device photos leak to anyone on the LAN; original-size phone photos bloat storage.
**Do this instead:** stream through an auth-checked route; downscale client-side; cap size/mime at upload.

### Anti-Pattern 6: The 30-table "complete ITAM" schema

**What people do:** copy an enterprise reference model (locations, cost centers, procurement states, licenses).
**Why it's wrong:** PROJECT.md explicitly excludes procurement workflow, software licenses, and multi-user roles; every orphan table is form-and-query surface area to maintain.
**Do this instead:** the six tables above; schema grows when a requirement does.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| None (by design) | — | No clouds allowed; no HR/AD/SSO source was mentioned. If the company later runs LDAP/AD, login can be swapped behind the auth service without touching domain modules. |
| Backup target | cron: DB dump + `files/` rsync to internal share | The only operational integration the deploy constraint requires. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| routes ↔ services | direct function calls | Only movements, device_schema, and filters justify service modules |
| services ↔ db | repo/query functions | Raw SQL (or thin query builder) — no ORM glamour needed at this size; either is fine |
| app ↔ photo store | filesystem paths under `files/` (or blobs) | Auth-checked streaming route is the boundary |
| movements ↔ devices | same-transaction write | The one cross-module invariant; keep it in `services/movements` |

## Sources

- [Asset Management Database Design — Stack Overflow](https://stackoverflow.com/questions/4417511/asset-management-database-design)
- [IT Asset Management Database Structure and Schema — DatabaseSample](https://databasesample.com/database/it-asset-management-database-database)
- [Building an Object Schema for ITAM — Atlassian](https://support.atlassian.com/assets/docs/building-an-object-schema-for-it-assets-management-itam/)
- [Table Inheritance Patterns: Single Table vs Class Table vs Concrete — Medium](https://medium.com/@artemkhrenov/table-inheritance-patterns-single-table-vs-class-table-vs-concrete-table-inheritance-1aec1d978de1)
- [When To Avoid JSONB In A PostgreSQL Schema — Heap Engineering](https://www.heap.io/blog/when-to-avoid-jsonb-in-a-postgresql-schema)
- [Postgres JSONB Columns and TOAST — Snowflake Engineering](https://www.snowflake.com/en/blog/engineering/postgres-jsonb-columns-and-toast/)
- [Don't design new tables using Single Table Inheritance — GitLab docs](https://docs.gitlab.com/development/database/single_table_inheritance/)
- [Multiple Tables or JSONB — r/PostgreSQL](https://www.reddit.com/r/PostgreSQL/comments/1lmls53/multiple_tables_or_jsonb/)
- [Event Sourcing Pattern — Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing)
- [Inserting State Transitions in Postgres — thoughtbot](https://thoughtbot.com/blog/inserting-state-transitions-in-postgres)
- [Implementing System-Versioned Tables in Postgres — hypirion](https://hypirion.com/musings/implementing-system-versioned-tables-in-postgres)
- [Archibus — Tracking an Asset's Chain of Custody](https://help.archibus.com/user_en/Subsystems/webc/Content/asset_mngmt/custody/chain_of_custody_concept.htm)
- [Postgres Full Text Search vs the rest — Supabase](https://supabase.com/blog/postgres-full-text-search-vs-the-rest)
- [PostgreSQL FTS 8× slower than SQLite FTS5 — Stack Overflow](https://stackoverflow.com/questions/66244830/postgresql-full-text-search-8-times-slower-than-sqlite-fts-search)
- [Storing uploaded photos — filesystem vs database BLOB — Stack Overflow](https://stackoverflow.com/questions/1105429/storing-uploaded-photos-and-documents-filesystem-vs-database-blob)
- [Is it better to store images in a BLOB or just the URL? — DBA Stack Exchange](https://dba.stackexchange.com/questions/736/is-it-better-to-store-images-in-a-blob-or-just-the-url)
- [For smaller projects just storing images as BLOBs works well — Hacker News](https://news.ycombinator.com/item?id=37325379)
- [Session vs Token Based Authentication — Authgear](https://www.authgear.com/post/session-vs-token-authentication/)
- [JWT vs Session Authentication — LoginRadius](https://www.loginradius.com/blog/identity/jwt-vs-session-based-authentication)
- [SSR vs SPA — vike.dev](https://vike.dev/SSR-vs-SPA)

---
*Architecture research for: internal IT asset tracking (Barahlo)*
*Researched: 2026-08-31*
