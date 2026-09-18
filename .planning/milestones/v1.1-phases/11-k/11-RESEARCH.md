# Phase 11: ⌘K глобальная палитра - Research

**Researched:** 2026-09-18
**Domain:** Next.js 16 App Router client islands — global hotkey palette over existing search backends (Base UI Dialog/Autocomplete, no new deps)
**Confidence:** HIGH (codebase-verified extension points + vendored Base UI/Next docs of the exact installed versions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Транспорт и контракт поиска**
- **D-01:** Транспорт поисковой поверхности — **GET-роут** `/api/search` (закрывает STATE blocker [Phase 11]): requireSession() первым действием, GET-only, парсинг q через существующие правила (trim, cap 100, фолд), LIMIT-кап на сервере, `Cache-Control: no-store`, ответ — JSON обеих групп. Прецеденты: `/api/devices/export` и `/api/attachments` (роут-паттерн, requireSession-first, заголовки). Server action отвергнут: палитре нужен фетч с AbortController на каждый ввод и отсутствие интерактивных сайд-эффектов. — Reversibility: reversible — тонкий роут над существующими предикатами; транспорт меняется одной функцией-фетчем
- **D-02:** Один запрос ищет обе сущности: роут зовёт существующие listDevices-предикат и employeeSearchPredicate (фазы 5/7) — «палитра находит то, что находит список» (SC 2), без второго поискового движка. ФИО/модели через те же русские сортировки.
- **D-03:** Контракт данных (SC 4): палитра перезапрашивает при КАЖДОМ открытии и по мере ввода (AbortController отменяет предыдущий), результаты не переживают закрытие (стейт умирает с палитрой), никакой персистентности/недавних запросов.

**UI/UX палитры**
- **D-04:** Открытие: keydown по `event.code === 'KeyK'` с cmd/ctrl — работает на русской раскладке (SC 1); повторное ⌘K закрывает (toggle). Видимая кнопка в nav с подсказкой «⌘K» (SC 1) — `app/(app)/nav.tsx`. Пока открыт другой диалог/модалка — ⌘K инертен (SC 4).
- **D-05:** Результаты сгруппированы «Устройства» / «Сотрудники», лимит **6+6** (хватает для 50–200 сущностей, выбор почти всегда в первых шести; «Показать все» у каждой группы → переход в соответствующий список с подставленным ?q= — SC 2). Архивные сотрудники находятся и несут бейдж «в архиве» (SC 2/3).
- **D-06:** Клавиатура (SC 3): ↑/↓ — циклическая навигация по плоскому списку результатов (с учётом групповых заголовков), Enter — переход на карточку по id и закрытие, Esc — закрытие без перехода. Мышь: клик по строке = Enter.
- **D-07:** Пункт «Скачать ведомость CSV» внизу палитры (мягкая зависимость Phase 8): ведёт на существующий `/api/devices/export` (весь парк, без фильтров — палитра глобальна), закрывает палитру. Клавиатурно достижим как последняя строка списка.

**Долги вехи — фиксируются в этой фазе**
- **D-08:** Два deferred-фикса поиска входят в скоуп фазы отдельной задачей: (1) **WR-01 фазы 8** — `Object.fromEntries(request.nextUrl.searchParams)` в export-роуте схлопывает дублированные query-параметры: шейпить значения в массивы до `parseDevicesSearchParams` (патч в 08-REVIEW.md); (2) **WR-01 фазы 7** — dedup пушей debounce-хука: патч в 07-REVIEW.md. Палитра — новый консюмер хука, чинить до её подключения. — Reversibility: reversible — локальные фиксы поверх существующих тестов

### Claude's Discretion
- Компонентная структура палитры (client-остров в layout, портал/overlay), стилистика — ui-phase
- Точная сигнатура ответа `/api/search` (JSON-шейп групп)
- Тест-матрица: роут (requireSession, капы, фолд), предикаты переиспользованы (parity со списками), клавиатурная навигация — UAT Playwright
- Механика «инертен при открытом диалоге» (data-attr диалогов / document.activeElement)

### Deferred Ideas (OUT OF SCOPE)
- Поиск по держателю из палитры («Иванов» → его техника) — дважды отклонён (фаза 5, фаза 7)
- Недавние запросы/история палитры — SC 4 прямо запрещает персистентность
- FTS5/рейтинг релевантности — Out of Scope (substring + фолд достаточны)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FIND-06 | Оператор открывает глобальную палитру ⌘K одним хоткеем (работает на русской раскладке), ищет по устройствам и сотрудникам одновременно и переходит на карточку; архивные сотрудники находятся с бейджем «в архиве» | event.code KeyK layout-independence [CITED: MDN KeyboardEvent.code]; Base UI Autocomplete official command-palette recipe (groups, cyclic ↑↓, Enter-on-highlight, ARIA) [VERIFIED: node_modules/@base-ui/react/docs/react/components/autocomplete.md]; palette DB functions composing existing predicates with departments join and isActive in SELECT (§Architecture Patterns); GET /api/search route shape per D-01 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

No `./CLAUDE.md` at repo root. Governing workspace instruction: `AGENTS.md` — vendored Next.js 16.3.3 ("NOT the Next.js you know"): read `node_modules/next/dist/docs/` before writing framework-specific code (done for route handlers and redirect semantics below). Locked project constraints carried from REQUIREMENTS.md/CONTEXT.md: **NO new npm dependencies** (cmdk/Radix forbidden), **NO schema changes**, Base UI primitives only.

## Summary

Phase 11 is a thin composition layer over battle-tested surfaces. Every backend the palette needs already exists and was verified in this session: `employeeSearchPredicate` is exported with an explicit comment naming Phase 11 as its consumer (`db/queries/employees.ts:56-58`); the device search predicate lives inside `deviceWhere` but is **module-private** — the palette needs a small exported query function in `db/queries/devices.ts` that composes `deviceWhere('all', { q })` internally (keeping the predicate private, mirroring how `listDevices`/`exportDevices` consume it). The route is a thin GET handler per the verified export/attachments precedents: `requireSession()` first statement, `Cache-Control: no-store`, server-side LIMIT 6+6.

The decisive discovery: **the installed Base UI (`@base-ui/react` ^1.7.0) ships an official "Command palette" example in its vendored docs** (`node_modules/@base-ui/react/docs/react/components/autocomplete.md`, ~line 3234) — `Dialog.Root` + `Autocomplete.Root inline open` with grouped items, `autoHighlight="always"`, `Autocomplete.Item onClick` that fires on pointer click **and on Enter when highlighted** (verified in the Item props table), and `loopFocus` defaulting to `true` (cyclic ↑↓ including the input, explicitly "per ARIA Authoring Practices"). This delivers D-06's full keyboard contract and the a11y wiring (role=dialog from Base UI, combobox/listbox ARIA per APG) with zero hand-rolled keyboard state machines and zero new packages — exactly the "existing Base UI primitives" constraint. The global ⌘K listener (`event.code === 'KeyK'` + `metaKey/ctrlKey`) is a window keydown in the palette island; `event.code` is documented layout-independent by MDN [CITED: developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code], and Ctrl+K is interceptable via `preventDefault()` in Chrome/Firefox [CITED: support.google.com/chrome].

Client fetch strategy: do **not** thread the palette through `useDebouncedSearchQuery` — that hook navigates URLs (`router.replace`), which is list semantics, not palette semantics (D-03: state dies on close, AbortController per keystroke). The palette runs its own ~25-line abortable fetch + 300 ms debounce; the hook connection is (a) the shared debounce *pattern*, (b) D-08 fix #2 applied to the hook before the palette lands, (c) `buildDevicesQuery`/`buildEmployeesQuery` for «Показать все» URLs. D-08 fix #1's shaping loop should be extracted as a pure helper so it stays vitest-testable (routes are not vitest-importable — established phase-8 discipline).

**Primary recommendation:** DB-layer: add exported `searchPaletteDevices`/`searchPaletteEmployees` composing the existing predicates (employees query MUST innerJoin departments — the predicate references it). Route: `app/api/search/route.ts` per the export-route precedent. UI: one `CommandPalette` client island in `app/(app)/layout.tsx` using the official Base UI palette skeleton (Dialog + Autocomplete inline), global ⌘K window listener inside it, nav button wired via `Dialog.createHandle()` (official detached-trigger pattern) or as a single island containing both button and dialog. Land D-08 fixes as the first task.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| ⌘K hotkey (layout-independent) | Browser/Client (island) | — | `event.code` only exists in the browser; window keydown in the palette island |
| Session guard for search | API (route handler) | Proxy perimeter | `requireSession()` first statement (verified precedent), proxy already default-denies `api/*` |
| Unified search (devices+employees, fold, RU sort) | Database/Storage (db layer) | API (thin route) | Predicates live in db modules (established layering); route only parses/limits/serializes |
| Result grouping/limiting 6+6 | API (route handler) | — | Server-side LIMIT per D-01 — client never truncates |
| Debounce + AbortController fetch | Browser/Client (island) | — | Per-keystroke cancellation is client state (D-03) |
| Keyboard nav, ARIA, focus trap | Browser/Client (Base UI) | — | Dialog focus trap/scroll lock + Autocomplete ARIA/keys are library-owned [VERIFIED: vendored docs] |
| «Показать все» / «Скачать ведомость» navigation | Browser/Client (island) | API (existing routes) | Client builds ?q= URLs via existing builders; CSV link hits existing export route |
| «Показать все» / inert-while-dialog-open detection | Browser/Client (island) | — | DOM data-attr query on the wrapper's own `data-slot` markers |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@base-ui/react` (Dialog) | ^1.7.0 (installed) | Palette modal skeleton: focus trap, scroll lock, Esc close, portal, `data-open` state attrs | Already the app's dialog primitive (`components/ui/dialog.tsx` wraps it); `modal: true` default = outside inert [VERIFIED: node_modules/@base-ui/react/docs/react/components/dialog.md] |
| `@base-ui/react` (Autocomplete) | ^1.7.0 (installed) | Results list: groups, cyclic ↑↓, Enter activation, ARIA combobox wiring, highlight | Official command-palette example in vendored docs of the installed version [VERIFIED: node_modules/@base-ui/react/docs/react/components/autocomplete.md] |
| React 19 hooks (`useRef`/`useState`/`useEffect`) | 19.2.8 (installed) | AbortController fetch + debounce state machine in the island | Platform primitives; AbortController is standard DOM [CITED: developer.mozilla.org/en-US/docs/Web/API/AbortController] |
| Next route handler (`route.ts`) | 16.3.3 (installed) | GET `/api/search` transport | GET handlers dynamic by default since v15 [VERIFIED: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md]; precedent routes verified in repo |

### Supporting (existing, reused)
| Library | Purpose | When to Use |
|---------|---------|-------------|
| `db/queries/employees.ts` `employeeSearchPredicate(q)` | Employee search fold predicate (Ё/ё→Latin E, homoglyphs, AND tokens, name OR department) | Composed by the new palette employee query — exported explicitly for Phase 11 [VERIFIED: codebase db/queries/employees.ts:58] |
| `db/queries/devices.ts` `deviceWhere(type, filters)` → `searchPredicate(q)` | Device search fold predicate (serial/inventory/model, ESCAPE '\\', cap 100) | Composed via new exported palette function — **currently module-private** [VERIFIED: codebase db/queries/devices.ts:181,228] |
| `lib/normalize.ts` `normalizeNumber` | Fold/homoglyph normalization shared write/read side | Already inside both predicates — route does NOT re-fold [VERIFIED: codebase] |
| `app/(app)/devices/query-params.ts` `parseDevicesSearchParams`/`buildDevicesQuery`/`toDeviceListFilters` | URL q rules (trim, cap 100) and «Показать все» device URL | Palette route parses q with the same rules; «Показать все» builds `?q=` URLs [VERIFIED: codebase query-params.ts:68-117] |
| `app/(app)/employees/query-params.ts` `buildEmployeesQuery` | «Показать все» employee URL | `buildEmployeesQuery({ filter: 'active', q })` [VERIFIED: codebase] |
| `components/ui/badge.tsx` (Base UI useRender) | «В архиве» badge | Same badge as employee card («В архиве» copy verified at card line 145) [VERIFIED: codebase] |
| `lucide-react` `Search` icon | Input icon + nav button hint | Already used by search-box [VERIFIED: codebase] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Base UI Autocomplete list | Hand-rolled role=listbox + keydown state machine | Would re-implement ARIA wiring, cyclic focus, Enter-on-highlight that Autocomplete owns; violates "don't hand-roll"; Autocomplete is installed and officially documented for exactly this UI |
| `useDebouncedSearchQuery` for palette input | Own mini abortable-fetch hook | The shared hook pushes URLs (list semantics); palette needs fetch + local state that dies on close (D-03). Hook stays untouched except D-08 fix #2 |
| `Dialog.createHandle()` detached trigger | Single island containing button + palette | Handle pattern is official [VERIFIED: vendored dialog.md detached-triggers demo]; single island is simpler if the button may live in layout next to AppNav — planner's call per D-04 ("кнопка в nav") |
| Exporting `deviceWhere` | New exported `searchPaletteDevices` in devices.ts | Exporting the predicate leaks composition burden to the route (join/limit/sort duplicated); an exported query function in the db module keeps sort/join/limit co-located and vitest-testable (established layering) |

**Installation:** none — zero new dependencies (locked constraint). All stack members already in `package.json` [VERIFIED: codebase package.json].

## Package Legitimacy Audit

> This phase installs **no external packages** (locked constraint: cmdk/Radix/any new npm deps are Out of Scope). No legitimacy gate runs required.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| @base-ui/react | npm | (already installed ^1.7.0, vendored docs present) | — | github.com/mui/base-ui | OK (pre-existing, not installed by this phase) | Reused as-is |
| next / react / react-dom | npm | 16.3.3 / 19.2.8 installed | — | vercel/next, facebook/react | OK (pre-existing) | Reused as-is |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                    ANY PAGE (all inside (app) layout, session-gated)
                                        │
                          ⌘K / Ctrl+K   │   click «⌘K» button (nav)
                    (window keydown,    │
                     event.code=KeyK)   │
                            ▼          ▼
                   ┌──────────────────────────────┐
                   │  CommandPalette island        │
                   │  (client, mounted in layout)  │
                   │  guard: another dialog open?  │──► yes: inert (ignore)
                   │  toggle: ⌘K again = close     │
                   └──────────────┬───────────────┘
                                  │ open (fresh state every time, D-03)
                                  │ immediate fetch q='' + on each keystroke
                                  │ (300 ms debounce, AbortController cancels prev)
                                  ▼
                     GET /api/search?q=<trimmed,≤100>
                                  │
                     ┌────────────┴────────────┐
                     │ route.ts (GET only)     │
                     │ 1. requireSession()     │──► no session: 307 /login
                     │ 2. q: trim, cap 100     │     (fetch follows → HTML;
                     │ 3. Cache-Control:       │      palette must detect
                     │    no-store             │      non-JSON → empty)
                     └────────────┬────────────┘
                                  │ compose EXISTING predicates (D-02)
                ┌─────────────────┴──────────────────┐
                ▼                                    ▼
   searchPaletteDevices(q, LIMIT 6)      searchPaletteEmployees(q, LIMIT 6)
   deviceWhere('all',{q})  [private]     employeeSearchPredicate(q) [exported]
   + leftJoin employees (holder)         + innerJoin departments (REQUIRED:
   + ruSort, asc(id)                      predicate references departments.name)
                                         + NO isActive filter (active+archived)
                └─────────────────┬──────────────────┘
                                  ▼
                  JSON { devices:[…≤6], employees:[…≤6] }
                                  │
                                  ▼
                   ┌──────────────────────────────┐
                   │ Base UI Dialog + Autocomplete │
                   │ groups «Устройства»/«Сотрудники»│
                   │ ↑↓ cyclic · Enter=card · Esc  │
                   │ «Показать все» → /devices?q=… │
                   │ «Скачать ведомость CSV»       │
                   └──────────────┬───────────────┘
                                  │ Enter/click
                                  ▼
                   router.push(/devices/<id> | /employees/<id>)
                   palette closes; state discarded (D-03)
```

### Recommended Project Structure
```
app/
├── api/search/route.ts                  # NEW: GET, requireSession-first, JSON both groups
├── (app)/
│   ├── layout.tsx                       # +1 line: mount <CommandPalette /> island
│   ├── nav.tsx                          # + ⌘K button (Dialog.Trigger w/ handle or custom event)
│   └── devices/export/route.ts          # D-08 fix #1: param shaping (pure helper)
components/
└── command-palette.tsx                  # NEW: island — hotkey listener, Dialog+Autocomplete,
│                                        #   abortable fetch, groups, keyboard, CSV row
lib/
├── search-params-record.ts (or in query-params.ts)  # NEW pure: URLSearchParams→Record shape (D-08 #1)
db/queries/
├── devices.ts                           # + exported searchPaletteDevices({q, limit})
└── employees.ts                         # + exported searchPaletteEmployees({q, limit})
lib/use-search-param.ts                  # D-08 fix #2: push dedup (07-REVIEW patch)
tests/
├── palette-queries.test.ts              # NEW: db-layer parity + archived inclusion + caps
└── (existing device-search / employee-search suites keep passing)
```

### Pattern 1: Global layout-independent hotkey (D-04, SC 1)
**What:** Window-level keydown matching the PHYSICAL key, not the character.
**When to use:** The single global open/toggle listener inside the palette island.
**Example:**
```tsx
// event.code is layout-independent: MDN — "a value that isn't altered by
// keyboard layout or the state of the modifier keys" [CITED: MDN KeyboardEvent.code].
// On ЙЦУКЕН the physical K key (labeled «Л») still reports code='KeyK'.
useEffect(() => {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== 'KeyK') return
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
    e.preventDefault() // beats Chrome's Ctrl+K address-bar search [CITED: support.google.com/chrome]
    if (e.repeat) return // hold-repeat must not toggle-flip
    if (open) { setOpen(false); return }        // D-04 toggle
    if (document.querySelector('[data-slot="dialog-content"][data-open]')) {
      return // another dialog is open → inert (SC 4; see Pattern 4)
    }
    setOpen(true)
  }
  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}, [open])
```
Repeat-guard note: with `open` captured in the effect deps, holding ⌘K cannot flicker — `e.repeat` is dropped before toggle logic.

### Pattern 2: Server-driven Base UI palette (official recipe, D-05/D-06)
**What:** `Dialog.Root` + `Autocomplete.Root` with `inline open mode="none"`, items replaced by server results.
**When to use:** The palette popup body.
**Example:**
```tsx
// Skeleton from the official Base UI command-palette example
// [VERIFIED: node_modules/@base-ui/react/docs/react/components/autocomplete.md ~3234]:
// - <Autocomplete.Root inline open mode="none"> — inline renders the list inside
//   the dialog (no own portal); mode="none" = items are STATIC, not client-filtered
//   (server already filtered — D-02 parity must not be re-filtered client-side).
// - items={groups} where groups = [{ value: 'Устройства', items: [...] },
//   { value: 'Сотрудники', items: [...] }] — empty groups omitted client-side.
// - autoHighlight="always" keepHighlight — first row always highlighted (D-06).
// - loopFocus defaults to true: cyclic ↑↓ incl. input, "per ARIA Authoring
//   Practices" — D-06's cycle for free [VERIFIED: Root props table].
// - <Autocomplete.Item onClick={go} value={row}> — per Item props table, onClick
//   fires on pointer click AND on Enter when highlighted [VERIFIED: Item props].
// - <Autocomplete.Empty> «Ничего не найдено».
// - <Autocomplete.Group items={...}> + <Autocomplete.GroupLabel> render the
//   «Устройства»/«Сотрудники» headers; data-highlighted styles the active row.
```

### Pattern 3: Abortable fetch + debounce in the island (D-03)
**What:** Per-keystroke debounced fetch with cancellation of the previous request; immediate fetch on open.
**When to use:** The palette's data layer — deliberately NOT `useDebouncedSearchQuery` (URL-push semantics is list-only).
**Example:**
```tsx
const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
const abort = useRef<AbortController | null>(null)

useEffect(() => {
  if (!open) return
  abort.current?.abort()
  const controller = new AbortController()
  abort.current = controller
  const run = () => {
    fetch(`/api/search?q=${encodeURIComponent(q.trim().slice(0, 100))}`, {
      signal: controller.signal,
    })
      .then(async (res) =>
        res.headers.get('content-type')?.includes('application/json')
          ? (res.json() as SearchResponse)
          : { devices: [], employees: [] }, // session died mid-session: 307→login HTML
      )
      .then(setResults)
      .catch((e: unknown) => {
        if ((e as Error).name !== 'AbortError') throw e // swallow only aborts
      })
  }
  if (isFirstFetchOnOpen) run() // instant fetch on open, D-03
  else timer.current = setTimeout(run, 300)
  return () => { if (timer.current) clearTimeout(timer.current) }
}, [open, q])
// Close effect: abort.current?.abort() + clear results → state dies with palette (D-03).
```

### Pattern 4: Inert while another dialog is open (SC 4 — discretion area)
**What:** Detect "a dialog is already open" from the DOM without touching any dialog.
**Verified mechanism:** every dialog in the app renders Base UI `DialogPrimitive.Popup` with `data-slot="dialog-content"` (project wrapper, `components/ui/dialog.tsx:52`), and Base UI sets `data-open` on the popup when open — the wrapper's own `data-open:animate-in` Tailwind variants only work because that attribute is on that element (in production today) [VERIFIED: codebase]. So `document.querySelector('[data-slot="dialog-content"][data-open]')` is a reliable "a modal is open" probe.
**Palette self-exclusion (toggle case):** check the toggle branch FIRST (Pattern 1 order), or tag the palette popup with a distinguishing attribute (e.g. `data-command-palette`) and exclude it in the query.

### Anti-Patterns to Avoid
- **Re-folding q in the route or client:** the fold (Ё→E Latin, homoglyphs, trim/collapse) lives inside the predicates via `normalizeNumber` — a second fold path is the drift vector phase 7 explicitly forbade. Route only trims + caps 100 (URL-layer rules, `parseDevicesSearchParams` discipline).
- **Second search engine:** palette must not SQL like-anything itself; only compose the two predicates (D-02, SC 2 parity).
- **Threading palette through the URL:** no `?q=` for the palette itself (only for «Показать все» targets) — D-03 forbids persistence; URL state would survive close.
- **Hand-rolled arrow-key/ARIA machinery:** Autocomplete owns it; a custom listbox duplicates a verified library surface and re-introduces the a11y gaps Base UI closes.
- **Client-side truncation:** LIMIT 6+6 is server-side (D-01); the client renders what it receives.
- **`Object.fromEntries(searchParams)` in any new route:** collapses duplicated params — D-08 fix #1 exists precisely because of this; the palette route only reads `q` so a plain `searchParams.get('q')` suffices there.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Focus trap, scroll lock, Esc close, backdrop | Custom overlay + focus management | Base UI Dialog (`modal: true` default) | Library-verified a11y; app's existing dialog primitive [VERIFIED: vendored dialog.md] |
| ARIA combobox wiring, cyclic ↑↓, Enter activation, highlight | Keydown state machine + aria-activedescendant bookkeeping | Base UI Autocomplete (`inline open`, `loopFocus` default true, Item onClick) | Official command-palette example in the installed version's docs; Item onClick covers mouse AND Enter [VERIFIED: vendored autocomplete.md] |
| Layout-independent hotkey matching | `event.key === 'к'` heuristics / keyMap tables | `event.code === 'KeyK'` | MDN: `code` is layout-independent by definition [CITED: MDN] |
| Search fold/normalization | Any new fold logic | `employeeSearchPredicate` + `deviceWhere` composition | «Палитра находит то, что находит список» is the phase's cardinal criterion (D-02) |
| CSV export | Any new export path in the palette | Link to existing `/api/devices/export` (D-07) | Route verified; palette passes no params → full park |
| RU-correct ordering | JS sort of results | Existing `ruSortKey` recipe (Ё/ё→Е/е replace + id tiebreaker) in both db modules | SQLite binary UTF-8 puts «Ё» before «А» (verified module comments) |
| «Показать все» URLs | String concatenation `?q=${q}` | `buildDevicesQuery` / `buildEmployeesQuery` | Builders own omission rules (q:'', sentinel stripping); hand-built URLs drift (established D-03/D-08 rule from phase 6) |

**Key insight:** this phase's risk is not search complexity — it is *composition fidelity*. Every hand-rolled line (a second predicate, a second parser, a hand-built URL) is a parity drift the milestone has repeatedly paid for (WR-01 ×2). The Base UI palette recipe removes the last hand-rolled candidate (keyboard list UI).

## Common Pitfalls

### Pitfall 1: Missing `departments` innerJoin breaks the employee palette query
**What goes wrong:** `employeeSearchPredicate` emits `norm(${departments.name}) like …` — a query over `employees` alone fails with "no such column" the moment q is non-empty.
**Why it happens:** the predicate was factored for `listEmployees`, which always innerJoins departments.
**How to avoid:** `searchPaletteEmployees` mirrors `listEmployees`' FROM/JOIN (`employees innerJoin departments on FK`) [VERIFIED: codebase employees.ts:93-116].
**Warning signs:** 500 on first keystroke; vitest db test catches it immediately.

### Pitfall 2: Palette employee query accidentally filters out archived employees
**What goes wrong:** copying `listEmployees` wholesale also copies `eq(employees.isActive, isActive)` — archive segment employees would never appear.
**How to avoid:** palette composes ONLY `employeeSearchPredicate(q)` (no isActive term), selects `isActive` for the badge, and `filter: 'active' | 'archive'` stays a list-page concern. Archived rows carry the same «В архиве» badge copy as the card [VERIFIED: card line 145].
**Warning signs:** SC 2/FIND-06 UAT scenario «архивные с бейджем» fails.

### Pitfall 3: Expired session → fetch follows 307 to /login and parses HTML as JSON
**What goes wrong:** `requireSession()` calls `redirect('/login')`, which in a route handler returns 307 [VERIFIED: vendored next docs redirecting.md]; `fetch` follows redirects by default → status 200 `text/html` → `res.json()` throws mid-palette.
**How to avoid:** guard on `content-type` before `res.json()` (Pattern 3) — non-JSON renders empty results; the next full navigation hits the proxy/login anyway. (Verified `requireSession` = `redirect('/login')` at `lib/auth.ts:10-16`.)
**Warning signs:** console JSON parse errors after cookie expiry during a long session.

### Pitfall 4: ⌘K toggle vs "another dialog open" check ordering
**What goes wrong:** the inertness probe `[data-slot="dialog-content"][data-open]` matches the PALETTE's own popup when open — a naive guard makes ⌘K unable to close the palette (breaks D-04 toggle).
**How to avoid:** order the branches: toggle-close first, then other-dialog probe (Pattern 1), or exclude the palette popup via a distinguishing data attribute.
**Warning signs:** ⌘K opens but never closes; UAT toggle scenario fails.

### Pitfall 5: Autocomplete Escape interception vs Dialog Esc close
**What goes wrong:** D-06 requires Esc = close palette. Base UI Autocomplete also consumes Escape (its own popup semantics); with `inline open` the interplay with Dialog dismissal needs verification.
**How to avoid:** plan a UAT assertion for Esc; fallback is an explicit `onKeyDown` Escape → `setOpen(false)` on the `Autocomplete.Input` (cheap, deterministic). [ASSUMED: Base UI Autocomplete may stopPropagation on Escape in inline mode — not verified from docs; flagged for UAT.]
**Warning signs:** Esc clears/ignores but dialog stays open.

### Pitfall 6: Stale results racing the input (no abort ⇒ last-response-wins inversion)
**What goes wrong:** without AbortController, a slow «ел» response can land after «ёлкин»'s and overwrite fresher results — the G-5-1 race class, now over fetch.
**How to avoid:** Pattern 3 aborts the previous request per keystroke and on close; swallow only `AbortError`.
**Warning signs:** flicker of wrong results while typing fast (UAT fast-typing scenario).

### Pitfall 7: D-08 debts must land BEFORE the palette consumes the shared surfaces
**What goes wrong:** palette is a new consumer of search behavior; landing it on unfixed bases re-opens proven defects (double-push navigations; export CSV ≠ page on duplicated params).
**How to avoid:** Task order: (1) hook dedup patch verbatim from 07-REVIEW.md (`inFlight.includes(value)` guard + absorb-all echo entries + trim-aware no-op skip); (2) export-route shaping patch from 08-REVIEW.md — extract the shaping loop into a pure, vitest-testable helper (routes are not vitest-importable — phase-8 discipline), route stays a thin composer.
**Warning signs:** 07/08 review scenarios regress in phase-11 UAT.

### Pitfall 8: Palette state surviving close (D-03 violation)
**What goes wrong:** results/input persisting across open cycles shows stale data — SC 4's "nothing survives close".
**How to avoid:** reset `q`/`results` when `open` flips false (and abort in-flight); do not initialize from URL. Base UI Dialog unmounts popup content by default when closed — keep it that way (no `keepMounted`).
**Warning signs:** open palette shows previous session's rows before fetch returns.

### Pitfall 9: Router navigation does not close the palette automatically
**What goes wrong:** the island lives in the layout (persists across navigations); Enter → `router.push(card)` re-renders children but the island keeps state — palette would stay open on the card.
**How to avoid:** navigate AND `setOpen(false)` in the same handler (D-06 says Enter = переход и закрытие). Optional belt: `usePathname()` effect closes on any pathname change (also covers Back while open).
**Warning signs:** card renders beneath the stuck overlay.

## Code Examples

### Palette DB functions (composition, D-02)
```ts
// db/queries/devices.ts — co-located with deviceWhere (private stays private)
export function searchPaletteDevices({ q, limit }: { q: string; limit: number }) {
  return db
    .select({
      id: devices.id, typeKey: devices.typeKey, model: devices.model,
      serialNumber: devices.serialNumber, inventoryNumber: devices.inventoryNumber,
      status: devices.status, holder: employees.name,
    })
    .from(devices)
    .leftJoin(employees, eq(devices.currentEmployeeId, employees.id)) // same join as listDevices
    .where(deviceWhere('all', { q: q.trim().slice(0, 100) }))          // THE predicate — no copy
    .orderBy(ruSortKey, asc(devices.id))                               // canonical RU order
    .limit(limit)                                                      // server cap (D-01)
    .all()
}

// db/queries/employees.ts — predicate is already exported for this phase
export function searchPaletteEmployees({ q, limit }: { q: string; limit: number }) {
  return db
    .select({
      id: employees.id, name: employees.name,
      department: departments.name, isActive: employees.isActive, // badge data
    })
    .from(employees)
    .innerJoin(departments, eq(employees.departmentId, departments.id)) // REQUIRED (Pitfall 1)
    .where(employeeSearchPredicate(q))  // NO isActive term — active + archived (Pitfall 2)
    .orderBy(ruSortKey, asc(employees.id))
    .limit(limit)
    .all()
}
```

### Route (D-01 shape, precedents verified)
```ts
// app/api/search/route.ts
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  await requireSession() // FIRST statement — export/attachments precedent [VERIFIED: codebase]
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 100)
  const [devices, employees] = await Promise.all([
    searchPaletteDevices({ q, limit: 6 }),
    searchPaletteEmployees({ q, limit: 6 }),
  ])
  return NextResponse.json(
    { devices, employees },
    { headers: { 'Cache-Control': 'no-store' } }, // D-01
  )
}
```
(`db` calls are synchronous better-sqlite3 — `Promise.all` composes two sync calls; sequential awaits are equally fine. GET handlers are dynamic by default in this Next [VERIFIED: vendored route.md, v15.0.0-RC change note].)

### Recommended `/api/search` JSON shape (discretion area — recommendation)
```jsonc
{
  "devices": [
    { "id": 12, "typeKey": "laptop", "model": "MacBook Air M1",
      "serialNumber": "C02…", "inventoryNumber": "2024-013", "holder": "Ёлкин Пётр" }
  ],
  "employees": [
    { "id": 3, "name": "Ёлкин Пётр", "department": "Бухгалтерия", "isActive": 0 }
  ]
}
```
Rationale: mirrors the db selects 1:1 (no mapping layer to drift); client derives `href = /devices/${id} | /employees/${id}` and the type label from `DEVICE_TYPES` (pure client-importable module, same as lists); `isActive === 0` → badge. Serial/inventory nullable (clones) — render empty segments like lists do.

### «Показать все» (existing builders only)
```tsx
router.push(`/devices${buildDevicesQuery({ q, type: 'all', status: 'all', departmentId: null, warranty: 'all', ramNoUpgrade: false })}`)
router.push(`/employees${buildEmployeesQuery({ filter: 'active', q })}`)
```
(Builders own sentinel omission; q: '' omitted automatically [VERIFIED: query-params.ts:107-117].)

### D-08 fix #1 — pure shaping helper (vitest-testable)
```ts
// lib (pure) — patch verbatim in spirit from 08-REVIEW.md WR-01
export function searchParamsRecord(sp: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const [k, v] of sp) {
    const prev = out[k]
    out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v]
  }
  return out
}
// export route: parseDevicesSearchParams(searchParamsRecord(request.nextUrl.searchParams))
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| cmdk/Radix Command for palettes | Base UI Autocomplete ships an official Dialog-based command-palette recipe | Current installed version (^1.7.0, vendored docs) | The "no new deps" constraint costs nothing — the recipe is first-party [VERIFIED: vendored autocomplete.md] |
| `event.key` shortcut matching | `event.code` physical matching | Platform standard (UI Events spec) | Russian-layout SC 1 satisfied by spec, not workarounds [CITED: W3C UI Events code values] |
| GET route handlers cached by default | Dynamic by default | Next v15.0.0-RC [VERIFIED: vendored route.md] | No `dynamic = 'force-dynamic'` needed for `/api/search`; `Cache-Control: no-store` remains the explicit client-cache contract (D-01) |

**Deprecated/outdated:**
- Hand-rolled `role="listbox"` keyboard machinery for palettes when a library primitive (Autocomplete) is available — a11y and cyclic-focus edge cases are exactly what it owns (its docs cite APG combobox).
- `Object.fromEntries(searchParams)` in route handlers — proven defect (08-REVIEW WR-01), fixed by array-preserving shaping.

## Runtime State Inventory

> Not a rename/refactor/migration phase — omitted per template. (No stored-data, service-config, OS-registered, secret, or build-artifact renames in scope; no schema changes.)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Base UI Autocomplete with `inline open` may consume/stopPropagation Escape before Dialog dismissal | Pitfall 5 | Esc doesn't close palette; cheap fallback exists (explicit input onKeyDown); caught by UAT |
| A2 | `Dialog.createHandle()` detached-trigger works across two client islands (nav button + layout palette) importing a shared module singleton | Architecture Patterns (nav wiring) | If not, fall back to a single island containing both button and dialog — zero functional loss; docs demo shows the handle pattern across sibling components [VERIFIED: vendored dialog.md demo], island-scope module sharing is [ASSUMED] |
| A3 | Ctrl+K is fully suppressible via preventDefault on all target browsers (Chrome/Firefox verified by search; Safari ⌘K unbound) | Pattern 1 | Browser address-bar search fires alongside palette on some setups; cosmetic, hotkey still works |
| A4 | Employee «Показать все» targets the `active` segment (default) — archived items are reached by clicking their rows directly | Code Examples | UX nit only; planner/user can redirect to `archive` segment instead |
| A5 | `Promise.all` composition in the route is fine though the db layer is synchronous (better-sqlite3) | Code Examples | None — sequential awaits are the trivial fallback |

## Open Questions (RESOLVED — 2026-09-18, plan 11-01 + UI-SPEC)

1. Autocomplete Escape vs Dialog close (A1) → явный `onKeyDown` Escape на инпуте с первого дня (T1 step 5; UI-SPEC Default 13; must_haves backstop).
2. Кнопка ↔ палитра (A2) → **один остров** (components/command-palette.tsx), nav.tsx не меняется; Dialog.createHandle() отклонён (UI-SPEC Default 2).
3. «Показать все» при пустом q → **рендерится** (T3 step 2; UI-SPEC Default 8).

1. **Autocomplete Escape behavior in `inline open` mode** (Pitfall 5 / A1)
   - What we know: Dialog handles Esc dismissal; Autocomplete has its own Escape semantics for its popup.
   - What's unclear: whether Autocomplete swallows the event before Dialog sees it in inline mode.
   - Recommendation: plan the explicit `onKeyDown` Escape on `Autocomplete.Input` from the start (1 line, removes the unknown), assert in UAT.
2. **Nav button ↔ palette state wiring** (A2)
   - What we know: D-04 names nav.tsx as the button's home; Base UI offers the detached `handle` trigger pattern.
   - What's unclear: single island vs handle-split island — planner's structural call within discretion.
   - Recommendation: prefer the single-island variant (button + dialog in one component mounted in layout header, button visually beside AppNav) unless the planner wants nav.tsx to own the button literally; both satisfy D-04.
3. **Empty-q palette content**
   - What we know: D-03 mandates an instant fetch on open; with q='' both predicates return undefined → first 6+6 rows in canonical RU order.
   - What's unclear: whether «Показать все» rows should render for empty q (navigating with no ?q= is a plain list link).
   - Recommendation: render them — they are harmless and keyboard-reachable; confirm in discuss/plan if the owner prefers hiding them when q===''.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | all build/test | ✓ | 22.23.0 | — |
| npm | workspace scripts | ✓ | 10.9.8 | — |
| vitest | db-layer tests | ✓ | 4.1.11 | — |
| Playwright (devDep) | UAT (phase-7 pattern) | ✓ | ^1.62.1 | — |
| better-sqlite3 / drizzle | db layer | ✓ | 13.0.3 / 0.45.2 | — |
| New npm packages | — | N/A | — | Forbidden by constraint; none needed |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.11 (node env) + Playwright UAT (orchestrator-driven, phase-7 pattern) |
| Config file | `vitest.config.ts` (alias `@`, `server-only` stub) [VERIFIED: codebase] |
| Quick run command | `npx vitest run tests/palette-queries.test.ts` |
| Full suite command | `npx vitest run` (370/370 baseline after phase 8) + `npx tsc --noEmit` + `npm run lint` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FIND-06 | Palette device rows == listDevices rows for same q (parity, modulo limit) | unit (db) | `npx vitest run tests/palette-queries.test.ts -t parity` | ❌ Wave 0 |
| FIND-06 | Palette employee rows include archived; `isActive` present for badge; departments join works | unit (db) | `npx vitest run tests/palette-queries.test.ts -t archived` | ❌ Wave 0 |
| FIND-06 | Server caps: devices ≤6, employees ≤6 with >6 matches; q cap 100 | unit (db) | `npx vitest run tests/palette-queries.test.ts -t limit` | ❌ Wave 0 |
| D-08 #1 | `searchParamsRecord` preserves duplicated params as arrays | unit | `npx vitest run tests/search-params-record.test.ts` | ❌ Wave 0 |
| D-08 #2 | Hook dedup: 07-REVIEW scenarios (double-Enter, reset-while-inflight) — plain-JS mirror or smoke assertions | unit/smoke | `npx vitest run` (hook is client — established: component runner absent; mirror pattern from 07-REVIEW) | ❌ Wave 0 (optional mirror; UAT covers live) |
| FIND-06 SC1-4 | Hotkey RU-layout, groups, keyboard nav, inertness, fresh-fetch, session | UAT | Playwright MCP scenarios (orchestrator) | manual-only by project convention |

Note: the route file itself is not vitest-importable (`next/headers` via requireSession — established phase-8 discipline); route logic is pinned through the db-layer tests + UAT.

### Sampling Rate
- **Per task commit:** `npx vitest run tests/palette-queries.test.ts` (+ `npx tsc --noEmit`)
- **Per wave merge:** `npx vitest run` + lint + `npm run build`
- **Phase gate:** full suite green + build green before `/gsd:verify-work`; UAT scenarios per D-04/D-05/D-06/SC 1-4

### Wave 0 Gaps
- [ ] `tests/palette-queries.test.ts` — parity/archived/limit (uses `tests/helpers.ts` temp-db pattern like `device-search.test.ts`/`employee-search.test.ts`)
- [ ] `tests/search-params-record.test.ts` (or extend an existing parser suite) — D-08 #1 shaping
- [ ] Hook dedup assertions — extend mirror-based tests or fold into UAT (planner's call)

## Security Domain

> `security_enforcement: true`, ASVS Level 1 (config). Required section.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (indirect) | Session cookie verified by `requireSession()` → proxy default-deny on `api/*` is perimeter layer 1 [VERIFIED: codebase lib/auth.ts, route precedents] |
| V3 Session Management | yes | `requireSession()` FIRST statement of GET `/api/search` (both precedents verified); no palette-specific session code |
| V4 Access Control | yes | No new authorization surface: palette exposes exactly what the lists expose to a sessioned operator; IDOR N/A (ids only used for self-navigation links) |
| V5 Input Validation | yes | q: trim + cap 100 (URL-layer rule); predicates parameterize every LIKE with `escape '\\'` (drizzle binds patterns — no SQL text interpolation) [VERIFIED: codebase predicates]; no other params accepted |
| V6 Cryptography | no | No crypto in scope |
| V7 Error Handling | yes | Happy-path-only route shape (parser degrades invalid input); no internals echoed — JSON is db rows only; unexpected failure → Next generic 500 (precedent pattern) |
| V14 Config | no | No config changes |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via q (LIKE wildcards) | Tampering | Existing predicates: parameter binding + `ESCAPE '\\'` + wildcard escaping — reused, not re-implemented [VERIFIED: codebase] |
| Unauthenticated search enumeration | Information Disclosure | requireSession-first + proxy perimeter (V3); route returns 307 /login when unauthenticated |
| CSV/formula injection via palette | Tampering | N/A — palette renders text, never executes cell content; CSV path unchanged (esc() guard already frozen) |
| Hotkey hijack concerns | Tampering (UX) | Single listener, preventDefault only on the matched combo; inert while other dialogs open (SC 4) |
| Stale-response spoofing (race) | Tampering (UX/data) | AbortController per keystroke; non-JSON guard (Pitfall 3) |

## Sources

### Primary (HIGH confidence)
- Codebase (grep/read, this session): `db/queries/employees.ts` (employeeSearchPredicate:58, ruSortKey, listEmployees join shape), `db/queries/devices.ts` (searchPredicate:181, deviceWhere:228, listDevices joins/sort), `lib/use-search-param.ts` (hook + G-5-1/G-7-1 machinery), `app/(app)/nav.tsx`, `app/(app)/layout.tsx`, `app/api/devices/export/route.ts`, `app/api/attachments/[attachmentId]/route.ts`, `app/(app)/devices/query-params.ts`, `app/(app)/employees/query-params.ts`, `components/ui/dialog.tsx` + `badge.tsx`, `lib/auth.ts`, `package.json`, `vitest.config.ts`, `tests/` layout, employee card badge («В архиве», line 145)
- Vendored docs, installed versions: `node_modules/@base-ui/react/docs/react/components/dialog.md` (Root props: open/onOpenChange/modal default true; detached-trigger handle demo; data-open attrs), `node_modules/@base-ui/react/docs/react/components/autocomplete.md` (official Command palette example ~3234; Root props: inline/open/mode/filteredItems/autoHighlight/loopFocus=true; Item onClick fires on click AND Enter; data-highlighted; Group/GroupLabel/Empty), `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (GET dynamic since v15.0.0-RC; NextRequest.nextUrl), `.../02-guides/redirecting.md` (redirect in route handlers = 307)
- Planning artifacts: `.planning/phases/08-csv/08-REVIEW.md` (WR-01 patch verbatim), `.planning/phases/07-live/07-REVIEW.md` (WR-01 hook patch verbatim), `.planning/phases/11-k/11-CONTEXT.md`, `.planning/ROADMAP.md` §Phase 11, `.planning/REQUIREMENTS.md`

### Secondary (MEDIUM confidence)
- [CITED: developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code] — layout-independence definition + Dvorak/AZERTY note (fetched)
- [CITED: developer.mozilla.org/en-US/docs/Web/API/AbortController] — abort semantics, abort event (fetched)
- [CITED: support.google.com/chrome/answer/157179] — Ctrl+K/E = address-bar search (websearch)
- WebSearch synthesis: Ctrl+K interceptable with preventDefault in Chrome/Firefox; reserved combos (Ctrl+T/W) are not; corporate Edge policy can pre-empt Ctrl+K

### Tertiary (LOW confidence)
- Base UI Autocomplete Escape-interplay in inline mode (A1 — training-knowledge inference, not doc-verified; UAT item)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every member already installed and its relevant API verified from vendored docs of the exact version
- Architecture: HIGH — all composition points read in code this session; official Base UI palette recipe matches D-04..D-07 point-for-point
- Pitfalls: HIGH for code-verified items (1,2,3,4,6,7,8,9); MEDIUM overall due to A1 (Escape interplay) and A2 (handle across islands)
- External claims (event.code, Ctrl+K, AbortController): MEDIUM — official-doc citations per provenance rubric

**Research date:** 2026-09-18
**Valid until:** 2026-10-18 (stable: pinned versions, no moving external deps)
