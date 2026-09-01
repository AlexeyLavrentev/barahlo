# Phase 2: Employees - Pattern Map

**Mapped:** 2026-09-01
**Files analyzed:** 18 (14 new, 4 modified)
**Analogs found:** 14 / 18 (4 have no in-repo analog — framework conventions or registry-generated)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/(app)/layout.tsx` (NEW) | layout | request-response | `app/(app)/page.tsx` | exact (guard + shell styles) |
| `app/(app)/page.tsx` (MODIFY: redirect stub) | page | request-response | `app/(app)/actions.ts` (redirect pattern) | role-match |
| `app/(app)/employees/page.tsx` (NEW) | page (RSC controller) | request-response | `app/(app)/page.tsx` + `app/login/page.tsx` | role-match (searchParams has no analog) |
| `app/(app)/employees/loading.tsx` (NEW) | boundary (loading) | request-response | — none | no analog (framework convention) |
| `app/(app)/employees/error.tsx` (NEW) | boundary (error) | request-response | — none | no analog (`retry` prop, not `reset`) |
| `app/(app)/employees/actions.ts` (NEW) | action (mutations) | CRUD | `app/login/actions.ts` | exact |
| `app/(app)/employees/employees-list.tsx` (NEW) | component (server) | request-response | `app/login/page.tsx` (card shell) | role-match |
| `app/(app)/employees/employee-dialog.tsx` (NEW) | component (client) | request-response (action invocation) | `app/login/login-form.tsx` | exact |
| `app/(app)/employees/[id]/page.tsx` (NEW) | page (RSC detail) | request-response | `app/(app)/page.tsx` | role-match (dynamic params no analog) |
| `app/(app)/employees/[id]/loading.tsx` (NEW) | boundary (loading) | request-response | — none | no analog |
| `app/(app)/employees/[id]/error.tsx` (NEW) | boundary (error) | request-response | — none | no analog |
| `components/ui/*` (NEW, shadcn-generated) | component library | — | — none (registry copy-in) | no analog (generated) |
| `lib/ru.ts` (NEW) | utility (pure) | transform | `lib/normalize.ts` | exact |
| `db/queries/employees.ts` (NEW) | service (data access) | CRUD | `app/login/actions.ts` (db usage) + `db/index.ts` | role-match (first queries module) |
| `tests/employees-queries.test.ts` (NEW) | test (db integration) | CRUD/batch | `tests/schema.test.ts` | exact |
| `tests/ru.test.ts` (NEW) | test (pure unit) | transform | `tests/normalize.test.ts` | exact |
| `app/globals.css` (MODIFY) | config (tokens) | — | itself (baseline to override) | role-match |
| `app/layout.tsx` + `app/login/{page,login-form}.tsx` (MODIFY: font + restyle normalization) | layout/component | — | themselves | role-match |

---

## Pattern Assignments

### `app/(app)/employees/actions.ts` (action, CRUD) — also `app/(app)/layout.tsx`, employee pages

**Analog:** `app/login/actions.ts` — the one existing Server Action; phase 2 actions copy its exact shape.

**Imports + 'use server' pattern** (lines 1-11):
```ts
'use server'

import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { createSession } from '@/lib/session'
import { checkRateLimit, recordFailure, resetFailures } from '@/lib/rate-limit'
import { DUMMY_HASH } from '@/lib/dummy-hash'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
```
Employee actions swap bcrypt/rate-limit for `requireSession` from `@/lib/auth`, import `db` from `@/db`, tables from `@/db/schema`, operators from `drizzle-orm`, and `refresh` from `next/cache` (NEW — see Shared Patterns; login's `redirect` is replaced by `refresh()` for mutations that stay on-page).

**Zod schema at module top** (lines 13-16):
```ts
const LoginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
})
```

**Action signature + safeParse + Russian error string** (lines 24-35) — the `(_prev, formData) => state` shape that `useActionState` consumes:
```ts
export async function login(
  _prev: unknown,
  formData: FormData,
): Promise<{ error?: string }> {
  const parsed = LoginSchema.safeParse({
    login: formData.get('login'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: 'Введите логин и пароль' }
```
Employee actions keep this shape; inline field errors come from `parsed.error.flatten().fieldErrors` (new — login only had a whole-form error). Generic failure copy per UI-SPEC: «Не удалось сохранить. Попробуйте ещё раз.»

**Session-guard ordering for actions** — `app/(app)/page.tsx` lines 1-5 is the established guard call-site; `lib/auth.ts` lines 7-15 documents WHY actions must re-check:
```ts
// Second layer of defense (ACC-02): the proxy perimeter alone is not
// sufficient for Server Actions — they POST to their owning route, so every
// protected page / mutating entry-point re-checks the session here.
export const requireSession = cache(async () => {
  const cookieStore = await cookies()
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value)
  if (!session) redirect('/login')
  return session
})
```
Apply: `await requireSession()` as the FIRST line of every action in `employees/actions.ts` and every new page.

**Redirect control flow** (login actions.ts line 59) — note for any action that navigates:
```ts
redirect('/') // throws NEXT_REDIRECT — fine under useActionState
```

---

### `app/(app)/employees/employee-dialog.tsx` (client component, action invocation) + archive-confirm dialog

**Analog:** `app/login/login-form.tsx` — the one existing client component; dialogs copy its exact `useActionState` wiring.

**Full pattern** (lines 1-8, 44-48, 50-56):
```tsx
'use client'

import { useActionState } from 'react'
import { login } from './actions'

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, {})
```
```tsx
      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
      >
        {pending ? 'Вход…' : 'Войти'}
      </button>
```
What to copy: `useActionState(action, {})` destructure, `<form action={formAction}>`, `pending` disabling the submit button, `role="alert"` for the generic error. What to change: shadcn `Dialog`/`Button`/`Input` primitives replace raw tags; `text-red-600` inline errors become UI-SPEC `#D70015` 14/400 under the field; the pending label pattern («Вход…») is the precedent for «Сохранение…»-style pending copy; close the dialog when state signals `ok` (login closes via redirect — dialogs need an explicit effect on state change).

**Dialog-open trigger from a server component:** `app/(app)/page.tsx` lines 16-23 shows the existing logout `<form action={...}>` embedded in a server component — the same "server page renders a small client island" composition the list page uses for the dialog:
```tsx
        <form action={logout} className="mt-8">
          <button
            type="submit"
            className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700"
          >
            Выйти
          </button>
        </form>
```
The top bar «Выйти» in the new `app/(app)/layout.tsx` reuses this existing `logout` action from `./actions` verbatim.

---

### `app/(app)/employees/page.tsx` (RSC list) and `[id]/page.tsx` (RSC detail)

**Analog:** `app/login/page.tsx` for page shell + metadata; `app/(app)/page.tsx` for the guard; card markup baseline.

**Page shell + metadata pattern** (`app/login/page.tsx` lines 1-12):
```tsx
import type { Metadata } from 'next'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Вход',
}

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-neutral-50 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-neutral-200">
```
The `rounded-2xl bg-white shadow-sm ring-1` card is already the UI-SPEC look (16px radius, hairline, whisper shadow) — the list card and «Техника» card reuse this class recipe with UI-SPEC token colors. Note `export const metadata` per page — apply to `/employees` («Сотрудники») and the card page.

**Guard-first server page pattern** (`app/(app)/page.tsx` lines 4-5):
```tsx
export default async function AppPage() {
  await requireSession() // defense-in-depth: proxy + in-app guard
```

**NO in-repo analog for `searchParams`/`params`** — `/employees` and `[id]` are the first pages to use them. This Next version's shapes (from RESEARCH.md, verified against bundled docs — planner must put these in the plan):
```tsx
// props are Promises; validate before use; garbage id → notFound()
export default async function EmployeeCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const employeeId = z.coerce.number().int().positive().safeParse(id)
  if (!employeeId.success) notFound()
```
Pagination/fiter state lives in the URL (`?filter=archive&page=2`); links must rebuild the FULL query string.

---

### `db/queries/employees.ts` (service, CRUD) — first data-access module

**Analog:** `app/login/actions.ts` lines 9-11, 37-41 (only existing db usage) + `db/index.ts` (mandatory entry point).

**Import + drizzle query pattern** (`app/login/actions.ts` lines 9-11 and 37-41):
```ts
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
```
```ts
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.login, parsed.data.login))
    .limit(1)
```
`db/index.ts` (lines 1-9) is the ONLY db entry — queries import `db` from `@/db`; pragmas (WAL, foreign_keys ON, busy_timeout) already applied per connection; better-sqlite3 is sync (`.get()`/`.all()`/`.run()`, `count().get()` returns a plain number):
```ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

const sqlite = new Database(process.env.DATABASE_PATH ?? './data/app.db')
sqlite.pragma('journal_mode = WAL') // persistent per-DB file; README-recommended
sqlite.pragma('foreign_keys = ON') // SQLite default is OFF — per connection!
sqlite.pragma('busy_timeout = 5000')

export const db = drizzle(sqlite)
```

**Target tables already in schema** — `db/schema.ts` lines 28-36 and 49-57 (phase 2 needs NO migration):
```ts
export const departments = sqliteTable(
  'departments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('departments_name_uq').on(t.name)],
)
```
```ts
export const employees = sqliteTable('employees', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  departmentId: integer('department_id')
    .notNull()
    .references(() => departments.id, { onDelete: 'restrict' }),
  isActive: integer('is_active').notNull().default(1),
  createdAt: createdAt(),
})
```
`onDelete: 'restrict'` + no DELETE code anywhere = archive-only semantics (EMP-03) are schema-guaranteed already.

**Why a separate module (RESEARCH Pitfall 7):** keep ALL db logic here — pure functions, no `next/headers` — so actions stay thin (session + zod + call + `refresh()`) and tests never import action files. Verified query shapes (RU sort expr, tx with UNIQUE-race catch, pagination) live in RESEARCH.md Patterns 1-4; no in-repo code to copy for those.

---

### `lib/ru.ts` (utility, pure)

**Analog:** `lib/normalize.ts` — the existing pure-util convention.
```ts
// Thin typed entry point for app code (phases 2–6). The implementation lives
// in lib/normalize.mjs so scripts/*.mjs share it without a build step.
```
`lib/ru.ts` is simpler — pure TS with no script-sharing twin is fine (only `normalize` needed the .mjs split because `scripts/*.mjs` import it). Convention to copy: named exports of small pure functions, no side effects, no imports beyond Node built-ins (`Intl.PluralRules`, `Intl.Collator`), header comment stating the contract.

---

### `tests/employees-queries.test.ts` (test, db integration)

**Analog:** `tests/schema.test.ts` — exact structure to copy.

**Setup pattern** (lines 1-17):
```ts
import { describe, it, expect, afterAll } from 'vitest'
import type Database from 'better-sqlite3'
import { applyMigrations, createTempDb, insertDevice } from './helpers'

let sqlite: Database.Database | undefined

function db(): Database.Database {
  if (!sqlite) {
    sqlite = createTempDb()
    applyMigrations(sqlite)
  }
  return sqlite
}

afterAll(() => {
  sqlite?.close()
})
```
Copy: lazy `db()` helper, `afterAll` close, one `describe` per behavior group. For employee-query tests, seed rows through the functions under test (`db/queries/employees.ts` create functions) or raw `sqlite.prepare('INSERT INTO employees ...')` like schema.test.ts does for devices (lines 48-55 show the `toThrow(/UNIQUE constraint failed/)` assertion style — reusable for the department-UNIQUE race test).

**Helpers available** — `tests/helpers.ts` lines 8-18 and 26-46: `createTempDb()` (same pragmas as production) and `applyMigrations()` (drizzle SQL in lexical order). Reuse as-is; add an `insertEmployee` raw-SQL helper next to `insertDevice` if seeding by hand is cleaner.

**Pure-unit test analog** for `tests/ru.test.ts` — `tests/normalize.test.ts` lines 1-5:
```ts
import { describe, expect, it } from 'vitest'
import { normalizeInventory, normalizeNumber, normalizeSerial } from '@/lib/normalize'
```
Flat `describe`/`it` with one behavior per `it`, table-driven loops for category matrices (see lines 16-27 for the loop-over-map style — ideal for the 1/2-4/5-20/21/111 plural table). `vitest.config.ts` already has the `@/` alias and the `server-only` stub — no config changes.

---

### `app/globals.css` (MODIFY) and `app/layout.tsx` (MODIFY)

**Analog:** themselves — edit, don't rewrite.

Current `globals.css` (lines 1-26) has exactly what UI-SPEC says to remove/replace:
```css
@media (prefers-color-scheme: dark) {   /* lines 15-20: DELETE — light theme only */
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;   /* line 25: replace with system stack */
}
```
The `@theme inline` block (lines 8-13) is the hook where UI-SPEC tokens (`--color-page`, `--color-surface`, `--color-ink`, `--color-ink-secondary`, `--color-hairline`, `--color-accent`, `--color-destructive`) land after `shadcn init` writes its own layer.

Current `app/layout.tsx` lines 1-13 is what changes (drop Geist Sans, keep Geist Mono for `--font-mono`):
```tsx
import { Geist, Geist_Mono } from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
```
Keep: `lang="ru"` (line 23), `metadata` Russian copy (lines 15-18), the `LayoutProps<"/">` typed-props style (line 20 — this Next version's convention), `h-full antialiased` classes.

---

### `app/login/page.tsx` + `app/login/login-form.tsx` (MODIFY: normalization only)

**Analog:** themselves. Copy stays («Логин», «Пароль», «Войти», error strings per UI-SPEC). Mechanical substitutions: `font-medium` → `font-semibold` (weight set is 400/600 only), `py-2.5`/`mt-1.5` → `py-2`/`mt-2` (6px/10px forbidden), neutral classes → UI-SPEC tokens, focus `border-neutral-900 ring-neutral-900/10` → accent `#0071E3` ring. Structure of the form (labels htmlFor, autoComplete, `role="alert"` block) does not change.

---

## Shared Patterns

### Session guard — every new page AND action
**Source:** `lib/auth.ts` (lines 7-15) + call-site `app/(app)/page.tsx` line 5
**Apply to:** `app/(app)/layout.tsx` (or each page — follow phase-1 per-page style), `/employees` page, `[id]` page, all 4+ actions in `employees/actions.ts`
```ts
await requireSession() // defense-in-depth: proxy + in-app guard
```
Server Actions are directly POST-able; the proxy does not protect them (documented in `lib/auth.ts` header comment).

### Zod safeParse at action entry, Russian error strings inline
**Source:** `app/login/actions.ts` lines 13-16, 28-32
**Apply to:** all employee actions — schemas whitelist exactly the submitted fields (name/departmentId, id, filter enum, page int) — no raw FormData spread into `.set()`
```ts
const parsed = LoginSchema.safeParse({ login: formData.get('login'), password: formData.get('password') })
if (!parsed.success) return { error: 'Введите логин и пароль' }
```

### `useActionState` client form/dialog
**Source:** `app/login/login-form.tsx` lines 6-8, 44-48, 50-56
**Apply to:** `employee-dialog.tsx`, archive-confirm dialog, any client component invoking an action
```ts
const [state, formAction, pending] = useActionState(login, {})
```

### Drizzle via `@/db` only; sync better-sqlite3
**Source:** `db/index.ts` lines 1-9; usage `app/login/actions.ts` lines 37-41
**Apply to:** `db/queries/employees.ts` and any ad-hoc db access. `.get()`/`.all()`/`.run()` are sync; `count()` → `.get()!.value`.

### Tests: temp SQLite + real migrations; pure tests import via `@/`
**Source:** `tests/schema.test.ts` lines 1-17; `tests/helpers.ts` `createTempDb()`/`applyMigrations()`; `tests/normalize.test.ts` line 2
**Apply to:** `tests/employees-queries.test.ts`, `tests/ru.test.ts`. Never import action files in vitest (they pull `next/headers`) — test `db/queries/employees.ts` instead.

### Russian UI strings inline, no i18n
**Source:** every existing file («Вход», «Логин», «Экраны появятся в фазах 2–6»)
**Apply to:** all phase-2 files — copy table in 02-UI-SPEC.md is the canonical string source.

### Styling baseline → UI-SPEC tokens
**Source:** `app/login/page.tsx` line 11 (`rounded-2xl bg-white p-8 shadow-sm ring-1 ring-neutral-200` — already the card recipe) vs `app/globals.css` (dark block + Arial to remove)
**Apply to:** all new UI. Existing code uses Tailwind `neutral-*` classes; new code uses the `@theme` tokens from UI-SPEC (`--color-page` `#F5F5F7`, `--color-accent` `#0071E3`, etc.). Radii: cards `rounded-2xl`, controls `rounded-lg`. Press feedback `active:scale-[0.97] duration-100 ease-out` on every button/row. No `font-medium`, no half-step spacing (`py-2.5`, `mt-1.5`, `px-2.5`).

---

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns + bundled Next docs instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `app/(app)/employees/loading.tsx`, `[id]/loading.tsx` | boundary | request-response | No loading boundary exists yet. Next convention: auto-wrapped skeleton; UI-SPEC contract = 5 skeleton rows `h-11 bg-black/5 rounded-lg` inside the white card |
| `app/(app)/employees/error.tsx`, `[id]/error.tsx` | boundary | request-response | No error boundary exists yet. **This Next version: props are `{ error, retry }` — NOT `reset`**; must be `'use client'`; copy «Не удалось загрузить список» + «Попробовать снова» → `onClick={() => retry()}` |
| `components/ui/*` (button, input, label, badge, dialog, combobox; fallback popover+command) | component library | — | Registry copy-in via `npx shadcn@latest init -b base` + `add -y ...` (no `components.json` exists — confirmed). Flags per RESEARCH Pitfall 5: `-b` = library, NEVER `-d` (pulls preset nova). Generated code follows the registry, not repo patterns |
| `app/(app)/employees/page.tsx` searchParams handling, `[id]` dynamic params | page props | request-response | First dynamic/parametrized routes in the app — props are **Promises** to `await` (RESEARCH Pattern 1 + Code Examples; bundled docs page.md/dynamic-routes.md) |
| `db/queries/employees.ts` — pagination/tx/RU-sort specifics | service | CRUD | First queries module. Query mechanics (join+filter+sort-key expression, `SQLITE_CONSTRAINT_UNIQUE` race catch, count) are RESEARCH Patterns 1-4, verified against installed drizzle 0.45.2 + better-sqlite3 13.0.3 — copy from there, not from repo code |

## Metadata

**Analog search scope:** `app/`, `lib/`, `db/`, `tests/`, `scripts/`, root config files (full source tree — 42 source files, all read or inspected)
**Files scanned:** 15 read in full (`app/login/*`, `app/(app)/*`, `lib/auth.ts`, `lib/normalize.ts`, `db/schema.ts`, `db/index.ts`, `tests/helpers.ts`, `tests/schema.test.ts`, `tests/normalize.test.ts`, `app/layout.tsx`, `app/globals.css`, `vitest.config.ts`)
**Key structural facts:** no `components/` dir, no `components.json`, no `db/queries/`, no `loading.tsx`/`error.tsx` anywhere — phase 2 introduces all four
**Pattern extraction date:** 2026-09-01
