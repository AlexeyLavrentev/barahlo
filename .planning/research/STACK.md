# Stack Research — v1.1 «Скорость и удобство» (milestone delta)

**Domain:** Stack additions for 5 new features on the existing Barahlo app (corporate device registry, single operator, Russian UI, LAN Docker deploy)
**Researched:** 2026-09-15
**Confidence:** HIGH overall — every claim cross-checked against the actual codebase (`package.json`, `components/ui/*`, `db/queries/*`, `lib/csv.ts`, route handlers) and npm registry on 2026-09-15

## Executive Verdict

**Zero new npm dependencies for the entire v1.1 milestone.** All five features are compositions of already-installed, already-UAT-proven capabilities. `npm install` runs zero times this milestone; the Docker image and the sharp-from-source native build are untouched. The one genuinely contentious call — ⌘K palette: cmdk vs Base UI — resolves firmly to the Base UI primitives already wrapped in `components/ui/` (rationale below). What this milestone buys is *code*, not *packages*: two search islands, one palette component, one server action + NULL-inventory rule, one selection island + two bulk actions, and ~4 extra columns in the CSV route.

## Recommended Stack (delta by feature)

### 1. Employee live search — existing stack sufficient

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `DeviceSearchBox` island pattern (copy) | in-repo (`app/(app)/devices/search-box.tsx`) | Debounced input island | 300 ms debounce, `router.replace`, URL-as-state, `lastSynced`/`inFlight` reconciliation — all three UAT keystroke-loss bugs (G-5-1, G-5-2, CR-01) are already fixed in this pattern. Copy it; do not write a second debounce from scratch. |
| Employees `query-params` module (new, ~30 lines) | in-repo pattern (`devices/query-params.ts`) | `q` param parse/normalize | Same sentinel-strip discipline as devices. **Confidence: HIGH** (pattern proven in-repo). |
| `norm()` UDF in WHERE | better-sqlite3 13.0.3, registered in `db/index.ts:25` | Fold name/department at query time | Same approach as model search (Key Decision, probe-verified). Employees ≤200 rows + departments — sub-ms. **No schema change, no migration** (employees get no `*_normalized` twin; the UDF-in-WHERE pattern is the sanctioned one). |

**Integration points:** `listEmployees` in `db/queries/employees.ts` gains an optional `{ q }`; `employees/page.tsx` mounts the island; `loading.tsx` already exists for the swap.

### 2. ⌘K global palette — existing stack sufficient (the decision that matters)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `components/ui/dialog.tsx` | @base-ui/react 1.7.0 (installed; latest 1.8.0) | Modal shell | Full wrapper already present (Portal/Overlay/Content/Title/Description). |
| `components/ui/combobox.tsx` | @base-ui/react 1.7.0 | Search input + grouped results + keyboard nav | Already exports `ComboboxGroup`, `ComboboxGroupLabel`, `ComboboxEmpty`, `ComboboxCollection` — the exact anatomy of a palette (Устройства / Сотрудники groups, empty state, arrow-key highlight). **Combobox-inside-Dialog is already in production** (`movement-dialogs.tsx`, `employee-dialog.tsx`) with the UAT-proven items-on-Root + `ComboboxCollection` contract (Key Decision 7e400c9). |
| Plain `useEffect` keydown listener | React 19.2.8 | ⌘K / Ctrl+K toggle | ~10 lines. `metaKey` (macOS) / `ctrlKey`, ignore when a text input owns focus or open. |
| Server action or `GET /api/search` route | Next 16.3.3 (in-repo) | Debounced result fetch | Both transports already exist in the app (`app/(app)/*/actions.ts`, `app/api/devices/export`). Route handler GET + `<a>`-style navigation has one less moving part; server action avoids a new route. Either is a roadmap detail. |
| Query: LIKE over `norm()`-folded columns | better-sqlite3 13 | Match model/serial/inventory + name/department | Reuses the devices search predicate shape; hundreds of rows → sub-ms (validated 0.76 ms @ 600 rows). Results jump via `router.push('/devices/[id]' | '/employees/[id]')` — both card routes exist. |

**Confidence: HIGH** — composition verified in-repo; @base-ui/react 1.8.0 exists on npm but 1.7.0 already ships every primitive used here; the 1.7→1.8 bump is optional and should not ride along with this milestone.

### 3. CSV ведомость полного контекста — existing stack sufficient, no new dep (confirmed)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `lib/csv.ts` (`esc`, `buildCsv`, `csvResponseHeaders`) | in-repo, vitest-pinned | The entire file format layer | BOM, «;», CRLF, CWE-1236 tab-prefix guard, RFC 5987 dual filename — done and tested. **The v1.1 delta is data, not code.** |
| `exportDevices` + `/api/devices/export` route | in-repo | Add columns | Current export already carries: Тип, Модель, Серийник, Инвентарник, Статус, Держатель, Отдел, RAM, RAM апгрейдена, SSD, Дата закупки, Стоимость, Поставщик, Гарантия до, Заметки. Missing only the per-type fields the schema already stores: `screenDiagonal`, `panelType` (мониторы), `portCount` (доки), `peripheralKind` (периферия). Extend the select + HEADER + cells — route-file change only, zero-drift contract (one parser, one `deviceWhere`) untouched. |

papaparse/json2csv/csv-stringify remain prohibited (v1.0 decision T-05-SC stands): the injection guard must stay hand-rolled anyway, so a parser adds supply-chain surface for nothing.

### 4. Device clone with inventory auto-increment — existing stack sufficient; one product decision to surface

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| New `cloneDeviceAction` server action | Next 16.3.3 + drizzle 0.45.2 | Copy row inside `db.transaction` | Reads `getDevice(id)`, strips identity fields, calls `createDevice` — both exist. Photo attachments are **not** cloned (they live on disk under `data/uploads/`; copying rows without bytes would 404). |

**The auto-increment conflict (flag for roadmap, not a stack gap):** D-16 says inventory numbers are *manual, assigned by 1C*; D-17 puts a UNIQUE index on `inventoryNormalized`. SQLite UNIQUE allows multiple NULLs, so **cloning with `inventoryNumber = NULL` requires zero migration and violates nothing** — the operator backfills real numbers from 1C. Generating numbers (`MAX+1`) would (a) reverse Key Decision D-16 and (b) squat or collide with 1C's numbering space. Verdict: implement clone-with-NULL and treat "автоприрост" as a *numbering-policy* decision the owner must make; if a placeholder is wanted, render «не присвоен» in UI from NULL — do not synthesize a stored number.

### 5. Bulk issue/return — existing stack sufficient

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `components/ui/checkbox.tsx` | @base-ui/react 1.7.0 | Row + header select-all checkboxes | Already wrapped and in production (`device-dialog.tsx` ramUpgraded). No selection library justified for a 20-row server-rendered page. |
| One client island holding `Set<number>` | React 19.2.8 (`useTransition`) | Selection state across the table region | Server renders rows as today; the island wraps the table (or uses per-row checkbox islands + a bulk-bar island via a tiny context). Selection is scoped to the current page — cross-page "select all matching filter" re-resolves ids server-side from the shared filter predicate if the roadmap wants it. |
| New `bulkAssignAction(ids, employee)` / `bulkAcceptAction(ids)` | Next 16.3.3 + drizzle | Loop existing per-device logic in one `db.transaction` | better-sqlite3 is synchronous with a single connection — N movements (N ≤ 20, one page) in one transaction is atomic and single-digit ms. Each iteration records a movement row, preserving the timeline invariant. Validate every id server-side (status must permit the transition) — never trust the client batch. |

TanStack Table, react-select-style multi-select, or a job queue are all massive overkill for one operator and one page of rows.

## Installation

```bash
# Nothing to install. Zero new dependencies this milestone.
# (Optional, standalone, not required for any v1.1 feature:)
# npm install @base-ui/react@1.8.0   # minor bump; verify combobox data-* hooks against globals.css overrides if taken
```

## Alternatives Considered

| Recommended | Alternative | When the Alternative Would Win |
|-------------|-------------|-------------------------------|
| Base UI Dialog + Combobox palette (in-repo) | **cmdk 1.1.1** (npm-verified 2026-09-15) | Apps needing built-in fuzzy ranking, hierarchical submenu commands, or vim-style bindings across many roots. Here it is strictly worse: cmdk hard-depends on `@radix-ui/react-dialog` ^1.1.6, `@radix-ui/react-id`, `@radix-ui/react-primitive`, `@radix-ui/react-compose-refs` — dragging the Radix overlay/focus stack into a Base UI-only app (two dialog systems, duplicated a11y layers, ~+15 kB) for functionality the existing combobox wrapper already has. Note: shadcn/ui's `command` component — *including its "base" variant* (verified ui.shadcn.com/docs/components/base/command) — is still cmdk-backed, so `shadcn add command` does NOT avoid Radix. |
| ~10-line `useEffect` hotkey listener | react-hotkeys-hook 5.3.3 | Apps with dozens of bindings, scopes, or callback refs. One global ⌘K does not justify a dep. |
| LIKE + `norm()` UDF | **SQLite FTS5** (`unicode61`/trigram) | ≥10k rows, token/prefix semantics, or BM25 ranking. At hundreds of rows a linear scan is sub-ms; FTS5 is token-based (loses substring matching — the product's search is substring-first), trigram requires ≥3-char queries, and unicode61 folds differently from the project's homoglyph-aware `norm()`. Would also add a virtual table + triggers to the frozen generate+migrate discipline for zero perceivable gain. |
| Hand-rolled `lib/csv.ts` (status quo) | papaparse / json2csv / csv-stringify | Only if CSV *import* ever leaves Out-of-Scope. Export already works and the CWE-1236 guard must stay hand-rolled regardless. |
| Base UI checkbox island on server-rendered rows | TanStack Table v8 | Client-side sort/filter/pagination over large datasets. This app paginates server-side with URL-filters — TanStack would fight the architecture. |
| Server actions + transitions | TanStack Query / SWR for the palette fetch | If the palette ever needed cache-deduped cross-view fetching. A debounced single-endpoint call doesn't. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| cmdk + any `@radix-ui/*` package | Second overlay system beside Base UI; 4 transitive deps; shadcn "base" command is still cmdk underneath | `components/ui/dialog.tsx` + `components/ui/combobox.tsx` composition |
| FTS5 / trigram indexes | Wrong semantics (token vs substring), Cyrillic fold mismatch with `norm()`, migration weight, no measurable win at hundreds of rows | LIKE over `norm()`-folded values (existing pattern) |
| papaparse / json2csv / csv-stringify | Export is solved; injection guard must stay hand-rolled (CWE-1236) | `lib/csv.ts` as-is |
| Selection/table libraries (TanStack Table, react-data-grid) | 20 rows/page, server-rendered, URL-filtered — a library would own state the URL already owns | Checkbox island + `Set<number>` |
| Any new native dependency | sharp is already built from source in the Docker image; each added native module re-risks the Ubuntu amd64 build for zero feature value | — (this milestone adds none) |
| Stored auto-generated inventory numbers | Reverses D-16 (1C-assigned) and risks D-17 UNIQUE collisions/squatting | Clone with NULL inventory; UI renders «не присвоен» |

## Stack Patterns by Variant

**⌘K result ranking:** single combined query, devices first then employees, cap ~8 per group; fold via `norm()`. If ranking is ever needed, rank in JS over the ≤16 candidates — not in SQL.

**Palette fetch transport:** prefer one server action `searchAll(q: string)` returning `{ devices: [...], employees: [...] }` (zod-validated, `requireSession` in action). A GET route handler is the fallback if the action's POST-per-keystroke debounce feels heavy — both are in-repo patterns.

**Bulk transaction shape:** `db.transaction((tx) => { for (const id of ids) { validate(tx, id); move(tx, id, ...) } })` — hoist the existing `assignDevice`/`acceptDevice` query functions to accept a `Tx` handle (the `resolveDepartmentId(tx, …)` precedent exists in `db/queries/employees.ts`).

**Clone field policy:** copy model/type/per-type fields/supplier/notes; reset status → «на складе» (or current default), holder → NULL, warranty/purchase per roadmap decision (warranty usually starts per unit — likely keep, flag for spec), photos never copied.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| @base-ui/react 1.7.0 (installed) | react 19.2.8, latest on npm: 1.8.0 | 1.7.0 ships every primitive this milestone needs; bump optional, verify token overrides in `globals.css` after any bump |
| cmdk 1.1.1 (rejected) | @radix-ui/react-dialog ^1.1.6 + 3 radix transitives | Would introduce Radix into a Base UI project — rejected |
| next 16.3.3 (custom build) | Server actions callable from client islands | Verified in-repo (`search-box.tsx` comment contract; `movement-dialogs.tsx`); do not consult public Next docs for behavior — use `node_modules/next/dist/docs/` if a question arises during implementation |
| better-sqlite3 13.0.3 | `norm()` UDF (`deterministic: true`) usable inside WHERE/ORDER BY | Already used by model search — same mechanism the new searches reuse |

## Sources

- Codebase (highest confidence, read 2026-09-15): `package.json`, `components/ui/{dialog,combobox,checkbox}.tsx`, `app/(app)/devices/search-box.tsx`, `db/queries/{devices,employees}.ts`, `db/queries` transaction precedent, `lib/csv.ts`, `app/api/devices/export/route.ts`, `db/schema.ts` (D-16/D-17 constraints), `db/index.ts` (norm UDF)
- npm registry (fetched 2026-09-15): @base-ui/react 1.8.0, cmdk 1.1.1 (+ its dependency manifest showing 4 @radix-ui packages), react-hotkeys-hook 5.3.3 — **Confidence: HIGH**
- ui.shadcn.com/docs/components/base/command — the "base" Command component is cmdk-backed, not Base UI primitives (fetched 2026-09-15) — **Confidence: HIGH**
- base-ui.com/react/components/combobox — Combobox+Dialog composition as the palette pattern — **Confidence: HIGH** (cross-checked with in-repo usage)
- sqlite.org/fts5.html + community threads — FTS5 vs LIKE scale crossover (~100k docs) and unicode61 Cyrillic folding vs ASCII-only LIKE — **Confidence: MEDIUM** (scale claim is community consensus, not benchmarked here; irrelevant at this dataset size either way, since `norm()` already supersedes the folding concern)

---
*Stack research for: Barahlo v1.1 «Скорость и удобство» milestone delta*
*Researched: 2026-09-15*
