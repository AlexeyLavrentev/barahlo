# Pitfalls Research

**Domain:** Internal IT asset tracking web app — solo-built, single manager user, 50–200 employees, hundreds of devices, LAN-deployed, Russian-language UI, replaces a spreadsheet
**Researched:** 2026-08-31
**Confidence:** MEDIUM (web-researched findings corroborated across multiple independent sources; items marked **[PE]** are practitioner experience from the asset-tracker/internal-tool domain, rated MEDIUM-LOW)

## Critical Pitfalls

### Pitfall 1: Assignment history stored as mutable columns — reassignment rewrites the past

**What goes wrong:**
The device row has an `assigned_to` column (maybe `assigned_date` too). Every reassignment overwrites it. After three years the "полная история перемещений" requirement is unmeetable: the timeline shows only the current holder, and questions like «кто имел этот ноутбук в 2024-м» — the exact разборки/audit scenario PROJECT.md names — have no answer. Worse, someone "fixes" a wrong reassignment by editing the column again, silently destroying even that.

**Why it happens:**
CRUD thinking. A mutable current-state column is the obvious first design, and the history feature gets deferred as "we can add an audit log later." Retrofitting history onto a live mutable table is impossible — the past is already gone. Azure Architecture Center's event-sourcing writeup documents exactly this CRUD weakness: it stores only the latest state.

**How to avoid:**
Hybrid pattern (the community consensus — full event sourcing is overkill here):
- One append-only `movements` table: `id, device_id, event_type (поступление/выдача/возврат/в ремонт/из ремонта/списание), from_employee_id, to_employee_id, occurred_at, note`. Rows are never UPDATEd or DELETEd.
- Write the event and update the device's cached current-location columns **in the same DB transaction**. Current state stays fast to query; history stays immutable.
- Record the initial «поступление» event when the device is created — every timeline must start somewhere.
- Mistakes are corrected by a new compensating event («выдача отменена/исправлена»), never by editing or deleting the old row.
- Snapshot name/department onto the event only if you ever allow employee hard-delete — see Pitfall 4; with immutable employee records, plain FKs are enough.

**Warning signs:**
The schema has `assigned_to`/`location`/`status` columns but no movements table; someone says "историю добавим потом"; a UI mock shows editing an existing timeline entry.

**Phase to address:**
Foundation/Schema phase — the movements table must exist in the first migration, before any device CRUD. Retrofitting is the one thing you cannot do later.

---

### Pitfall 2: Status drift — the registry goes stale and becomes the spreadsheet again

**What goes wrong:**
Statuses (`выдано`, `в ремонте`, `списано`, current holder) are fields the user can edit freely, separate from any "movement" action. The manager changes a holder in a hurry and forgets to flip the status, or marks a laptop «в ремонте» and forgets to close it out. Within months the dashboard and the filters answer from stale data; the user stops trusting the tool and reopens the spreadsheet. This is the #1 documented failure of asset-inventory systems (Motadata, CyCognito, Virima, AssetIT all list stale/incorrect records as the dominant failure mode) — and it is precisely why the spreadsheet is being replaced.

**Why it happens:**
Free-form field editing makes lying to the database one click too easy, and recording truth costs clicks. Solo tool + one busy user = discipline never happens.

**How to avoid:**
- Make state changes *actions*, not field edits: the only way to change holder/status is a single primary action («Выдать», «Вернуть», «В ремонт», «Списать») which writes the movement event and derives status. Hide direct status editing entirely.
- Return should be one tap from the device card and from the employee card («сдать всю технику» when someone leaves — the highest-frequency bulk event).
- Surface drift: dashboard widget «в ремонте дольше N дней», employee card shows only active assignments.
- Anti-goal to resist: a generic "edit device" form that includes status/holder fields.

**Warning signs:**
Any screen where status can be changed without producing a movement event; the user asks for "just a quick way to fix the status."

**Phase to address:**
Movements/Actions phase (with employees) — action-based state transitions defined there; device edit forms built in the Registry phase must exclude state fields from day one.

---

### Pitfall 3: Per-type field modeling collapses into EAV hell

**What goes wrong:**
To give laptops RAM/SSD, monitors diagonal, docks port counts, someone builds a generic entity-attribute-value schema (`attributes` table: entity_id, key, value). Result: type enforcement gone, values stored as text ("16" vs "16GB" vs "шестнадцать"), the «ноуты без апгрейда RAM» filter becomes a self-join pivot over text comparisons, no unique/FK integrity, and every new query is a small research project. EAV is the single most-cited schema antipattern for this domain ("anything is better than EAV" — DBA.SE; Evolveum measured JSONB ~2x faster than EAV with less storage).

**Why it happens:**
The attribute-constructor promises "no migrations ever, any type supported" — seductive before the field list is known. It is the correct design only when attributes are genuinely unknown at design time and user-defined at runtime.

**How to avoid:**
PROJECT.md already made the right call («Фиксированные поля устройства, а не конструктор атрибутов») — defend it:
- Single `devices` table: common columns (model, serial, inventory_no, photos, cost, purchase date/supplier, warranty_until, status) + nullable type-specific columns (`ram_gb`, `ssd_gb`, `screen_in`, …) + a CHECK constraint asserting type-appropriate fields.
- Typed columns make the killer filter trivial and indexable: `WHERE type='laptop' AND (ram_upgraded = false OR ram_gb <= stock_ram_gb)`.
- Model «RAM апгрейд» as an explicit boolean/value column, **not** as free text in notes — structured data hidden in the notes field is unfilterable (see UX Pitfalls).
- When a new device type needs a field: a 5-minute migration is the *cheap* path for a solo dev. EAV is the expensive path dressed as the flexible one.
- If per-type fields ever proliferate wildly, the escape hatch is JSONB for the type-specific tail — not EAV. But do not pre-build this.

**Warning signs:**
A `custom_fields`/`attributes`/`properties` table appears in the schema; field values read back as untyped strings; a filter request requires pivoting; someone proposes "fields configurable in the UI."

**Phase to address:**
Registry/Schema phase — the devices schema (typed columns + per-type field sets) is set in the first migrations.

---

### Pitfall 4: Hard-deleted employees (or devices) orphan the history

**What goes wrong:**
An employee leaves, the manager deletes their record, and either (a) FK constraints block the delete with a cryptic error, or (b) with cascades/without constraints, the movement timeline now shows «бывший сотрудник #47» or silently drops every «кому выдали» fact — the audit value of history is gone exactly when a разборка needs it. The same applies to deleting a device that turns out to still exist.

**Why it happens:**
Delete feels like the natural verb for "person left the company." The distinction between "no longer active" and "never existed" gets skipped. brandur.org's soft-deletion critique and the accompanying HN debate document the tradeoff space: naive `deleted_at` flags disable FK guarantees and leak into every query; hard deletes orphan references.

**How to avoid:**
For this app the clean rule is: **employees and devices are never deleted — they are archived.**
- Employee gets `is_active=false` (or `archived_at`); they disappear from pickers/dropdowns but every historical reference stays a valid FK. Timeline renders «Иванов И. (уволен)».
- Device that is physically gone gets status «списано», not a delete. Device that was entered *twice by mistake* is the only legitimate delete — and only if it has no movements (enforce: block delete when movements exist; merge instead).
- Do **not** use a generic soft-delete plugin that filters `deleted_at` globally across every query — explicit `is_active` scoping on pickers/lists is safer and easier to reason about at this scale.
- Real hard deletes: none from the UI. If ever needed (GDPR-style erasure is not a factor for an internal RU tool), anonymize the employee row («Сотрудник #47») instead of deleting.

**Warning signs:**
A «Удалить сотрудника» button in a mock; FK-violation errors in dev logs; history tests referencing employee IDs that no longer resolve; discussion of `ON DELETE CASCADE` on movements.

**Phase to address:**
Employees phase — archive semantics built when the employee card is; delete buttons never shipped.

---

### Pitfall 5: Serial-number search breaks on real-world input

**What goes wrong:**
Search works in demos with clean pasted serials, then fails in practice: the manager types the serial from a sticker with different casing, or copies one from a PDF/paste with trailing whitespace or full-width characters, or — with a Russian keyboard active — types **Cyrillic lookalikes into a Latin serial** (С instead of C, О instead of O, А instead of A). Lookup returns «не найдено», the manager concludes "the system doesn't have it," and trust dies. A related failure: the search requires the *full* serial when the user has only a partial («найди тот серийник на ABC…»).

**Why it happens:**
Equality matching against raw input. Serials are the app's primary key in practice — users identify devices by them — so every input-noise defect hits the core value proposition («где серийник ABC123 — за секунды»).

**How to avoid:**
- Normalize on write AND on search: store `serial_normalized` (uppercase, trimmed, whitespace collapsed, Cyrillic homoglyphs mapped to Latin: А→A, В→B, С→C, Е→E, О→O, Р→P, etc.) alongside the display value. Same for inventory numbers.
- `UNIQUE` index on `serial_normalized` and `inventory_normalized` — this also catches accidental double-entry at creation (see Recovery Strategies).
- Search across model, serial, inventory number with **substring** match (`LIKE '%q%'`). At this scale (hundreds to low thousands of rows) a plain indexed-prefix + fallback scan is fast; pg_trgm/GIN is the documented upgrade path if it ever feels slow — do not build it preemptively. Note the documented trigram limits if ever used: ≥3-character patterns only, and Postgres full-text search is the *wrong* tool for serials (it matches stemmed whole words, not substrings).
- Never case-sensitive; never exact-match-only on serial/inventory.

**Warning signs:**
Search box bound directly to `WHERE serial = ?`; no normalization helper anywhere; manual test passes only with copy-pasted serials; no unique constraint on serial.

**Phase to address:**
Search phase — but the normalized columns and unique indexes belong in the Registry phase schema (adding them after data exists means a cleanup migration over dirty data).

---

### Pitfall 6: Authentication bolted on after the app "works"

**What goes wrong:**
Auth is the last milestone of a solo build, and it ships wrong in predictable ways: password in plaintext or hardcoded; the JSON API routes and the `/uploads/` photo directory have **no auth check** because "the pages have a login"; session cookie without `HttpOnly`/`SameSite`; no rate limit on login; no CSRF protection on mutating actions; no way to reset a forgotten password without redeploying. The «internal network = safe» assumption is the documented trap (Invicti lists it among top developer security misconceptions; self-hosting communities consistently recommend auth + TLS even LAN-only, because LAN apps are prime lateral-movement targets).

**Why it happens:**
Auth is invisible in demos, one user "reduces" the perceived need, and it delays the fun parts. The gaps only surface when someone scans the LAN or the manager's workstation is compromised.

**How to avoid:**
- Single-account auth is genuinely simple — do it *first*, as middleware, not last: password hashed with bcrypt/argon2; server-side session; cookie with `HttpOnly`, `SameSite=Lax`, `Secure` (via TLS); sensible expiry (weeks are fine here); login rate-limited.
- Auth middleware on **everything** including API routes and static `/uploads` photo serving — photos of your company's hardware with serials and costs should not be fetchable by any LAN guest.
- CSRF token on all mutating requests.
- TLS at the reverse proxy (Caddy/nginx with an internal CA or self-signed) — cheap, and passwords stop crossing the LAN in cleartext.
- Ship a CLI/script password reset with v1 — the one-user app where the user is locked out is a support incident against yourself.
- PROJECT.md's single-account decision is sound; do not let "maybe later we need roles" grow into building RBAC (see Pitfall 9 / Technical Debt table).

**Warning signs:**
Routes rendered without a session check "just for testing"; an open `/uploads` or `/api` prefix; password stored or logged in plaintext; no CSRF/rate-limit mentions in the plan; auth scheduled as the final phase after "polish."

**Phase to address:**
Foundation phase — auth middleware exists before device data does.

---

### Pitfall 7: Unbounded photo storage and upload pathologies

**What goes wrong:**
The manager photographs devices with a phone. Originals are 2–5 MB (and HEIC if iPhone). Nothing limits count or size, so a few hundred devices later the app has gigabytes of originals, list pages load 5 MB images for 40px thumbnails, HEIC photos won't render in Chrome/Android browsers, and backups of the uploads dir balloon. Phone-camera EXIF (precise GPS of where company hardware lives) gets served to anyone who can fetch the image.

**Why it happens:**
Storing `file.blob` as received is the path of least resistance; resizing is "optimization" deferred until the storage is already polluted with originals that can never be safely bulk-deleted.

**How to avoid:**
- Resize/compress **client-side before upload** (Canvas `toBlob` or `browser-image-compression`): longest edge ~1600px, JPEG quality ~80, target ≤200–300 KB — the standard small-app practice (cuts bandwidth, upload time, and storage at the source). Safari/iOS decodes HEIC to canvas natively, which sidesteps the format problem for the likely iPhone-wielding user.
- Server-side: re-encode with `sharp` regardless (client checks are bypassable), generate one small thumbnail (~400px) at upload time, strip EXIF, enforce a hard size/count limit per device (e.g. ≤6 photos).
- Store originals **nowhere**; store processed JPEG + thumb. Serve the thumb in lists, full image on the card.
- Photos live in a directory next to the DB, referenced by filename — included in the same backup routine (see Technical Debt: backups).
- Ceiling math: 500 devices × 4 photos × 250 KB ≈ 500 MB — bounded and backupable forever.

**Warning signs:**
Upload handler writes the original bytes straight to disk; no `sharp`/image processing dependency; HEIC never mentioned; list UI `<img src>` points at full-size files; EXIF never discussed.

**Phase to address:**
Photos phase — with the upload constraints defined in its plan, before the first photo lands.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| No backup routine ("it's one server") | Nothing to build | Disk dies → entire registry gone; the spreadsheet was at least on Google's servers | Never — nightly copy of DB file + uploads dir to NAS/other machine, with one restore actually rehearsed, is a day of work in the Foundation phase |
| Import "deferred" then done as a one-off SQL/CSV script against prod | Fast data entry in week 2 | Silent duplicates, mixed formats, dates as text — exactly the CSV-import debt documented in WooCommerce/NetSuite post-mortems (importers creating dupes instead of updates) | Only as a staged one-off: load into a scratch table, run validation report (dup serials, blanks), then promote. Never direct INSERT from CSV |
| Structured facts (supplier, отдел, RAM-апгрейд статус) typed into free-text notes | No schema change now | Unfilterable, unsortable; «ноуты без апгрейда RAM» — the project's flagship query — becomes unread-the-notes | Never for the flagged fields; notes stay for genuinely unstructured remarks |
| Dates stored as strings / timestamps for warranty and purchase dates | Skips one migration | «истекает гарантия» filter and highlight compare strings or carry timezone noise | Never — real DATE columns; warranty/purchase are dates, not timestamps |
| Generic soft-delete (`deleted_at` global filter) "for flexibility" | One flag now | Every query must remember the filter forever; FK guarantees silently off (brandur.org critique) | Never here — explicit `is_active` on employees, `списано` status on devices |
| Building roles/permissions "just in case" | Feels future-proof | Weeks of work for a one-user app; the second user, if ever, needs at most a second account with identical rights | Never in this milestone — PROJECT.md has it Out of Scope; revisit only when a second real user exists |
| One-off manual DB edits in a sqlite/psql shell to "fix data quickly" | 30 seconds | Unrecorded history edits, drift between what UI shows and DB truth | Only via the app's correction-event flow (Pitfall 1) |

## Integration Gotchas

Few external integrations by design (LAN-only, no clouds) — the gotchas are at the browser/OS boundary.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Phone camera → upload | Accepting original HEIC/raw bytes; assuming JPEG | Client-side canvas resize (Safari decodes HEIC), server-side re-encode to JPEG with `sharp`, strip EXIF |
| Barcode/QR scanner as input | Treating scanners as a feature to build | Most USB/BT scanners are keyboard wedges: they type the code + Enter. If ever wanted, it's a form autofocus + Enter-submit — hours, not weeks; keep out of MVP scope |
| LAN reverse proxy | Serving the app bare on HTTP:8080 | Put Caddy/nginx in front: TLS (internal CA), compression, and a place to hang rate limiting |
| Excel/Sheets round-trip ("just let me export") | No export, so user keeps the spreadsheet alive in parallel → two sources of truth diverge | Cheap CSV export of the device list in v1 kills the parallel-spreadsheet failure mode documented across asset-management sources; keep it one button, no import |
| Corporate AD / HR system sync | Building an employee-import integration "since employees exist somewhere" | PROJECT.md: 50–200 employees, manual entry of name+отдел is minutes of work; sync is ERP territory (Pitfall 9) |

## Performance Traps

Scale context: hundreds of devices, thousands of movement rows, one user. Most "performance engineering" here is premature — but these five are the real ones.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| N+1 queries on lists (device list fetching employee name per row, ORM lazy-loading) | Device/employee lists issuing hundreds of queries; page load climbing as data grows (classic ORM signature — documented across admin-panel post-mortems) | Eager-load the 1–2 relations per list; it's a one-line fix if known from day one | Anywhere above ~50 rows per page — i.e., immediately in production data |
| Dashboard recomputed with uncached full-table aggregates on every load | Dashboard creeping toward seconds; the "instant answer" promise eroding | At this scale aggregates are fast **if indexed**; index `status`, `type`, `warranty_until`, `employee_id`; avoid per-widget redundant scans | Only in the thousands-of-devices range — index from the start, optimize never |
| Pagination COUNT tax — full `COUNT(*)` before every list render (the documented EasyAdmin paginator pathology) | Every page navigation slower than the data justifies | Standard LIMIT/OFFSET pagination with count cached per filter-set is fine at this scale; skip fancier schemes | Thousands+ rows; don't pre-optimize |
| Full-size photos in list views | Device list downloads tens of MB | Thumbnails (Pitfall 7) | First week of real photo use |
| Unindexed filters on the flagship queries | «без апгрейда RAM», «гарантия истекает» slow once data is real | These exact queries are known requirements — add their indexes in the schema migration, not after a complaint | Hundreds of devices with joins; borderline — index cheaply now |

## Security Mistakes

Domain-specific beyond generic OWASP hygiene (see Pitfall 6 for the structural fix).

| Mistake | Risk | Prevention |
|---------|------|------------|
| «It's LAN-only» as the security model | Any compromised LAN host (printer, visitor laptop, phished workstation) reaches the full hardware registry — serials, costs, who-has-what is a thief's shopping list | Auth + TLS even internally; the app assumes a hostile network |
| Unauthenticated static `/uploads` and API routes | Photos and JSON endpoints bypass the page login entirely | Single auth middleware covering pages, API, and static files |
| Plaintext or reversible password storage; no reset path | Trivial credential theft; permanent lockout | Argon2/bcrypt hash; CLI reset script shipped in v1 |
| No login rate limiting / no CSRF on mutations | Password brute-force from any LAN host; forged requests from a visited page | Rate-limit login (per-IP + global, trivial at one user); CSRF token on POST/PUT/DELETE |
| Photo EXIF preserved | GPS coordinates of company hardware locations published to anyone who can open the file | Strip EXIF at re-encode time |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Search requires near-exact serial | «Не найдено» for typos/homoglyphs → user distrusts the system, falls back to memory and calls | Normalized substring search across serial, inventory no., model (Pitfall 5); show «ничего не найдено» with the query echoed |
| Recording a movement takes many clicks/fields | State stops being updated in the rush → registry lies (Pitfall 2) | «Выдать» from the device card: pick employee (searchable), one confirm, done. Return: one tap |
| Free-text notes used for status/structured facts | The flagship filters («без апгрейда RAM») silently miss rows | Dedicated typed fields; notes only for genuinely free remarks |
| Archived employee vanishes everywhere | History shows blank/ID instead of «Иванов И. (уволен)» — разборки lose their evidence | Archived employees render in history context, excluded only from pickers |
| Retired/repair devices clutter the main list | The list of «что в строю» — the daily view — drowns | Default filter «активные»; списано/ремонт one click away; dashboard carries the totals |
| UI polish cycles before entry flows exist | Solo dev gold-plates cards while hundreds of devices remain unentered — value never materializes | Ship the fast-entry path first; Apple-aesthetic refinement is iterative polish, not a v1 blocker |

## "Looks Done But Isn't" Checklist

- [ ] **Movement timeline:** starts with a «поступление» event for every device; a wrong reassignment is corrected by a compensating event, not an edit — verify by reassigning a device 3× and reading the full timeline
- [ ] **Search:** works typed from memory (wrong case, Cyrillic keyboard on, partial serial), not only with copy-paste — verify with `abc123`, `АВС123` (Cyrillic), trailing space
- [ ] **Unique serials:** entering the same serial twice is rejected with a human message — verify double-entry attempt
- [ ] **Employee offboarding:** archive an employee with 5 devices; their history renders names, device list shows «не сдано», pickers hide them — verify no FK errors
- [ ] **Auth coverage:** `/api/*` and `/uploads/*` return 401/403 without a session, not just the HTML pages — verify with curl
- [ ] **Photos:** upload a real phone photo (HEIC if possible); renders in list thumb and card; EXIF stripped; over-limit upload rejected
- [ ] **Filters:** «ноуты без апгрейда RAM» returns zero rows only because none exist — not because the filter compares a typed column against note text
- [ ] **Warranty:** «истекает» catches devices within the window and highlights them; DATE math not string compare
- [ ] **Lists:** 300+ devices seeded — every list paginates, no page renders unbounded rows
- [ ] **Backup:** restore of DB + uploads into a clean directory actually performed once

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| History lost to mutable columns (Pitfall 1, shipped) | HIGH — lost past is unrecoverable | Add movements table now; backfill what's reconstructible (purchase records, user memory); accept the gap; never let it ship this way — prevention is the only real cure |
| Dirty serials after months of entry (Pitfall 5) | MEDIUM | One-time migration: recompute `serial_normalized` for all rows; dedupe report before adding the UNIQUE index; search switches to normalized column |
| EAV already built (Pitfall 3) | HIGH | Extract known attributes back to typed columns via migration; map/parse text values; drop EAV tables; do this before data volume doubles |
| Photo originals already stored (Pitfall 7) | LOW-MEDIUM | Batch re-encode with `sharp`, generate thumbs, strip EXIF, delete originals; add upload limits |
| Employee hard-deleted with history (Pitfall 4) | MEDIUM | Re-create the employee row (old ID if possible), mark archived; if ID lost, re-link movements by matching timeline context — painful, avoid |
| Stale statuses after months of drift (Pitfall 2) | MEDIUM | One reconciliation session: physical spot-audit per department, corrections entered as compensating events; then tighten the action-based flow |
| ERP creep mid-build (Pitfall 9) | HIGH — schedule, not code | Freeze: cut everything not in the Active requirements list into a backlog document; ship the registry; revisit only after real use |

## Pitfall-to-Phase Mapping

Suggested functional phases (roadmap will number them); verification column = how to prove prevention held.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Mutable history | Foundation (schema) + Movements | Timeline survives 3 reassignments + a correction event; movements table is append-only (no UPDATE path in code) |
| 2. Status drift | Movements/Actions | No UI path changes status/holder without an event; offboarding bulk-return exists |
| 3. EAV | Foundation (schema) | Schema review: typed columns + CHECK per type; no attributes/key-value table |
| 4. Delete orphans | Employees | Archive flow demo; no delete button; FK constraints on movements pass |
| 5. Serial search | Registry (normalized columns) + Search | Typing-test: mixed case, Cyrillic homoglyphs, partial serial all hit; UNIQUE index present |
| 6. Auth | Foundation (middleware first) | curl against `/api` and `/uploads` unauthenticated → 401; rate limit fires; reset script runs |
| 7. Photo storage | Photos | Phone-HEIC upload → ≤300 KB JPEG + thumb, EXIF gone, limit enforced |
| Performance traps | Every list phase + Dashboard | Seed 300+ devices; all lists paginated, eager-loaded; dashboard indexed queries |
| Import/manual-entry debt | Foundation (backup) + rollout | Backup restore rehearsed; CSV export button exists; no direct-CSV import path |
| 9. ERP scope creep | Planning (roadmap itself) | Roadmap phases contain only Active-requirement features; Out of Scope list from PROJECT.md untouched |

## Sources

- [Motadata — IT asset management challenges](https://www.motadata.com/blog/it-asset-management-challenges), [CyCognito — asset inventory management](https://www.cycognito.com/learn/attack-surface-management/asset-inventory-management/), [Kordon — asset inventory guide](https://kordon.app/blog/asset-inventory-management-guide/), [Virima — IT asset inventory](https://virima.com/blog/it-asset-inventory-management-a-complete-guide), [AssetIT — 5 inventory tracking pitfalls](https://assetit.app/avoid-these-5-crucial-it-inventory-tracking-pitfalls/), [Itemit — asset manager mistakes](https://itemit.com/blog/5-mistakes-asset-managers-make-and-how-to-avoid-them/) — data quality/staleness failure modes
- [Azure Architecture Center — Event Sourcing pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing), [RisingStack — event sourcing vs CRUD](https://blog.risingstack.com/event-sourcing-vs-crud/), [Nurkiewicz — event sourcing](https://nurkiewicz.com/2021/01/event-sourcing.html), [ACM — Online Event Processing](https://cacm.acm.org/practice/online-event-processing/), [PTS — database audit trails](https://pts-usa.com/custom-database-audit-trails/), [QuestDB — append-only log](https://questdb.com/glossary/append-only-log/) — append-only history / hybrid audit pattern
- [r/PostgreSQL — EAV or JSON](https://www.reddit.com/r/PostgreSQL/comments/1e8ep41/eav_or_json/), [DBA.SE — EAV vs JSONB](https://dba.stackexchange.com/questions/323092/choosing-between-entity-attribute-value-or-jsonb-representations), [Evolveum — JSONB vs EAV measurements](https://docs.evolveum.com/midpoint/projects/midscale/design/repo/repository-json-vs-eav/) — EAV antipattern, hybrid typed-columns + JSONB
- [PostgreSQL pg_trgm docs](https://www.postgresql.org/docs/current/pgtrgm.html), [SO — FTS with substrings](https://stackoverflow.com/questions/44284078/postgresql-full-text-search-with-substrings), [SO — leading-wildcard indexing](https://stackoverflow.com/questions/74409202/how-to-index-a-column-for-leading-wildcard-search-and-check-progress), [pgAnalyze — GIN indexes](https://pganalyze.com/blog/gin-index) — substring search mechanics, trigram constraints
- [brandur.org — soft deletion probably isn't worth it](https://brandur.org/soft-deletion), [HN discussion](https://news.ycombinator.com/item?id=32156009), [Marty Friedel — soft, hard or audit](https://www.martyfriedel.com/blog/deleting-data-soft-hard-or-audit), [SO — hard deletes with FKs](https://stackoverflow.com/questions/40165123/how-can-hard-deletes-work-when-foreign-keys-are-involved) — delete semantics
- [EasyAdmin #4055 — slow paginator COUNT](https://github.com/EasyCorp/EasyAdminBundle/issues/4055), [WooCommerce 500k-order admin stress test](https://www.reddit.com/r/Wordpress/comments/1viq0b8/i_built_a_500000order_woocommerce_store_to_find/) — dashboard/list degradation patterns
- [SO — image resize at upload vs serve](https://stackoverflow.com/questions/39260609/resize-image-when-uploading-to-server-or-when-serving-from-server-to-client), [SE — client vs server resizing](https://softwareengineering.stackexchange.com/questions/318535/image-resizing-client-side-vs-server-side), [r/webdev — client-side resize before upload](https://www.reddit.com/r/webdev/comments/1t2h3ds/should_we_implement_client_side_image_resizing/) — photo pipeline
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [Invicti — security misconceptions](https://www.invicti.com/blog/web-security/security-misconceptions-web-application-developers), [r/selfhosted — LAN-only services](https://www.reddit.com/r/selfhosted/comments/1cr6bs1/running_services_for_only_home_use_no_remote/), [Auth0 — common auth mistakes](https://auth0.com/blog/five-common-authentication-and-authorization-mistakes-to-avoid-in-your-saas-application/) — auth in internal/LAN tools
- [WooCommerce — CSV import duplicates](https://github.com/woocommerce/woocommerce/issues/18792), [SO — import suite creating duplicates](https://stackoverflow.com/questions/24452546/woocommerce-csv-import-suite-creating-duplicate-products), [Spiceworks — CSV serial import](https://community.spiceworks.com/t/import-csv-serial-number/496639) — import debt
- [Wikipedia — Second-system effect](https://en.wikipedia.org/wiki/Second-system_effect), [Retool — build vs buy for internal tools](https://retool.com/blog/build-vs-buy-guide-for-internal-tools), [ResearchGate — scope creep vs project success](https://www.researchgate.net/publication/342682685_The_Impact_of_Scope_Creep_on_Project_Success_An_Empirical_Investigation), [Envy Labs — perils of over-engineering](https://envylabs.com/insights/the-perils-of-over-engineering-software) — scope/over-engineering
- **[PE]** items: practitioner knowledge of the internal-tool/asset-registry domain — action-based state transitions, Cyrillic homoglyph normalization, backup discipline for solo LAN tools

---
*Pitfalls research for: Barahlo — internal IT asset tracking web app*
*Researched: 2026-08-31*
