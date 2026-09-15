# Feature Research: v1.1 «Скорость и удобство»

**Domain:** UX conventions for 5 new features in a single-operator internal device registry (50–200 employees, hundreds of devices, Russian UI, Apple aesthetics)
**Researched:** 2026-09-15
**Confidence:** MEDIUM

> Confidence rationale: conventions cross-checked across design-system primary sources (PatternFly, HashiCorp Helios, NN/g, shadcn/ui–cmdk docs, Next.js Learn) and fixed-asset-register templates (AssetPrime, MapTrack, Kladana, FMX). Web-search provider tier = MEDIUM (verified across ≥2 independent sources per load-bearing claim). Domain-internal claims (SQLite single-writer behavior, App Router layout persistence) are architecture reasoning — flag for phase-level verification. Deliberately excludes enterprise ITAM bloat (depreciation, approvals, label printing): PROJECT.md Out of Scope and single-operator context.

## Context That Shapes Every Category

One operator who knows employees by name; no concurrent editors; no self-service. Server-rendered App Router lists with URL-driven filters; SQLite via better-sqlite3 with queries proven at single-digit ms on 600 rows. Reusable v1.0 assets each feature builds on:

- **norm() UDF + homoglyph fold** (`lib/normalize.ts`) — same normalization must back all new search surfaces
- **Devices search-box conventions** — local echo is truth while typing, URL `?q=` syncs on debounce; CR-01/G-5-2 lessons (echo must never overwrite keystrokes, never trim-echo)
- **`/api/devices/export` route pattern** (D-18) — requireSession-first, shared `deviceWhere`, UTF-8 BOM + «;», CWE-1236 guard
- **`warrantyPredicate` composition** (a8c2bf7) — parity by construction between filters, colors, and now the CSV warranty-status column
- **`device_schema` typed field configs** — single source of truth for forms AND report columns
- **Movement server actions** (assign/accept/transfer/repair/dispose) with DISPLAY_TZ `occurredAt` handling (CR-01) — bulk variants must reuse, not fork, this logic
- **Employee card «Вернуть всю технику»** — already the mass-return path for one person; bulk selection must not duplicate it

---

## Category 1: Employee live search (live-поиск по имени/отделу)

**How mature tools do it:** Admin directories (Linear members, GitHub org members, Snipe-IT people list) treat list search as: input with instant local echo, debounced (~200–300 ms) URL-param update, server-side filtering, page reset to 1, result count, and a distinct no-results state. Search matches multiple fields (here: name AND department) with the app's canonical normalization.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Debounced live input, instant echo | A directory search requiring Enter feels broken in 2026 | LOW | Reuse devices search-box pattern verbatim; keep its two bug lessons (lastSynced-style sync guard; no trim-echo) |
| URL `?q=` as source of truth | Back button/bookmark must restore results; consistent with devices filters | LOW | Joins existing `filter`+`page` params; rebuild FULL query string (existing Pitfall-3 convention in employees page) |
| Match on name AND department, norm()-folded | «иван» hits «Иванов» and «IT» hits «ИТ»; Ё/Е, latin/cyrillic homoglyphs | LOW | `listEmployees` gains `q` param using the existing norm() UDF — no new normalization code |
| Reset to page 1 on new query | Stale `?page=5` with a narrow result set is a dead page | LOW | Page clamp already exists; resetting avoids landing on clamped last page |
| Empty state «Ничего не найдено по запросу…» | UI-SPEC copywriting contract | LOW | Distinct from the «Пока нет сотрудников» zero-data state |
| Pending feedback without blocking input | Standard | LOW | `useTransition` `isPending` → subtle indicator; input stays responsive (Next.js Learn canonical pattern) |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Prefix-first ordering | «Ива» → «Иванов» before «Забиванов» | LOW | `ORDER BY starts-with DESC, name` — cheap, feels smart |
| Match highlighting in results | Faster scanning, Apple polish | MEDIUM | Non-trivial with norm-folding (highlight index ≠ source index across Ё/homoglyphs); highlight only clean case-insensitive matches or skip entirely |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Fuzzy/typo-tolerant search (Levenshtein, fuse.js) | «на случай опечаток» | 50–200 records the operator knows by name; homoglyph fold already covers the real typo class (latin/cyrillic); extra dependency + tuning noise | Substring + norm fold |
| Operator syntax (`dept:it иван`) | Power-user feel | One operator; syntax needs teaching, saves nothing at this scale | One input, both fields |

**Dependencies on existing features:** extends employees page + `listEmployees` query only. Independent of other v1.1 features; **unblocks ⌘K** (shared matching logic and the employees side of the palette index).

---

## Category 2: ⌘K global palette (устройства + сотрудники → карточка)

**How mature tools do it** (cmdk/shadcn `CommandDialog`; Linear, Raycast, GitHub; Solomon's ex-Linear guidance): a modal opened by ⌘K **plus a visible affordance with a kbd hint** (discoverability — nobody finds a hotkey by accident). Results are grouped in labeled sections whose groups auto-hide when empty; ↑↓/Enter/Esc keyboard loop with autofocus input; the empty-query default state shows recents or top actions; a «Ничего не найдено» state; the palette is for **jumping and quick actions, not forms** — Solomon explicitly warns that pulling form flows into the palette "will increase complexity a good deal." Keep the handoff dumb: select → `router.push` → close.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| ⌘K / Ctrl+K hotkey + visible search button in nav with «⌘K» hint | Discoverability + muscle memory | LOW | `preventDefault`; opens even when focus is in another input (it's modal) |
| Grouped results: «Техника», «Сотрудники», «Переход», «Действия»; groups auto-hide when empty | Scanning; category convention | LOW | cmdk `CommandGroup` heading; «Переход» = Дашборд/Техника/Сотрудники; «Действия» = Добавить сотрудника, Добавить устройство, Скачать ведомость |
| Search devices (model/serial/инвентарник) + employees (name/отдел), norm-folded | Consistency with in-list search; «Tech» results show model + serial/инвентарник, employees show name + отдел | MEDIUM | Load a lightweight index on first open (id, kind, title, secondary) — few hundred rows is one single-digit-ms SQLite query; then filter **client-side** in cmdk. No per-keystroke server roundtrips |
| Keyboard loop ↑↓ / Enter / Esc, focus trap, autofocus | Table stakes of every palette | LOW | `CommandDialog` provides it; known pitfall: cmdk list scrolling inside dialogs |
| Empty-query default state | Palette must never open broken/blank | LOW–MEDIUM | Minimum viable default: «Переход» + «Действия» groups (static, zero storage). Recents = differentiator below |
| Empty state «Ничего не найдено» | Convention | LOW | `CommandEmpty` |
| Result cap per group (~5–7) + escape hatch | Palettes truncate; the operator sometimes wants the full list | LOW | «Показать все» row → navigates to the list page with `?q=` prefilled (reuses live search) |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Recent items (5 last opened devices/employees) as default state | A single operator re-opens the same cards all day — highest-value default; Linear/Raycast convention | MEDIUM | localStorage, written on card visits (or palette selections); prune recents pointing at archived employees/disposed devices on render |
| «Скачать ведомость» action in palette | One hotkey to the audit report (pairs with Category 3) | LOW | Once the full-report endpoint exists |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| In-palette forms / multi-step flows (VS Code-style «выдать» inside palette) | Feels powerful | Solomon: sharp complexity growth; Next.js dialogs via server actions are already fast | Select → close → dialog/page |
| Heavy fuzzy-scoring engine (fuse.js) | Typo tolerance | Hundreds of rows; cmdk filter + norm fold suffice; extra kB + tuning | cmdk built-in filter |
| Full-text search across notes/movements/photos | «Найти вообще всё» | Freeform notes = noise; SQLite FTS + sync burden for one user | Existing serial/инвентарник/model search |
| Command registry/plugin architecture (scores, providers, API) | Future-proofing | Single operator, single developer — pure over-engineering | Static groups in one component |

**Dependencies on existing features:** index fetch reuses existing queries; matching reuses norm UDF. Technically independent of employee live search but ordered **after** it (shared matching extracted once). Uses existing employee combobox conventions if any action items appear (they don't in v1.1 — navigation only).

---

## Category 3: CSV-ведомость полного контекста

**How mature tools do it:** The fixed-asset register (FAR) is a stable, documented, **one row per asset** column set covering identification, assignment, financials, warranty, status (AssetPrime/MapTrack/Kladana/FMX templates converge on this). Exposed as one explicit «Ведомость» export of **all data** — a different mental model from ad-hoc filtered exports (audit/insurance wants the dump, not the current view). Kladana's minimum viable register: asset ID, name/category, acquisition date, cost; everything else enriches.

**Recommended columns (Russian headers, stable order):**

1. Инвентарный № (empty allowed — optional in schema)
2. Серийный №
3. Тип (ноутбук/монитор/док-станция/периферия)
4. Модель
5. Статус (на складе/выдан/ремонт/списан)
6. Сотрудник (ФИО; empty if unassigned; «(архив)» suffix if an archived employee still holds it)
7. Отдел
8. … Config fields per type from `device_schema` — **one flat union table** (type-specific columns empty for other types; per-type sections break Excel pivot/filtering, which is exactly what accounting does with this file)
9. Стоимость, Дата закупки (ISO), Гарантия до (ISO), **Гарантия (ок / истекает / истекла** — text of the same 3-state `warrantyPredicate` behind the colors), Заметки, Добавлен (created_at — cheap audit anchor)

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Superset column list above (owner + отдел + config + warranty + cost) | This IS the feature; FAR convention | MEDIUM | JOIN employees for owner/отдел; config columns driven by `device_schema` configs (same source as forms — no parallel field list) |
| Ignores current filters — always full dump | Audit/insurance ≠ current view; two intents, two affordances | LOW | Separate route or `?scope=full`; do NOT overload the existing filtered export |
| Same export contract as v1.0 | Proven + security-reviewed | LOW | requireSession-first, UTF-8 BOM, «;», CWE-1236 guard; extract shared helper; dated filename `vedomost-2026-09-15.csv` |
| Warranty status as TEXT from the same predicate | Colors don't survive CSV; filter-hit ≠ green parity must extend to the report (parity-by-construction decision a8c2bf7) | LOW | Compose `warrantyPredicate`, don't reimplement |
| ISO dates, empty cells for N/A, «;» + BOM | Excel-on-double-click for accounting; «;» makes RU decimal commas safe | LOW | Already the v1.0 contract |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| «Добавлен» (created_at) column | Audit anchor at near-zero cost | LOW | |
| «Ведомость» button on dashboard in addition to devices page | The report-minded moment starts at the dashboard | LOW | |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| XLSX generation | Prettier, formulas | New heavy dependency (exceljs/sheetjs) in a route; CSV+BOM already opens cleanly | Keep CSV |
| Depreciation / book-value / salvage columns | Real FARs include them | No accounting integration in scope; the data doesn't exist; classic ITAM bloat | Cost + purchase date — what the operator actually has |
| PDF ведомость | «Красиво для печати» | Layout maintenance; nobody asked | Excel print |
| Totals/subtotals rows in the file | Convenience | Break machine consumption (pivots, re-imports) | Excel formulas by the consumer |

**Dependencies on existing features:** built entirely on the existing export route, `lib/csv`, `device_schema`, `warrantyPredicate`, queries. **Independent of all other v1.1 features — cheapest of the five.** New clone-created devices appear automatically (no coupling).

---

## Category 4: Clone устройства с автоприростом инвентарника

**How mature tools do it** (shadcn duplicate-record block; Backpack clone; Django admin «save as new»): «Дублировать» opens the regular create dialog **prefilled** from the source; physically-unique fields (serial) are cleared; business identifiers (инвентарник) are auto-suggested but editable; numbering is computed **server-side at save**, never at dialog-open (stale values collide); relations (owner, movement timeline, photos) are **not copied** — every framework defaults to not cloning relations; the clone starts life unassigned/in stock; the DB UNIQUE constraint is the real uniqueness defense (koder.ai layered defenses; OutSystems forum).

**Auto-increment convention:** extract the numeric tail from existing inventory numbers («МОН-0142» → 0143; «142» → 143); a pattern with no numbers → leave blank for manual entry. Compute max-at-save inside the create transaction — SQLite single-writer makes this race-free for one operator; UNIQUE index as backstop.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| «Дублировать» on device card | Retyping 10 fields × 20 units is the exact pain being solved | LOW | Reuse `DeviceDialog` with prefilled field configs (server-serialized configs already exist) |
| Serial cleared (must be entered anew) | Serials are physically unique — two units never share one | LOW | zod `min(1)` already forces re-entry |
| Инвентарник auto-suggested (next number), editable | Requested behavior, but the operator may have manual numbering gaps | MEDIUM | Generate server-side **on save**; editable override; UNIQUE index backstop |
| Photos NOT copied, timeline NOT copied, owner NOT copied | A clone is a different physical object; copying relations corrupts the audit trail | LOW | Explicitly omit; created «на складе», unassigned, empty timeline |
| Purchase date / cost / warranty copied | Same procurement batch — that's the scenario (20 monitors bought together) | LOW | |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| «Количество: N» in the clone dialog → N units in one submit, инвентарники sequenced, serials blank | THE stated scenario («купил 20 одинаковых мониторов»); without it the operator repeats clone ×20 | MEDIUM | One transaction; per-unit inventory increment; result toast «Создано 20 устройств: МОН-0143…0162» |
| «Дублировать» in list-row menu | Faster than opening the card | LOW | |
| «Без серийника» visibility for batch-created units | Batch creates leave serials blank; «заполнить серийники» is the natural follow-up chore | MEDIUM | Arguably a mini-feature — defer unless a serial='' filter falls out for free |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Copying photos/timeline to clones | «Полный клон» | Same photos on 20 serials is a data-integrity lie; movement history becomes fiction | Never copy relations |
| One global auto-number counter for all devices | Simplicity | RU inventory numbers conventionally carry type prefixes; operator already assigns patterned numbers | Per-pattern next-number |
| Excel-import as the «batch» answer | Sounds adjacent | Explicitly Out of Scope in PROJECT.md; a different problem (parsing/mapping) | Clone + N-batch covers procurement |
| Clone from palette / multi-select clone | Reach | The action belongs to one known source device; bulk-clone semantics confuse | Card + row menu only |

**Dependencies on existing features:** create action + `device_schema` validation (exist); inventory next-number query (new, trivial). Independent of other v1.1 features. **N-batch depends on single clone existing** (extends its dialog and action).

---

## Category 5: Bulk-выдача/приём (multiple devices at once)

**How mature tools do it** (PatternFly Bulk Selection, HashiCorp Helios Table Multi-Select, NN/g bulk-action guidelines, SaaS UI): header **tri-state** checkbox selects the current page (PatternFly semantics: nothing→select page; partial/full→clear all); a clickable count label + contextual action bar appears when selection > 0; **selection persists across pagination** with the count reflecting all pages; the "select all N across all pages" option is a *separate explicit* affordance, often omitted; irreversible bulk ops get a summary confirmation with the exact count; for reversible ops, NN/g prefers feedback/clear over modal confirmation; per-item results are reported when some items can't take the action.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Row checkboxes + tri-state header («выбрать страницу») | Base interaction of every bulk UI | MEDIUM | New client island on the devices list; header semantics per PatternFly |
| Selection persists across pagination | Selecting 30 devices across 2 pages then losing them is the classic betrayal | MEDIUM | Selection state must live **above the page**: client provider in the devices route (App Router layouts persist across sibling-page navigations); store `Set<deviceId>`. **Architecture note — flag for phase research:** verify provider placement against the current page/card route split (`(app)/devices` vs `(card)/devices/[id]`) |
| Contextual action bar with count: «Выбрано: 12 · Выдать · Принять · Снять» | Standard; makes scope visible | LOW | Fixed bar (top or bottom of list), Apple-style quiet pill |
| «Выдать N» → one dialog, employee combobox for the whole batch | The real flow is a workplace set (ноут+док+монитор) to ONE person; per-device dialogs ×12 defeat the purpose | MEDIUM | Reuses the existing employee combobox (value=name convention, bb5674e); the dialog IS the confirmation — shows employee + count |
| Per-item validation with result report | Some items can't take the action: issuing an already-issued device, returning a device that's in stock/disposed after selection | MEDIUM | Server action validates per item; **all-or-nothing in one SQLite transaction** recommended (partial batches leave confusing half-states); report «Выдано 12, пропущено 1 (уже выдано)» |
| Clear selection after success + revalidate | Rows changed state; stale selection confuses the next pass | LOW | `revalidate` + clear `Set` |
| No heavy confirm for issue/return | NN/g: reversible actions want feedback, not ceremony; «Принять» undoes «Выдать» | LOW | Summary dialog doubles as confirmation; no «вы уверены» layer |
| Pending-safe submit | Double-click → double movements | LOW | Disable buttons while pending; action is transactional |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Batch `occurredAt` display-TZ handling per item | «Выдал вчера» keeps time-of-day for all N movements (CR-01 convention) | LOW | Already solved — apply per item, no fork |
| Selection survives filter/search changes | Convenience | LOW–MEDIUM | Persist ids; rows outside the result set stay selected but inert; count label reflects it (PatternFly behavior) |
| Shift+click range selection | Power selection on 20-row pages | LOW | Nice-to-have |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| «Выбрать все N по фильтру» across pages | Sounds like the power move | Needs a server-side bulk-by-filter surface; **largely redundant**: the employee card already mass-returns («Вернуть всю технику»), and filters already scope the working set | Page selection + filters + employee-card mass return |
| Undo/rollback for bulk ops | NN/g likes undo | Undoing «выдать 12» = 12 inverse movements + timeline noise; the operator just confirmed the summary themselves | Result report + per-device «Принять» |
| Bulk edit of attributes (RAM, cost…) | Symmetric to bulk issue | One mis-click mass-corrupts typed data; no stated scenario | Per-device edit |
| Per-device confirmation modals | Safety theater | ×12 modals destroy the speed gain | One summary dialog |
| Selection persisted to URL/localStorage | Refresh-proofing | Hundreds of ids in URLs; stale ids after edits | In-memory for the working session |

**Dependencies on existing features:** refactors `assignDeviceAction`/`acceptDeviceAction` transactional cores into a batch-capable helper (array in, per-item results out); movement schema TZ handling reused; devices list gains a selection island (layout-persistence architecture question). Independent of palette/search/clone/CSV. **Highest architectural complexity of the five.**

---

## Feature Dependencies

```
[Employee live search]
    └──unblocks──> [⌘K palette]   (shared norm-matching; employees enter the index)
                       └──optional-loose──> [«Скачать ведомость» action] (once Category 3 exists)

[Clone single] ──extends──> [Clone N-batch]

[Bulk issue/return]      (independent; biggest lift — selection architecture)
[CSV full ведомость]     (independent; smallest lift — extends export route)
```

### Dependency Notes

- **Palette requires employee search (soft):** both consume the norm-folding matcher; extracting it once avoids two implementations. Palette is buildable without it but ordering search → palette removes rework.
- **N-batch requires single clone:** same dialog and action, plus a quantity loop.
- **Bulk issue/return conflicts with nothing** but touches the devices list architecture — schedule it where list-page churn is acceptable; CSV/clone don't touch the list.

## MVP Definition (v1.1)

All five features are committed in PROJECT.md Active; the question is per-feature scope and ordering.

### Launch with (v1.1 core)

- [ ] Employee live search — table stakes only (smallest; first — unblocks palette)
- [ ] ⌘K palette — groups + actions + empty states; static default state (no recents yet)
- [ ] CSV full ведомость — full column set, ignores filters, same export contract
- [ ] Clone single — dialog reuse, serial blank, inventory auto-increment on save
- [ ] Bulk issue/return — page-scoped persistent selection, batch issue to one employee, per-item result report

### Add after validation (v1.1.x polish)

- [ ] Clone N-batch («Количество: 20») — the scenario works single-shot day one; batch is a multiplier
- [ ] Palette recents (localStorage)
- [ ] Match highlighting in search results (only if clean-match implementation holds up)

### Future consideration (v2+ / never)

- [ ] Cross-page select-all by filter — redundant with «Вернуть всю технику» + filters
- [ ] Palette contextual per-card actions, in-palette forms — complexity trap (Solomon)
- [ ] Undo for bulk ops — inverse movements + timeline noise for a one-person tool
- [ ] XLSX/PDF, depreciation columns, fuzzy search, barcode/label printing — enterprise ITAM gravity, all Out of Scope

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Employee live search | HIGH | LOW | P1 (first) |
| ⌘K palette | HIGH | MEDIUM | P1 |
| CSV full ведомость | HIGH | LOW | P1 |
| Clone single | HIGH | LOW–MEDIUM | P1 |
| Clone N-batch | HIGH (the literal scenario) | MEDIUM | P2 |
| Bulk issue/return | HIGH | HIGH (selection architecture) | P1, latest phase |

## Sources

- PatternFly — Bulk Selection (select page vs select all, tri-state, count label, persistence): https://www.patternfly.org/patterns/bulk-selection — MEDIUM
- HashiCorp Helios — Table Multi-Select (page-level vs table-level scope): https://helios.hashicorp.design/patterns/table-multi-select — MEDIUM
- NN/g — Bulk Actions: 3 Design Guidelines (select all, contextual bar, undo > confirm): https://www.nngroup.com/videos/bulk-actions-design-guidelines/ — MEDIUM
- SaaS UI — Bulk Actions & Multi-Select UX (select-all semantics as the most-botched decision): https://www.saasui.design/blog/saas-bulk-actions-ux-patterns — MEDIUM
- Eleken — Bulk Action UX: 8 Design Guidelines: https://www.eleken.co/blog-posts/bulk-actions-ux — MEDIUM
- Solomon (ex-Linear) — Designing Command Palettes (actions vs search, keyboard handoff, contextual scope, in-palette complexity warning): https://solomon.io/designing-command-palettes/ — MEDIUM
- uxpatterns.dev — Command Palette pattern (shortcuts, fuzzy search, discovery): https://uxpatterns.dev/patterns/advanced/command-palette — MEDIUM
- shadcn/ui Command (cmdk) — CommandDialog/CommandGroup/CommandEmpty contracts: https://ui.shadcn.com/docs/components/base/command — MEDIUM
- Next.js Learn — Adding Search and Pagination (URL params + debounce canonical): https://nextjs.org/learn/dashboard-app/adding-search-and-pagination — MEDIUM
- Aurora Scharff — Advanced search-param filtering with useTransition (pending-state caveats): https://aurorascharff.no/posts/managing-advanced-search-param-filtering-next-app-router/ — MEDIUM
- Asset register column sets: AssetPrime (https://assetprime.org/asset-register-format), MapTrack (https://www.maptrack.com/templates/asset-register-template), Kladana FAR template (https://www.kladana.com/blog/financials/fixed-asset-register-excel-template/), FMX (https://www.gofmx.com/blog/fixed-asset-report/) — MEDIUM
- Clone conventions: shadcn.io CRUD Duplicate Record block (https://www.shadcn.io/blocks/crud-duplicate-record), Backpack Clone Operation (https://backpackforlaravel.com/docs/7.x/crud-operation-clone), koder.ai — Preventing duplicate records (layered defenses, DB constraint as backstop): https://koder.ai/blog/prevent-duplicate-records-crud — MEDIUM

---
*Feature research for: Barahlo v1.1 «Скорость и удобство» — single-operator device registry*
*Researched: 2026-09-15*
