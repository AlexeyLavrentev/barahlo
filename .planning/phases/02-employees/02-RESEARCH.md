# Phase 2: Employees - Research

**Researched:** 2026-09-01
**Domain:** Next.js 16 App Router CRUD (Server Components + Server Actions + Drizzle/SQLite) + shadcn/ui design-system bootstrap; Russian-language Apple-aesthetic UI
**Confidence:** HIGH (core data layer verified by running code against the project's installed versions; UI-ecosystem claims cited from official docs)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Список-строки (не карточки): имя + отдел в одной строке, плотный вертикальный ритм, server-side pagination — 50–200 сотрудников не должны грузиться целиком.
- **D-02:** Кнопка «Архивировать» с подтверждением; жёсткого удаления нет вообще (EMP-03, D-18 из 01-CONTEXT). Фильтр «Активные / Архив» над списком, по умолчанию «Активные». Архивного сотрудника можно разархивировать.
- **D-03:** Управление отделами — без отдельной страницы настроек: в форме сотрудника отдел выбирается из списка (combobox) с инлайн-созданием нового отдела по мере ввода (уникальность имени уже в схеме — departments_name_uq). Начальный список заводит пользователь (D-18 из 01-CONTEXT); в dev — сид.
- **D-04:** Уникальность имени сотрудника НЕ enforced — два «Иван Иванов» в разных отделах реальны; различаются отделом и id.
- **D-05:** Поиск по имени в Phase 2 не строится — список и так пагинирован, осмысленный поиск (с гомоглифами) приходит в Phase 5 (FIND-01).
- **D-06:** Все экраны фазы — по гайдам skill `apple-design` (user-level skill): типографика, воздух, минимализм; русский язык интерфейса (UI-01/UI-02 — якорятся здесь и наследуются фазами 3–6).

### Claude's Discretion
- Точная форма инлайн-создания отдела (dropdown+кнопка vs combobox) — на выбор планировщика по apple-design гайдам (UI-SPEC разрешил: combobox с type-to-create)
- Сортировка списка (по имени, asc — дефолт)
- Разметка пагинации (UI-SPEC разрешил: prev/next + «Страница N из M», без номеров)

### Deferred Ideas (OUT OF SCOPE)
- Поиск/фильтр по имени сотрудника — Phase 5 (FIND-01: substring + гомоглифы через lib/normalize)
- Печатная карточка сотрудника / акт выдачи — v1.x (V2-06, по триггеру от HR/бухгалтерии)

### UI Contract (binding)
`02-UI-SPEC.md` is **approved (status: approved, reviewed 2026-09-01)** — spacing scale, typography roles, color tokens, copy table, screen inventory, and empty/loading/error states are a contract, not suggestions. This research does not revisit it; it supplies verified implementation mechanics for it.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EMP-01 | User can create and edit employees: имя + отдел | Server Action + zod pattern (established phase 1); `db.transaction` for dept-if-missing + insert (VERIFIED locally); create/edit dialog contract in UI-SPEC |
| EMP-03 | User can archive an employee; archived keep history; no delete anywhere | `isActive` flag flip with conditional UPDATE + confirmation dialog; FK `restrict` already guarantees history retention; no DELETE code path exists (schema has restrict FKs; movements triggers) |
| UI-01 | Интерфейс полностью на русском | Copy table in UI-SPEC (approved); `Intl.PluralRules('ru')` category mapping VERIFIED at runtime; no i18n library (CLAUDE.md forbids next-intl) |
| UI-02 | Apple-aesthetic design per apple-design skill | UI-SPEC tokens (approved); shadcn/ui init mechanics verified (CLI v4 flags, Base UI library); press/hover/motion specs map to apple-design §1/§7/§12/§14/§15 |
</phase_requirements>

## Project Constraints (from CLAUDE.md / AGENTS.md)

| Directive | Source | Consequence for this phase |
|-----------|--------|---------------------------|
| **Read `node_modules/next/dist/docs/` before writing any Next.js code** — this version has breaking changes vs training data | AGENTS.md (nextjs-agent-rules) | Done this session; differences found: `error.tsx` gets `retry` not `reset`; `refresh()` from `next/cache`; CLI/params Promises. Executor must heed deprecation notices in those docs |
| Russian strings inline; NO next-intl / i18n libraries | CLAUDE.md §What-NOT-to-use | Use `Intl.PluralRules('ru')`, `Intl.Collator('ru')` |
| No react-admin / Ant Design / Mantine admin themes | CLAUDE.md §What-NOT-to-use | shadcn/ui primitives restyled to Apple aesthetic only |
| No Redis, no Prisma, no `node:sqlite`, no Alpine images | CLAUDE.md §What-NOT-to-use | Not touched by this phase |
| Migrations: `npx drizzle-kit generate` + `migrate` ONLY, never `push` | Phase 1 locked (PITFALLS Pitfall 1) | **No schema changes are needed this phase** — `employees`/`departments` already in migration 0000 |
| Server Actions with zod `safeParse` at entry | Phase 1 established pattern | All 5+ new actions follow |
| `requireSession()` in every page + action | Phase 1 defense-in-depth (ACC-02) | New routes sit inside `app/(app)/` and re-check |
| db/index.ts is the only DB entry point; WAL + foreign_keys ON + busy_timeout on every connection | Phase 1 Pitfall 6 | New query modules import `db` from `@/db`; tests use `createTempDb()` helper |
| Tests in `tests/` (vitest), `<automated>` check per task | Phase 1 convention | New test files for data layer + plural helper |

## Summary

Phase 2 is the first full-screen CRUD phase on top of a foundation that already contains everything hard: schema (`employees` + `departments` with `departments_name_uq` and `restrict` FKs), migration 0000 applied, auth perimeter (`proxy.ts` + `requireSession()`), vitest with temp-SQLite helpers, and a seeded dev database (40 employees / 5 departments, all `isActive=1`). The work is: bootstrap shadcn/ui, build a `/(app)` shell layout (none exists today — `app/(app)/` has only `page.tsx` + `actions.ts`), and implement list → card → create/edit dialog → archive-confirm with server-side pagination and the Active/Archive filter. The data layer is small enough to verify exhaustively — and was: pagination with join + filter + Russian-correct sort, filtered `count()`, the department inline-create UNIQUE race, and the transactional create-with-new-department were all executed against the project's actual drizzle-orm 0.45.2 + better-sqlite3 13.0.3 this session.

The most consequential findings are Next.js 16 deltas from common training-data patterns: page `params`/`searchParams` are Promises to `await`; `error.tsx` receives `{ error, retry }` (not `reset`); and a Server Action must call `refresh()` (or `revalidatePath`) or the current route is **not** re-rendered in the action response — the list would stay stale after mutations. On the UI side, shadcn CLI v4 now defaults to Base UI primitives and has a native `combobox` component (`shadcn add combobox`) whose filtering is built in — a simpler composition than the popover+cmdk pair the approved UI-SPEC assumed; the visual contract is satisfiable either way (same trigger, same checkmark, same pinned «Создать „X"» row). The old `@base-ui-components/react` package name was renamed to `@base-ui/react` — never hand-install the unscoped `base-ui-react` (an unrelated package).

One genuinely load-bearing subtlety: **Russian alphabetical sort cannot be done with SQLite defaults.** SQLite `NOCASE` folds ASCII only, binary UTF-8 order puts «Ё» before «А», and better-sqlite3 v13 exposes **no** `db.collation()` API to register a custom collation. The verified fix is a sort-key expression in ORDER BY: `replace(replace(name,'Ё','Е'),'ё','е')` (plus uppercase-first reality makes the rest binary-safe); `Intl.Collator('ru')` is for client-side lists (combobox options), where the UI-SPEC's prescription genuinely applies.

**Primary recommendation:** Server Components read via a thin `db/queries/employees.ts` (testable against temp SQLite); Server Actions in `app/(app)/employees/actions.ts` thin-wrap `requireSession()` + zod + query functions and end with `refresh()`; shadcn init (Base UI library, no preset) as the first task; native `combobox` primitive with a custom first «Создать „X"» item; pagination via `searchParams` (`?filter=&page=`) with `await`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Employee CRUD mutations (create/edit/archive/unarchive, dept inline-create) | API/Backend (Server Actions) | Database (Drizzle tx) | Mutations must run server-side with zod + session guard; single sync transaction for dept+employee |
| List/card data reads (pagination, filter, sort, count) | Frontend Server (RSC) | Database | Server Components read SQLite directly (CLAUDE.md: no client data-fetching layer); `searchParams` makes routes dynamic |
| Pagination + filter navigation state | Browser/Client (Links to `searchParams`) | Frontend Server | State lives in the URL (`?filter=archive&page=2`) — shareable, server-parsed |
| Dialogs (create/edit/archive-confirm), combobox, segmented control | Browser/Client | API/Backend (invoke actions) | `useActionState` pending/error state needs client components; visual contract from UI-SPEC |
| Design system (tokens, fonts, motion, shell top bar) | Browser/Client (globals.css `@theme` + components) | — | `globals.css` overrides + `app/(app)/layout.tsx` shell; inherited by phases 3–6 |
| Russian plural count label | Shared util (`lib/ru.ts`) | Server (rendered in RSC) | Pure function over `Intl.PluralRules('ru')`; unit-testable |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.3.3 (installed) | App Router: RSC pages, Server Actions | Already the project runtime; phase 1 conventions validated |
| react / react-dom | 19.2.8 (installed) | `useActionState`, `<form action>` | Ships with Next 16 |
| drizzle-orm | 0.45.2 (installed) | Typed queries: join/filter/sort/limit/offset/count | Verified this session end-to-end |
| better-sqlite3 | 13.0.3 (installed) | SQLite driver (sync) | Already wired in `db/index.ts` with pragmas |
| zod | 4.5.4 (installed) | Action input validation | Phase 1 pattern |
| shadcn (CLI) | 4.19.1 on npm; `npx shadcn@latest` | Copy-in components on Base UI | Prescribed by approved STACK.md; see Legitimacy Audit |
| tailwindcss | 4.x (installed) | Styling | v4 CSS-first `@theme`; UI-SPEC tokens land there |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | 1.39.0 | Icons (chevron-right, plus, check, archive) | Installed by `shadcn add`; stroke/size per UI-SPEC |
| @base-ui/react | 1.7.0 | Headless primitives under shadcn components | **Installed by the shadcn CLI automatically — do not add by hand, and never the unscoped `base-ui-react`** [CITED: npm deprecation notice of @base-ui-components/react → renamed to @base-ui/react] |
| clsx / tailwind-merge / class-variance-authority | latest | `cn()` helper + button variants | Installed by `shadcn init` |
| Intl.PluralRules / Intl.Collator | Node built-in | Russian plurals; combobox option sort | Zero-dependency, runtime-verified |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native shadcn `combobox` primitive | popover + command (cmdk) composition | UI-SPEC text names popover+command; native combobox has built-in filtering, fewer files, less code. Both satisfy the approved visual contract. Recommendation: native first, popover+command as fallback — final call when the generated code is visible (`add --dry-run` helps) |
| `refresh()` in actions | `revalidatePath('/employees')` | Both re-render the route in the action response. Pages here are dynamic (cookies + searchParams), so `refresh()` is the precise tool per docs; `revalidatePath` fine if the planner prefers explicit paths |
| URL `searchParams` for filter/page | Client state | Client state loses back-button/deep-link; D-01 demands server-side pagination — URL is the natural carrier |

**Installation (only new commands this phase):**
```bash
npx shadcn@latest init -b base          # Base UI library; do NOT use -d (pulls preset "nova"; UI-SPEC wants none)
npx shadcn@latest add -y button input label badge dialog combobox
# optional fallback pair: npx shadcn@latest add -y popover command
```
No version bumps to existing deps are required. **No DB migration is needed** — tables exist in migration 0000.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| shadcn | npm | release 2026-08-31 (churn) | 8.7M/wk | github.com/shadcn-ui/ui | SUS (too-new) | Flagged — official CLI prescribed by approved STACK.md; SUS is release-churn noise, planner should still gate install behind the checkpoint per protocol |
| lucide-react | npm | release 2026-09-01 (churn) | 97.8M/wk | github.com/lucide-icons/lucide | SUS (too-new) | Flagged — same nature; official repo, massive adoption |
| @base-ui/react | npm | release 2026-08-04 | 11.2M/wk | github.com/mui/base-ui | SUS (too-new) | Flagged — official MUI repo; installed transitively by shadcn add, not hand-pinned |
| cmdk | npm | 2025-03 | 44M/wk | github.com/pacocoursey/cmdk | OK | Approved (only if popover+command fallback chosen) |
| clsx | npm | 2024-04 | 121M/wk | github.com/lukeed/clsx | OK | Approved |
| tailwind-merge | npm | 2026-05 | 82M/wk | github.com/dcastil/tailwind-merge | OK | Approved |
| class-variance-authority | npm | 2024-11 | 63M/wk | github.com/joe-bell/cva | OK | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** shadcn, lucide-react, @base-ui/react — all three flags are `too-new` (very fresh release timestamps), not trust signals: each is the canonical package from its official repo with millions of weekly downloads, no deprecation, and no postinstall scripts (verified: `postinstall: null` for all). Per protocol the planner inserts `checkpoint:human-verify` before the shadcn init task; note that shadcn/ui itself was already user-approved in STACK.md, and the components are copied into the repo (not runtime dependencies), which bounds the risk.
**Hazard worth naming:** `@base-ui-components/react` is **deprecated — renamed to `@base-ui/react`** [VERIFIED: npm deprecation notice]. The unscoped `base-ui-react` on npm is an unrelated package — never install it.

## Architecture Patterns

### System Architecture Diagram

```
                       Browser (Client Components)
   ┌────────────────────────────────────────────────────────────┐
   │  EmployeesListPage UI:  segmented filter ─ pagination      │
   │  EmployeeDialog (create/edit)   ArchiveConfirmDialog       │
   │  DepartmentCombobox («Создать „X“» inline row)             │
   └──────┬─────────────────────────┬───────────────────────────┘
          │ <Link href="?filter&page">   │ useActionState(action)
          ▼                              ▼
   ┌────────────────────────────────────────────────────────────┐
   │  proxy.ts perimeter (session JWT) → app/(app)/layout.tsx   │
   │  [48px top bar «Учёт техники / Сотрудники / Выйти»]        │
   └──────┬─────────────────────────────────────────────────────┘
          ▼
   ┌────────────────────────────────────────────────────────────┐
   │  Server Components:                                        │
   │  /employees        await searchParams → queries.list()     │
   │  /employees/[id]   await params → queries.getById()        │
   └──────┬─────────────────────────────────────────────────────┘
          ▼
   ┌────────────────────────────────────────────────────────────┐
   │  Server Actions ('use server', requireSession + zod):      │
   │  createEmployee / updateEmployee / setEmployeeArchived     │
   │  (archive|unarchive)                                       │
   │        │ tx: dept-if-missing (catch SQLITE_CONSTRAINT_     │
   │        │     UNIQUE → re-select) + insert/update           │
   │        ▼ refresh()  ← re-renders route in action response  │
   └──────┬─────────────────────────────────────────────────────┘
          ▼
   ┌────────────────────────────────────────────────────────────┐
   │  db/queries/employees.ts → drizzle → better-sqlite3        │
   │  (WAL, foreign_keys=ON; employees ⋈ departments;           │
   │   RU sort expr; count(); limit/offset)                     │
   └────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
app/
├── (app)/
│   ├── layout.tsx              # NEW: 48px sticky top bar (Учёт техники | Сотрудники | Выйти)
│   ├── page.tsx                # MODIFY: redirect('/employees') (was stub)
│   ├── actions.ts              # existing logout (stays)
│   └── employees/
│       ├── page.tsx            # list: await searchParams {filter, page}
│       ├── loading.tsx         # 5 skeleton rows h-11 bg-black/5 rounded-lg
│       ├── error.tsx           # «Не удалось загрузить список» + retry()   ← NOTE: retry, not reset
│       ├── actions.ts          # create/update/archive/unarchive employee (+dept inline)
│       ├── employees-list.tsx  # server: rows card + pagination (or composed in page)
│       ├── employee-dialog.tsx # client: create/edit dialog + combobox + useActionState
│       └── [id]/
│           ├── page.tsx        # card: name, dept, badge, actions, «Техника» placeholder
│           ├── loading.tsx
│           └── error.tsx
├── login/                      # restyle to UI-SPEC (copy unchanged)
├── globals.css                 # MODIFY: UI-SPEC tokens, light-only, system font
└── layout.tsx                  # MODIFY: drop Geist Sans, keep Geist Mono variable
components/
└── ui/                         # generated by shadcn (button, input, label, badge, dialog, combobox…)
lib/
├── ru.ts                       # NEW: pluralEmployees(n) via Intl.PluralRules('ru'); ruCollator
db/
├── index.ts                    # existing (pragmas) — untouched
└── queries/
    └── employees.ts            # NEW: listEmployees(page, filter), getEmployee(id),
                                #      createEmployee, updateEmployee, setArchived
                                #      (pure db functions → unit-testable)
tests/
├── employees-queries.test.ts   # NEW: pagination/filter/sort/archive semantics
└── ru.test.ts                  # NEW: plural categories 1/2-4/5-20/21…
```

### Pattern 1: Server-side pagination + filter via `searchParams` (Promise!)
**What:** List page awaits `searchParams`, queries one page (20 rows) + filtered total, renders prev/next links that carry the full query string.
**When to use:** `/employees` (D-01), later phases' lists copy this.
**Example:**
```tsx
// Source: node_modules/next/dist/docs/.../file-conventions/page.md (verified this session)
export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const filter = sp.filter === 'archive' ? 'archive' : 'active'      // validate, never trust
  const page = Math.max(1, Number(sp.page) || 1)
  const { rows, total } = listEmployees({ filter, page, pageSize: 20 })
  const pages = Math.max(1, Math.ceil(total / 20))
  // … segmented control: <Link href={filter==='active' ? '?filter=archive' : '?filter=active'}>
}
```
**Pagination links must rebuild the whole query string** (`?filter=archive&page=3`) — a bare `?page=3` drops the filter.

### Pattern 2: Server Action must re-render the route (`refresh()`)
**What:** After a successful mutation, call `refresh()` from `next/cache`. Per docs, an action that calls none of refresh/revalidatePath/redirect **carries only its return value and the current route is NOT re-rendered** — the list would look unchanged after archiving.
**Example:**
```ts
// Source: node_modules/next/dist/docs/.../04-functions/refresh.md + 02-guides/server-actions.md (verified)
'use server'
import { refresh } from 'next/cache'

export async function setEmployeeArchived(_prev: unknown, formData: FormData) {
  const session = await requireSession()                    // actions are directly POST-able
  const parsed = ArchSchema.safeParse({ id: formData.get('id'), archived: formData.get('archived') })
  if (!parsed.success) return { error: 'Не удалось сохранить. Попробуйте ещё раз.' }
  setEmployeeArchived(parsed.data.id, parsed.data.archived) // db layer
  refresh()                                                 // returns fresh RSC in same roundtrip
  return { ok: true }
}
```
`redirect()` throws a control-flow exception — if ever used, place revalidation **before** it.

### Pattern 3: Transactional «create department if missing» (combobox inline create, D-03)
**What:** One sync `db.transaction` resolves-or-creates the department (UNIQUE race-safe), then inserts/updates the employee.
**When to use:** create and edit actions whenever the submitted department is new.
```ts
// VERIFIED this session against installed drizzle-orm 0.45.2 + better-sqlite3 13.0.3
export function resolveDepartmentId(tx: Tx, name: string): number {
  const existing = tx.select({ id: departments.id }).from(departments)
    .where(eq(departments.name, name)).get()
  if (existing) return existing.id
  try {
    return tx.insert(departments).values({ name }).returning({ id: departments.id }).get().id
  } catch (e) {
    if ((e as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {   // lost a race → reuse
      return tx.select({ id: departments.id }).from(departments)
        .where(eq(departments.name, name)).get()!.id
    }
    throw e
  }
}
```
(With a single operator the race is theoretical; the catch also converts the UI-SPEC's «Такой отдел уже есть» case into a no-op success — one code path, no special UI state.)

### Pattern 4: Russian-correct server-side sort (the Ё problem)
**What:** `ORDER BY name` (binary UTF-8) puts «Ёлкин» before «Анна»; `COLLATE NOCASE` folds ASCII only; better-sqlite3 v13 has **no** `db.collation()` API to fix it. Sort on a normalized key expression instead.
```ts
// VERIFIED locally: orders Анна < Анна Шевченко < Борис < Ежов < Ёлкин < Яна (and 'арбузов' case-insensitively)
const ruSort = sql`replace(replace(${employees.name}, 'Ё', 'Е'), 'ё', 'е')`
db.select({…}).from(employees).innerJoin(departments, eq(employees.departmentId, departments.id))
  .where(eq(employees.isActive, filter === 'active' ? 1 : 0))
  .orderBy(ruSort).limit(pageSize).offset((page - 1) * pageSize).all()
```
Client-side lists (combobox options, small) use `new Intl.Collator('ru').compare` — VERIFIED: case-insensitive, ё placed after е.

### Pattern 5: Count label plurals
```ts
// VERIFIED locally in Node 22: one/few/many; 1,21,101→one; 2-4,22-24→few; 0,5-20,11,25,111→many
export function pluralEmployees(n: number): string {
  const form = new Intl.PluralRules('ru').select(n)
  const word = { one: 'сотрудник', few: 'сотрудника', many: 'сотрудников', other: 'сотрудников' }[form]
  return `${n} ${word}`
}
```

### Pattern 6: Dialog mutation with `useActionState` (phase-1 login shape, reused)
Action signature `(prev, formData) => state` exactly like `app/login/actions.ts`; dialog client component shows inline field errors from zod (map `parsed.error.flatten().fieldErrors` → Russian strings from the UI-SPEC copy table) and the generic `role=alert` message on action failure; `pending` disables the submit button. Close the dialog on `ok` state.

### Anti-Patterns to Avoid
- **Trusting `searchParams`/`params` values**: they are Promises **and** untyped user input — `await` + validate with zod/Number before use; an `id` that isn't a positive integer must `notFound()`.
- **Forgetting `refresh()` in an action**: mutation succeeds, UI silently stale. (Documented Next 16 behavior, not a bug.)
- **Client-side pagination of 50–200 rows**: violates D-01 verbatim; sort+limit+offset belong to SQL.
- **`drizzle-kit push`**: forbidden project-wide (drops UNIQUE constraints on SQLite); no schema change is even needed this phase.
- **DELETE on employees**: no such endpoint, no such button (EMP-03; FK restricts would also block it once devices reference the employee).
- **Red «Архивировать» button**: UI-SPEC explicitly reserves destructive red; archive is reversible → neutral secondary button.
- **Installing `base-ui-react` (unscoped) or `@base-ui-components/react` by hand**: first is an unrelated package; second is deprecated. Let the shadcn CLI manage it.
- **Tailwind classes producing 6px/10px (`mt-1.5`, `py-2.5`, `px-2.5`) in new code**: forbidden by the approved spacing contract; normalize existing login screen in this phase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accessible dialog/popover/combobox behavior | Custom focus-trap/ESC/aria wiring | shadcn components (Base UI primitives) | A11y edge cases (focus return, typeahead, aria-* are subtle and invisible in happy-path testing |
| Accessible listbox filtering + highlight | Custom filter/highlight state | `combobox` primitive (autoHighlight, built-in filter) | Same |
| Russian plural forms | Hardcoded `n===1` checks or regex hacks | `Intl.PluralRules('ru')` | Russian needs one/few/many (21 сотрудник! 22 сотрудника!) — VERIFIED category table above |
| Russian alphabetical order | JS sort after pagination, or raw ORDER BY | SQL `replace()` sort-key expression + `Intl.Collator('ru')` client-side | Collation API absent in better-sqlite3 13 (VERIFIED); binary order mishandles Ё |
| Pagination math edge cases | Ad-hoc off-by-one fixes everywhere | One `listEmployees()` returning `{rows, total, page, pages}` + clamp | Single tested place |
| Icons | Inline SVGs | lucide-react (chevron-right, check, plus) | shadcn pairs with it; UI-SPEC sizes |
| Icons/empty/error/loading states per route | Ad-hoc spinners | `loading.tsx` / `error.tsx` conventions | Framework streaming; error file gets `retry` prop in this version |

**Key insight:** everything hard in this phase (a11y, collation, pluralization) looks trivial and is not; each has either a standard library or a verified 5-line expression — none warrant custom machinery.

## Runtime State Inventory

> Omitted: this is a greenfield feature phase (no rename/refactor/migration). No schema changes, no stored-data migration — `employees`/`departments` tables and migration 0000 already exist and are untouched. Verified: `drizzle/` contains only `0000_amusing_talon.sql`; `db/schema.ts` already matches all phase needs.

## Common Pitfalls

### Pitfall 1: Stale UI after Server Action (Next 16 behavior change)
**What goes wrong:** Action returns `{ok}` but list/card still shows old data.
**Why:** Since Next 16, the action response re-renders the route only if the action called `refresh()`/`updateTag`/`revalidatePath`/`redirect`, or mutated cookies. [VERIFIED: bundled docs 02-guides/server-actions.md]
**Avoid:** every mutation action ends with `refresh()` before returning state.
**Warning signs:** manual browser reload "fixes" it.

### Pitfall 2: `error.tsx` written with the old `reset` prop
**What goes wrong:** UI-SPEC's «Попробовать снова» button does nothing / type error.
**Why:** This Next version's error boundary props are `{ error, retry }` — `reset` was the pre-16 name. [VERIFIED: bundled docs 03-file-conventions/error.md]
**Avoid:** destructure `retry`; button `onClick={() => retry()}`.

### Pitfall 3: Pagination links drop the active filter (or vice versa)
**What goes wrong:** Clicking «Далее» on the Архив tab lands on page 2 of Активные.
**Why:** `?page=2` replaces the whole query string.
**Avoid:** a tiny `buildQuery({filter, page})` helper; segmented links carry `page=1` reset.
**Warning signs:** total count label disagrees with rows shown.

### Pitfall 4: Zero-page after archiving/unarchiving
**What goes wrong:** On the last page holding 1 row, archiving the row leaves `?page=7` of now-6 pages → empty view.
**Avoid:** after mutation, `refresh()` recomputes; server clamps `page = min(page, pages)` — never render a page beyond `ceil(total/size)`.

### Pitfall 5: shadcn init pulls the wrong theme
**What goes wrong:** `-d/--defaults` applies preset **nova**; base-color prompts add tokens the UI-SPEC then fights.
**Why:** CLI v4 flags changed: `-b` is the component *library* (base|radix|aria), `-p` is preset. [CITED: ui.shadcn.com/docs/cli]
**Avoid:** `npx shadcn@latest init -b base` (no preset, no `-d`); the UI-SPEC overrides every token in `globals.css` afterwards anyway. Use `add --dry-run` to preview generated files.

### Pitfall 6: Hand-rolled Cyrillic sort
**What goes wrong:** «Ёлкин Пётр» sorts first (before «Анна») with plain ORDER BY; `NOCASE` doesn't help Cyrillic; `db.collation()` doesn't exist in better-sqlite3 13. [VERIFIED: executed locally]
**Avoid:** Pattern 4 expression server-side; `Intl.Collator('ru')` client-side only.

### Pitfall 7: Testing actions directly in vitest
**What goes wrong:** Importing `app/(app)/employees/actions.ts` in vitest pulls `next/headers` (via `requireSession`) and fails in node env.
**Avoid:** keep all db logic in `db/queries/employees.ts` (pure, testable against `createTempDb()` + `applyMigrations()` from `tests/helpers.ts`); actions stay thin (session + zod + call + refresh). Phase 1 already stubs `server-only` in `vitest.config.ts`.

## Code Examples

### List query (join + filter + RU sort + page) — VERIFIED executable this session
```ts
// Source: executed against installed drizzle-orm 0.45.2 + better-sqlite3 13.0.3 (see research-store 47f6d983)
import { count, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { departments, employees } from '@/db/schema'

const ruSort = sql`replace(replace(${employees.name}, 'Ё', 'Е'), 'ё', 'е')`

export function listEmployees({ filter, page, pageSize }: { filter: 'active' | 'archive'; page: number; pageSize: number }) {
  const isActive = filter === 'active' ? 1 : 0
  const rows = db
    .select({ id: employees.id, name: employees.name, department: departments.name })
    .from(employees)
    .innerJoin(departments, eq(employees.departmentId, departments.id))
    .where(eq(employees.isActive, isActive))
    .orderBy(ruSort)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()
  const total = db.select({ value: count() }).from(employees)
    .where(eq(employees.isActive, isActive)).get()!.value   // plain number on better-sqlite3
  return { rows, total }
}
```
(`db.$count(table, where)` also exists but returns an async builder — prefer `count().get()` in sync action code. VERIFIED both.)

### Page + card skeleton (Next 16 async props, verified prop shapes)
```tsx
// Source: bundled docs page.md/dynamic-routes.md — params & searchParams are Promises
export default async function EmployeeCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const employeeId = z.coerce.number().int().positive().safeParse(id)
  if (!employeeId.success) notFound()
  await requireSession()
  const row = getEmployee(employeeId.data)
  if (!row) notFound()
  // …
}
```

### Archive action (conditional update; no delete path exists anywhere)
```ts
'use server'
export async function archiveEmployee(_prev: unknown, formData: FormData) {
  await requireSession()
  const parsed = z.object({ id: z.coerce.number().int().positive() }).safeParse({ id: formData.get('id') })
  if (!parsed.success) return { error: 'Не удалось сохранить. Попробуйте ещё раз.' }
  db.update(employees).set({ isActive: 0 }).where(eq(employees.id, parsed.data.id)).run()
  refresh()
  return { ok: true }
}
```

## State of the Art

| Old Approach (training-data era) | Current Approach (verified this session) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` | `proxy.ts` on Node runtime | Next 16 | Already established in phase 1; nothing to do |
| Sync `params`/`searchParams` props | Both are Promises (`await` / React `use`) | Next 15–16 | All new pages |
| `error.tsx` prop `reset` | Prop `retry` | this Next version | UI-SPEC's «Попробовать снова» wiring |
| Action + `revalidatePath` reflex | `refresh()` from `next/cache` for non-cached (dynamic) views | Next 16 | All 4 actions |
| shadcn combobox = popover + cmdk Command | Native `combobox` primitive (Base UI; built-in filter, `ComboboxEmpty`, function-child list) | shadcn registry, Base UI default since Jul 2026 | Simpler D-03 implementation; popover+command still available as fallback |
| `@base-ui-components/react` | renamed **`@base-ui/react`** | 2025-2026 | Only relevant if hand-installing (don't) |
| shadcn `init -b <base-color>` | `-b` = component library (base/radix/aria); presets via `-p` (nova default in `-d`) | CLI v4 | Init task flags |
| `db.collation()` custom collation for sorting | **Absent** in better-sqlite3 v13 | v13 API surface (verified: prepare, transaction, pragma, function, aggregate, table, … — no collation) | Use SQL sort-key expression |
| Geist Sans default font | System stack (`-apple-system, …`) for Cyrillic; Geist Mono retained for `--font-mono` | UI-SPEC decision | `app/layout.tsx` + `globals.css` edits |

**Deprecated/outdated to remove in this phase:** dark-mode block in `globals.css` (UI-SPEC: light only); `font-medium` occurrences (weight set is 400/600 only); Arial body font-family fallback in `globals.css`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `npx shadcn@latest add combobox` yields a Base UI combobox primitive whose API matches the fetched docs (Combobox/ComboboxInput/ComboboxContent/ComboboxEmpty/ComboboxList/ComboboxItem, custom items) | Standard Stack, Pattern section | Low: fallback is popover+command (approved by UI-SPEC text); verify with `add --dry-run` before wiring [CITED: ui.shadcn.com/docs/components/combobox] |
| A2 | shadcn init works non-interactively with `-b base` and skips prompts (init default `-y true`) | Pitfall 5 | Low: worst case an interactive prompt appears; executor picks defaults matching UI-SPEC (no preset) [CITED: ui.shadcn.com/docs/cli] |
| A3 | Generated shadcn components import `@base-ui/react` (new name) and the CLI installs it transitively | Package Legitimacy Audit | Low: CLI manages it; only matters for manual installs |
| A4 | All seeded employees have `isActive=1`, so the «Архив» empty state is what dev shows until first archive | Validation (manual checks) | Trivial: verified in `scripts/seed.mjs` (is_active 1 always) — not really an assumption |
| A5 | UI-aesthetic compliance (UI-02) is verified manually / at UAT, not by automated tests | Validation Architecture | None on correctness; affects gate design only |

## Open Questions

1. **Native `combobox` vs popover+command — final composition**
   - What we know: UI-SPEC text prescribes popover+command; registry now ships a native combobox with built-in filtering; approved visual contract is identical either way; D-03 leaves composition form to the planner.
   - What's unclear: exact generated API quality for a pinned «Создать „X"» first row.
   - Recommendation: first task installs both candidates (`add --dry-run`), pick native combobox if the custom first item is clean, else popover+command. No user decision needed (within UI-SPEC's stated composition latitude? — strictly speaking UI-SPEC named popover+command, so if the planner switches to native combobox, note the substitution in the plan).

2. **Post-archive navigation on the card page**
   - What we know: UI-SPEC shows the badge «В архиве» + button toggling to «Разархивировать» on the same card — i.e., archive keeps you on the card (`refresh()` covers it).
   - Recommendation: stay on card; no redirect. (List rows simply disappear from Активные on next visit/refresh.)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | 22.23.0 (runtime-verified) | — |
| npm | shadcn CLI (npx), installs | ✓ | ships with Node | — |
| next | framework | ✓ | 16.3.3 (installed) | — |
| better-sqlite3 | db | ✓ | 13.0.3 (installed) | — |
| drizzle-orm / drizzle-kit | queries / (no migration needed) | ✓ | 0.45.2 / 0.31.10 (installed) | — |
| vitest | tests | ✓ | 4.1.11 (installed, configured) | — |
| Network access | `npx shadcn@latest` downloads registry + packages | assumed ✓ (npm registry reachable this session) | — | offline would block shadcn init → task ordering: init first |
| Docker | not needed this phase | — | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.11 (installed, `vitest.config.ts` with `@/` alias + server-only stub) |
| Config file | `vitest.config.ts` (exists) |
| Quick run command | `npx vitest run tests/employees-queries.test.ts tests/ru.test.ts` |
| Full suite command | `npx vitest run` |
| Fixtures | `tests/helpers.ts`: `createTempDb()` (pragmas) + `applyMigrations()` (drizzle SQL) — reuse for employee queries |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EMP-01 | createEmployee with existing dept → row inserted; with new dept → dept created + linked; duplicate dept name → reuses existing | unit/integration (temp SQLite) | `npx vitest run tests/employees-queries.test.ts -t 'create'` | ❌ Wave 0 |
| EMP-01 | updateEmployee changes name/dept; unknown id → no row | unit/integration | `npx vitest run tests/employees-queries.test.ts -t 'update'` | ❌ Wave 0 |
| EMP-03 | setArchived(id, true/false) flips isActive; archived excluded from active page & counts, included in archive; history-safe (no delete) | unit/integration | `npx vitest run tests/employees-queries.test.ts -t 'archive'` | ❌ Wave 0 |
| EMP-01/D-01 | listEmployees pagination: returns ≤pageSize, correct offsets, total counts per filter; page clamp helper | unit/integration | `npx vitest run tests/employees-queries.test.ts -t 'pagination'` | ❌ Wave 0 |
| UI-01 | `pluralEmployees`: 1→сотрудник, 2→сотрудника, 5→сотрудников, 21→сотрудник, 22→сотрудника, 111→сотрудников | unit | `npx vitest run tests/ru.test.ts` | ❌ Wave 0 |
| UI-01 | All UI strings Russian — code review against UI-SPEC copy table (mechanical: grep for stray English labels) | manual/code-review | — (review checklist) | — |
| UI-02 | Apple aesthetic (spacing scale, weights 400/600, accent discipline, motion, reduced-motion) | manual-only | — | Justification: visual properties not assertable in node-env vitest; covered by UI-SPEC contract + phase UAT |

### Sampling Rate
- **Per task commit:** `npx vitest run` (suite is seconds-fast)
- **Per wave merge:** `npx vitest run && npm run build` (build catches RSC/client boundary mistakes)
- **Phase gate:** full suite green before `/gsd:verify-work`; visual checks at UAT against UI-SPEC contract

### Wave 0 Gaps
- [ ] `tests/employees-queries.test.ts` — covers EMP-01/EMP-03/pagination (uses existing helpers; migrations already present — no new migration)
- [ ] `tests/ru.test.ts` — covers UI-01 plural helper
- [ ] No framework install needed (vitest configured in phase 1)

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` (config.json). Phase 2 adds no new auth surface — it extends the guarded `(app)` zone.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged) | phase-1 jose session; phase 2 only consumes it |
| V3 Session Management | no (unchanged) | `requireSession()` per page/action (defense-in-depth, ACC-02) |
| V4 Access Control | yes | Every new page + action calls `requireSession()` first — Server Actions are reachable by direct POST (official warning); single-user app so no roles; ID params validated (`notFound()` on garbage) |
| V5 Input Validation | yes | zod `safeParse` on every action input: name (trim, 1..100), departmentId/int, id/int, filter enum, page/int ≥1; `searchParams` never trusted |
| V6 Cryptography | no | Nothing new to hash/encrypt |
| V7 Errors/Logging | yes | Generic Russian mutation error («Не удалось сохранить…») with `role=alert`; internal errors not leaked to UI; `error.tsx` logs via console only |
| V14 Configuration | yes | No new env vars; no new endpoints outside proxy perimeter; do not add anything to proxy `PUBLIC_PATHS` |

### Known Threat Patterns for Next 16 + Server Actions + SQLite

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via name/filter/page inputs | Tampering | Drizzle parameterized queries (VERIFIED: `eq()`/`sql` auto-parameterize); filter/page mapped through validated enums/ints, never interpolated |
| Unauthenticated Server Action invocation | Spoofing/Elevation | `requireSession()` at the top of every action (proxy does not protect action POSTs by itself — phase-1 verified) |
| XSS via employee/department names | Tampering | React escapes text nodes; `truncate` via CSS; never `dangerouslySetInnerHTML` |
| CSRF on action POSTs | Spoofing | Next.js Server Actions enforce same-origin (Host/Origin check) by framework; session cookie is `sameSite: lax` (phase 1) |
| Mass-assignment | Tampering | zod schemas whitelist exactly {name, departmentId} / {id} — no raw form spread into `.set()` |
| Duplicate department race (UI-SPEC «Такой отдел уже есть») | Tampering | UNIQUE index + catch `SQLITE_CONSTRAINT_UNIQUE` → re-select (Pattern 3) |
| Accidental data loss via delete | Repudiation/DoS | No delete endpoint or button exists (EMP-03); employees row has `restrict` FKs from devices/movements |

## Sources

### Primary (HIGH confidence — executed/verified this session)
- Local runtime executions against installed deps: drizzle pagination/join/count/tx, `SQLITE_CONSTRAINT_UNIQUE` race, RU sort expression, better-sqlite3 v13 API surface (no collation), `Intl.PluralRules('ru')` / `Intl.Collator('ru')` — cached as research-store `47f6d983`, `e8be274c`
- `node_modules/next/dist/docs/` (bundled official docs, Next 16.3.3): page.md, dynamic-routes.md (Promise props), 07-mutating-data.md, 02-guides/server-actions.md (refresh/revalidate semantics), 03-file-conventions/error.md (`retry` prop), loading.md, 04-functions/refresh.md, revalidatePath.md
- Codebase (phase-1 verified facts): `db/schema.ts`, `db/index.ts` pragmas, `lib/auth.ts`, `app/(app)/` (no layout yet), `tests/helpers.ts`, `vitest.config.ts`, `scripts/seed.mjs`, `app/globals.css`, `app/layout.tsx`, `package.json`

### Secondary (MEDIUM confidence — official docs cited, not executed)
- ui.shadcn.com/docs/installation/next (init/add flow), /docs/cli (v4 flags: `-b` library, presets, `-y` defaults), /docs/components/combobox (native Base UI combobox) — cached as research-store `337b6616`, `aa785aaf`
- npm registry: deprecation notice `@base-ui-components/react → @base-ui/react`; versions shadcn 4.19.1, lucide-react 1.39.0, @base-ui/react 1.7.0, cmdk 1.1.1

### Tertiary (LOW confidence)
- None — no claim in this document rests on training data alone; the two [ASSUMED] items (A1–A3) are explicitly flagged and cheap to verify at execution time.

## Metadata

**Confidence breakdown:**
- Data layer (queries, transactions, sort, race): HIGH — executed against installed versions
- Next.js 16 API shapes (props, refresh, error boundary): HIGH — bundled official docs read this session
- shadcn ecosystem (CLI flags, combobox primitive, package names): MEDIUM — official docs cited; registry content drifts, verified at execution via `--dry-run`
- Pitfalls: HIGH — each is either a verified behavior or a documented contract violation

**Research date:** 2026-09-01
**Valid until:** 2026-10-01 (stable: pinned project deps; shadcn registry is fast-moving — re-check `combobox` API if phase starts later than a month out)
