# Phase 1: Foundation - Pattern Map

**Mapped:** 2026-08-31
**Files analyzed:** 33 (planned new/modified files)
**Analogs found:** 0 / 33 — GREENFIELD: the repository contains no application code (verified: only `.git/`, `.planning/`, `.claude/` exist; no `package.json`, no `src/`, no `app/`)

## Greenfield Adaptation

There are **no existing codebase analogs to copy from**. Phase 1 *creates* the patterns that phases 2–6 will copy (confirmed by `01-CONTEXT.md` "Existing Code Insights": "None — greenfield; фаза 1 задаёт паттерны (auth-guard, DB-доступ, структура routes) для фаз 2–6", and `.claude/CLAUDE.md` line 146: "Conventions not yet established").

In place of analogs, every file below is mapped to its **authoritative prescription** with exact line references:

| Authority | Location | Contains |
|-----------|----------|----------|
| `01-RESEARCH.md` | `.planning/phases/01-foundation/` | Patterns 1–6 (lines 227–422) + Code Examples (lines 498–587) — verified against official docs this session |
| `.planning/research/ARCHITECTURE.md` | data model (lines 89–153), movements hybrid (155–177), build order (247–271) | Canonical schema v1 and invariants |
| `.planning/research/PITFALLS.md` | Pitfall 1 (9–29), Pitfall 5 (102–120), Pitfall 6 (124–144) | Phase-1-mandatory invariants |
| `.claude/CLAUDE.md` | stack (21–140), what-NOT-to-use (83–97) | Locked stack + forbidden libraries |
| Official Next.js `examples/with-docker` | github.com/vercel/next.js | Dockerfile baseline, quoted verbatim in `01-RESEARCH.md` lines 551–564 |

**Rule for the planner:** every code excerpt below is quoted verbatim from `01-RESEARCH.md` (itself fetched from official docs this session). Do not invent variants; copy these shapes.

## File Classification

All files are NEW unless marked. Match quality column is replaced by the authoritative reference (no analogs exist).

| New/Modified File | Role | Data Flow | Authoritative Reference (in lieu of analog) |
|-------------------|------|-----------|---------------------------------------------|
| `proxy.ts` | middleware (auth gate) | request-response | `01-RESEARCH.md` Pattern 1, lines 227–258 (code 236–259) |
| `app/login/page.tsx` | component | request-response | `01-RESEARCH.md` lines 57 (ACC-01), 202; `useActionState` contract from login action (lines 500–529) |
| `app/login/actions.ts` | controller (Server Action) | request-response | `01-RESEARCH.md` Code Examples, lines 498–529 |
| `app/(app)/page.tsx` | component (stub) | request-response | `01-RESEARCH.md` Open Question 5, lines 629–631; structure line 203 |
| `app/api/health/route.ts` | route handler | request-response | `01-RESEARCH.md` lines 204, 454 (curl gate-check target) |
| `lib/session.ts` | utility (service) | request-response | `01-RESEARCH.md` Pattern 2, lines 261–304 (code 264–301) |
| `lib/auth.ts` (or `dal.ts`) | utility (DAL guard) | request-response | `01-RESEARCH.md` lines 58 (ACC-02), 207, 233; CLAUDE.md line 108 |
| `lib/rate-limit.ts` | utility | in-memory state | `01-RESEARCH.md` lines 208, 507, 519–525; parameters A8 (line 611) |
| `lib/normalize.ts` | utility | transform | `01-RESEARCH.md` Code Examples, lines 579–587; PITFALLS.md Pitfall 5 (102–120) |
| `db/index.ts` | model (connection) | CRUD | `01-RESEARCH.md` Pattern 4, lines 353–365 (code 356–364); PITFALLS.md Pitfall 6 |
| `db/schema.ts` | model (schema) | CRUD | `01-RESEARCH.md` Pattern 3, lines 322–349; ARCHITECTURE.md lines 93–140 |
| `drizzle/0000_*.sql` + snapshot | migration (generated) | DDL | `01-RESEARCH.md` lines 59 (ACC-03), 306–309; PITFALLS.md Pitfall 1 (28–29) |
| `drizzle/…_append_only_triggers/migration.sql` | migration (custom) | DDL | `01-RESEARCH.md` lines 309–320 (trigger SQL verbatim) |
| `drizzle.config.ts` | config | — | `01-RESEARCH.md` line 224; drizzle-kit sqlite config (Sources, line 722) |
| `scripts/create-admin.mjs` | utility (CLI) | batch | `01-RESEARCH.md` lines 531–548 (D-13); D-02/D-13 same mechanics |
| `scripts/reset-admin.mjs` | utility (CLI) | batch | `01-RESEARCH.md` Code Examples, lines 533–547 |
| `scripts/seed.mjs` | utility (CLI) | batch | `01-RESEARCH.md` line 548 + D-11 (30–50 employees, ~80 devices) |
| `scripts/backup.mjs` | utility (CLI) | batch + file-I/O | `01-RESEARCH.md` Pattern 5, lines 367–395 (code 371–394) |
| `scripts/deploy.sh` | config script | batch | `01-RESEARCH.md` Pattern 6, lines 410–422 |
| `scripts/migrate.mjs` | utility (CLI, optional fallback) | batch | `01-RESEARCH.md` Assumption A1 (line 604), fallback at line 422 |
| `Dockerfile` | config (build) | — | `01-RESEARCH.md` lines 551–564 (official baseline + 3 extensions) |
| `compose.yml` | config (runtime) | — | `01-RESEARCH.md` lines 566–575 (verbatim) |
| `next.config.ts` (modify scaffold) | config | — | `.claude/CLAUDE.md` line 109: `output: "standalone"` |
| `.env.example` + `.gitignore` entries | config | — | `01-RESEARCH.md` Wave 0 gap, line 680 |
| `README.md` (restore runbook section) | docs | — | `01-RESEARCH.md` line 408 (restore procedure steps) |
| `vitest.config.ts` | config (test) | — | `01-RESEARCH.md` Wave 0 gap, line 677 |
| `tests/helpers.ts` | test utility | — | `01-RESEARCH.md` Wave 0 gap, line 678 (temp SQLite factory + migrate helper) |
| `tests/normalize.test.ts` | test | — | `01-RESEARCH.md` Test Map, line 661 |
| `tests/session.test.ts` | test | — | `01-RESEARCH.md` Test Map, line 662 |
| `tests/rate-limit.test.ts` | test | — | `01-RESEARCH.md` Test Map, line 663 |
| `tests/schema.test.ts` | test (integration) | — | `01-RESEARCH.md` Test Map, lines 664–665 |
| `tests/backup.test.ts` | test (integration) | — | `01-RESEARCH.md` Test Map, line 666 |
| `tests/proxy-matcher.test.ts` | test | — | `01-RESEARCH.md` Test Map, line 667 (A10, line 613) |

Scaffold baseline: `npx create-next-app` (App Router + TS + Tailwind v4 + ESLint, `01-RESEARCH.md` line 124) generates `app/layout.tsx`, `globals.css`, `tsconfig.json`, ESLint flat config, `package.json` — planner does not pattern-map these; the **only scaffold file needing modification is `next.config.ts`** (add `output: "standalone"`).

### Files explicitly NOT created this phase

| File | Why not | Authority |
|------|---------|-----------|
| `instrumentation.ts` | Documented anti-pattern for backups: delays readiness, hides failures | `01-RESEARCH.md` lines 199, 403, 431 |
| Uploads/attachments routes | Schema table only; upload UI is Phase 4 | `01-RESEARCH.md` line 351 |
| Devices/employees/movements screens | Phases 2–4 | `01-CONTEXT.md` domain boundary |

## Pattern Assignments

### `proxy.ts` (middleware, request-response)

**Analog:** None (greenfield). **Authoritative:** `01-RESEARCH.md` Pattern 1 (lines 227–259), from nextjs.org proxy + authentication docs.

**Core pattern — default-deny gate** (lines 236–259, copy verbatim):
```typescript
// proxy.ts — pattern from nextjs.org/docs (authentication guide + proxy reference)
import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/session'   // jose jwtVerify, no DB access

const PUBLIC_PATHS = ['/login']

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)

  if (!session && !PUBLIC_PATHS.includes(path)) {
    return NextResponse.redirect(new URL('/login', req.nextUrl))
  }
  if (session && path === '/login') {
    return NextResponse.redirect(new URL('/', req.nextUrl))   // already logged in
  }
  return NextResponse.next()
}

export const config = {
  // Default-DENY: everything gated except login page and framework assets.
  matcher: ['/((?!login|_next/static|_next/image|favicon.ico).*)'],
}
```

**Non-negotiables** (`01-RESEARCH.md` lines 231–233):
- The official docs' matcher example *excludes* `api` — here `api` must **NOT** be excluded. Public allowlist = `/login`, `_next/static`, `_next/image`, `favicon.ico` only.
- Node runtime only (Next 16; `middleware.ts` is gone, `runtime` export throws — lines 592–594).
- Proxy alone is insufficient for Server Actions (they POST to their owning route) — hence `requireSession()` (shared pattern below).

---

### `lib/session.ts` (utility, request-response)

**Analog:** None. **Authoritative:** `01-RESEARCH.md` Pattern 2 (lines 261–304), from nextjs.org authentication guide jose section.

**Core pattern** (lines 264–301, copy with D-01/D-04 adaptations already applied):
```typescript
// lib/session.ts
import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const SESSION_COOKIE = 'session'
const SESSION_TTL_DAYS = 30                        // D-01
const encodedKey = new TextEncoder().encode(process.env.AUTH_SECRET)  // openssl rand -base64 32

export async function createSession(userId: number) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(encodedKey)

  const cookieStore = await cookies()              // async in Next 16 (verified)
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // secure intentionally omitted — D-04 plain HTTP (http); Secure cookies are dropped by browsers on http
    expires: expiresAt,                            // persistent cookie: survives browser restart
    path: '/',
  })
}

export async function verifySession(token?: string) {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, encodedKey, { algorithms: ['HS256'] })
    return payload as { userId: number }
  } catch {
    return null
  }
}
```

**Error-handling pattern:** `verifySession` never throws — catch returns `null` (lines 293–301). Logout = `cookieStore.delete(SESSION_COOKIE)`, action-only (line 304). `cookies().set/.delete` are illegal during Server Component render (line 304) — session writes live only in the login action / a logout action.

---

### `app/login/actions.ts` (controller / Server Action, request-response)

**Analog:** None. **Authoritative:** `01-RESEARCH.md` Code Examples (lines 498–529), structure per official auth guide.

**Core pattern** (lines 500–528, copy; establishes the mutation pattern for phases 2–6):
```typescript
'use server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { createSession } from '@/lib/session'
import { checkRateLimit, recordFailure, resetFailures } from '@/lib/rate-limit'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

const LoginSchema = z.object({ login: z.string().min(1), password: z.string().min(1) })

export async function login(_prev: unknown, formData: FormData): Promise<{ error?: string }> {
  const parsed = LoginSchema.safeParse({ login: formData.get('login'), password: formData.get('password') })
  if (!parsed.success) return { error: 'Введите логин и пароль' }

  const blocked = checkRateLimit()                       // D-03: fixed window, e.g. 5 fails / 15 min, global
  if (blocked) return { error: 'Слишком много попыток. Попробуйте позже.' }

  const [user] = await db.select().from(users).where(eq(users.login, parsed.data.login)).limit(1)
  const valid = user && await bcrypt.compare(parsed.data.password, user.passwordHash)
  if (!valid) { recordFailure(); return { error: 'Неверный логин или пароль' } }  // no user-exists leak

  resetFailures()
  await createSession(user.id)
  redirect('/')                                          // throws NEXT_REDIRECT — fine under useActionState
}
```

**Patterns to preserve:** zod `safeParse` at entry; rate-limit check *before* DB hit; generic Russian error (no user enumeration — line 523, ASVS V2); `useActionState`-compatible signature `(prev, formData) => state`.

---

### `app/login/page.tsx` (component) + `app/(app)/page.tsx` (stub) + `app/api/health/route.ts` (route)

**Analog:** None. **Authoritative:** structure `01-RESEARCH.md` lines 201–204; page contract from the action signature above (`useActionState(login, …)`, Russian error strings, D-03 blocked message). Root stub: minimal Russian page — app name + «экраны появятся в фазах 2–6» (Open Question 5, lines 629–631). Health route: trivial authenticated probe whose *purpose* is the curl gate-check (`curl … /api/health` → 307/401, line 454; PITFALLS.md checklist line 238). Design: Apple aesthetic, Russian strings inline, no i18n (`.claude/CLAUDE.md` lines 16, 92).

---

### `lib/rate-limit.ts` (utility, in-memory state)

**Analog:** None. **Authoritative:** `01-RESEARCH.md` lines 208, 507, 518–525; Don't-Hand-Roll line 445; parameters are planner discretion (A8, line 611 — e.g. 5 failures / 15 min, global counter, resets on restart — acceptable per D-03, note in plan, Pitfall 8 line 489).

**API contract fixed by the login action (line 507):** `checkRateLimit(): boolean`, `recordFailure(): void`, `resetFailures(): void`. Fixed window in a module-level `Map`/counter; no DB, no Redis (forbidden, CLAUDE.md line 96).

---

### `lib/normalize.ts` (utility, transform)

**Analog:** None. **Authoritative:** `01-RESEARCH.md` lines 579–587; PITFALLS.md Pitfall 5 (lines 110–114: "Normalize on write AND on search").

**Core pattern** (lines 580–585):
```typescript
// lib/normalize.ts — applied on write (create/edit, phases 3+) and on search (phase 5)
const HOMOGlyphs: Record<string, string> = { А:'A', В:'B', С:'C', Е:'E', Н:'H', К:'K', М:'M', О:'O', Р:'P', Т:'T', Х:'X' }
export function normalizeNumber(input: string): string {
  const upper = input.trim().replace(/\s+/g, ' ').toUpperCase()
  return [...upper].map(ch => HOMOGlyphs[ch] ?? ch).join('')
}
```
Consider exposing `normalizeSerial` / `normalizeInventory` as named wrappers (research structure line 209). The 11-homoglyph map is the documented starting set; fixture completeness is proven in Phase 5 (line 587).

---

### `db/schema.ts` + `drizzle/` migrations (model, DDL)

**Analog:** None. **Authoritative:** `01-RESEARCH.md` Pattern 3 (lines 306–352) + ARCHITECTURE.md data model (lines 93–140).

**Table set v1 — seven tables** (`01-RESEARCH.md` line 351, which supersedes ARCHITECTURE's free-text department with D-18's lookup): `users` (1 row), `departments` (lookup), `device_types` (4 fixed rows, seeded by migration), `employees`, `devices` (wide, typed nullable per-type columns), `movements` (append-only), `attachments` (paths only). All FKs explicit `ON DELETE RESTRICT` (line 352).

**Drizzle table pattern** (lines 324–347):
```typescript
import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const devices = sqliteTable('devices', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  typeKey: text('type_key').notNull(),            // laptop | monitor | dock | peripheral
  model: text('model').notNull(),
  serialNumber: text('serial_number').notNull(),
  serialNormalized: text('serial_normalized').notNull(),
  inventoryNumber: text('inventory_number'),      // nullable until assigned (D-16: manual)
  inventoryNormalized: text('inventory_normalized'),
  status: text('status').notNull().default('in_stock'),
  currentEmployeeId: integer('current_employee_id'),
  // ...typed nullable per-type columns (ram_gb, ram_upgraded, ssd_gb, ...) per ARCHITECTURE.md
  warrantyUntil: integer('warranty_until', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex('devices_serial_norm_uq').on(t.serialNormalized),        // D-17
  uniqueIndex('devices_inventory_norm_uq').on(t.inventoryNormalized),  // D-17
  index('devices_type_status_idx').on(t.typeKey, t.status),
  index('devices_current_employee_idx').on(t.currentEmployeeId),
  check('devices_status_ck', sql`${t.status} in ('in_stock','assigned','repair','disposed')`),
])
```

**Custom trigger migration** (lines 310–318, verbatim — drizzle-kit does not generate triggers):
```sql
-- drizzle/XXXX_append_only_triggers/migration.sql (custom migration)
CREATE TRIGGER movements_no_update BEFORE UPDATE ON movements
BEGIN
  SELECT RAISE(ABORT, 'movements is append-only: UPDATE denied');
END;
CREATE TRIGGER movements_no_delete BEFORE DELETE ON movements
BEGIN
  SELECT RAISE(ABORT, 'movements is append-only: DELETE denied');
END;
```

**Process invariants:**
- `generate` + `migrate` **only** — never `drizzle-kit push` against anything but throwaway dev (drops UNIQUE on SQLite, issue #6060; lines 349, 428, 473–475).
- Movements table + normalized UNIQUE indexes exist **in the first migration** — retrofitting is impossible (PITFALLS.md Pitfall 1 lines 28–29, Pitfall 5 lines 119–120).
- Review generated `migration.sql` by hand (triggers/CHECKs/partial-index `where` are visible there; known issue #3349, lines 349, 473).
- Index list per ARCHITECTURE.md line 140: `(type, status)`, `(current_employee_id)`, `(warranty_until)` partial, `movements(device_id, occurred_at)`.

---

### `db/index.ts` (model connection, CRUD)

**Analog:** None. **Authoritative:** `01-RESEARCH.md` Pattern 4 (lines 356–364), copy verbatim:
```typescript
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

const sqlite = new Database(process.env.DATABASE_PATH ?? './data/app.db')
sqlite.pragma('journal_mode = WAL')     // persistent per-DB file; README-recommended
sqlite.pragma('foreign_keys = ON')      // SQLite default is OFF — per connection!
sqlite.pragma('busy_timeout = 5000')    // host-side migrate can briefly overlap a running container
export const db = drizzle(sqlite)
```
This file is the **only** DB entry point for app code; every script that opens SQLite repeats the same three pragmas (PITFALLS.md Pitfall 6, lines 478–479; `01-RESEARCH.md` line 548).

---

### `scripts/*.mjs` (CLI utilities, batch)

**Analog:** None. **Authoritative:** `01-RESEARCH.md` Code Examples (lines 531–548).

**`reset-admin.mjs` pattern** (lines 534–546, copy; `create-admin.mjs` = same shape with INSERT + login prompt per line 548):
```javascript
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const db = new Database(process.env.DATABASE_PATH ?? './data/app.db')
const rl = readline.createInterface({ input, output })
const password = await rl.question('Новый пароль: ')
if (password.length < 8) { console.error('Минимум 8 символов'); process.exit(1) }
const hash = await bcrypt.hash(password, 12)
const res = db.prepare('UPDATE users SET password_hash = ? WHERE id = 1').run(hash)
console.log(res.changes === 1 ? 'Пароль обновлён' : 'Пользователь не найден — запустите create-admin')
```
**Patterns:** no Next, no jose — only better-sqlite3 + bcryptjs (line 82); `.mjs` extension mandatory (jose is ESM-only — actually these scripts don't import jose at all; `.mjs` keeps the door open and satisfies Pitfall 7, lines 482–485); pragmas repeated (Pattern 4); errors → stderr + nonzero exit; bcrypt cost 12 (ASVS V2, line 690).

**`seed.mjs` (D-11):** wraps inserts of departments / employees (30–50) / devices (~80 with models + serials) and prints a summary (line 548); must run **only against local dev** — a guard (`if (process.env.NODE_ENV === 'production') process.exit(1)`) is a cheap planner-level addition; uses `lib` normalization so seeded serials match the UNIQUE discipline; movements append-only triggers apply to seeds too (PITFALLS.md line 443).

---

### `scripts/backup.mjs` (batch + file-I/O)

**Analog:** None. **Authoritative:** `01-RESEARCH.md` Pattern 5 (lines 367–395), better-sqlite3 verified API.

**Core pattern** (lines 372–394, copy; implements D-05/06/07/14):
```javascript
import Database from 'better-sqlite3'
import { cpSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DATA = process.env.DATA_DIR ?? './data'
const BACKUPS = join(DATA, 'backups')
const day = new Date().toISOString().slice(0, 10)
const dest = join(BACKUPS, day)
if (existsSync(dest)) process.exit(0)                    // idempotent re-runs
// 1. consistent snapshot of the live DB
const db = new Database(join(DATA, 'app.db'))
await db.backup(join(dest, 'app.db'))
db.close()
// 2. D-14: cheap corruption insurance — check the COPY
const copy = new Database(join(dest, 'app.db'), { readonly: true })
const ok = copy.pragma('integrity_check', { simple: true })
copy.close()
if (ok !== 'ok') { console.error(`integrity_check failed: ${ok}`); process.exit(1) }
// 3. uploads + 4. rotate to 30 newest (D-06)
cpSync(join(DATA, 'uploads'), join(dest, 'uploads'), { recursive: true })
for (const d of readdirSync(BACKUPS).sort().slice(0, -30)) rmSync(join(BACKUPS, d), { recursive: true, force: true })
console.log(`backup ok: ${dest}`)
```
**Hard rules:** never `cp` the live `app.db` under WAL (loses `-wal` commits — lines 427, 458–459); `integrity_check` runs on the **copy**; exit 1 on failed check (cron visibility); scheduler = planner's choice with host-cron installed by `deploy.sh` as the recommended default (options table lines 397–406); restore procedure steps go in README (line 408); TZ/date-folder convention must be picked once and documented (Pitfall 9, lines 491–494; Open Question 3).

---

### `Dockerfile` + `compose.yml` + `scripts/deploy.sh` (config/deploy)

**Analog:** None. **Authoritative:** official `examples/with-docker` Dockerfile quoted in `01-RESEARCH.md` lines 551–564; compose lines 566–575; deploy Pattern 6 lines 410–422.

**Dockerfile = official baseline verbatim** (3 stages, `ARG NODE_VERSION=24.13.0-slim` in every stage, `npm ci`, standalone copies, `USER node`, `EXPOSE 3000`, `CMD ["node","server.js"]`) **plus exactly three extensions**:
```dockerfile
# deps stage, BEFORE npm ci — insurance if prebuild download is blocked; cheap on cached layers
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# runner stage, AFTER copying .next/standalone — standalone tracing can omit the native binding
COPY --from=builder --chown=node:node /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

# runner stage — the state dir must exist and be writable by node (uid 1000)
RUN mkdir -p /app/data && chown node:node /app/data
```
```yaml
# compose.yml
services:
  app:
    build: .
    ports: ["3000:3000"]            # D-09
    env_file: .env                  # AUTH_SECRET (openssl rand -base64 32); DATABASE_PATH=/app/data/app.db
    volumes: ["./data:/app/data"]   # entire state: app.db + uploads/ + backups/
    restart: unless-stopped
```
```bash
# scripts/deploy.sh — runs on the internal server
set -euo pipefail
git pull origin main                       # corporate GitLab canonical remote (D-15)
docker compose build
npx drizzle-kit migrate                    # host-side, against ./data/app.db through the volume
docker compose up -d
# idempotently ensure host cron line for backup (if host-cron option chosen)
```
**Hard rules:** never Alpine (musl breaks better-sqlite3 — CLAUDE.md line 91); same Node major in all stages (NODE_MODULE_VERSION, Pitfall 3 lines 462–465); volume dir ownership — `chown -R 1000:1000 data` on server (Pitfall 4, lines 467–469); migrations host-side because drizzle-kit is a devDep and standalone tracing omits it (line 422; container-side `scripts/migrate.mjs` is the documented fallback, A1 line 604).

---

### Tests (vitest)

**Analog:** None. **Authoritative:** `01-RESEARCH.md` Validation Architecture (lines 648–681) — the test map *is* the spec: 7 test files, one per row (lines 661–667); framework vitest 4.1.11; `tests/helpers.ts` = temp SQLite file factory + apply-migrations helper (line 678); `vitest.config.ts` = node env + `@/` alias (line 677). Key assertions: `UPDATE/DELETE movements` raises and INSERT works (664–665); duplicate `serial_normalized`/`inventory_normalized` rejected (664); backup copy passes `integrity_check` + rotation keeps 30 (666); matcher behavior via `unstable_doesProxyMatch` (667, A10 line 613 — fallback: curl-based check). Command: `npx vitest run` per commit; suite + `npm run build` per wave (lines 671–674).

## Shared Patterns (cross-cutting — apply to every Phase 1 file)

### 1. Defense-in-depth auth (ACC-02)
**Source:** `01-RESEARCH.md` lines 58, 231–233; PITFALLS.md Pitfall 6 (124–144).
**Apply to:** `proxy.ts` (perimeter, default-deny) AND `lib/auth.ts` `requireSession()` (re-check inside every Server Action/page/Route Handler — React `cache()` wrapped). Proxy alone is officially insufficient for Server Functions. Every future route (photos, API, uploads) is gated by default — never extend the public allowlist.

### 2. Session cookie contract (D-01, D-04)
**Source:** `01-RESEARCH.md` Pattern 2.
**Apply to:** `lib/session.ts`, login/logout actions. `httpOnly: true, sameSite: 'lax', path: '/', expires: +30d`; **no `secure` flag** — deliberate documented exception for plain-HTTP LAN (browsers drop Secure cookies over http, line 430). Persistent cookie (has `expires`) is a success criterion (Pitfall 8, line 488).

### 3. SQLite pragmas on every connection (Pitfall 6)
**Source:** `01-RESEARCH.md` Pattern 4 + line 548.
**Apply to:** `db/index.ts`, ALL `scripts/*.mjs` that open the DB, `tests/helpers.ts`. `journal_mode = WAL`, `foreign_keys = ON` (per-connection in SQLite!), `busy_timeout = 5000`.

### 4. zod validation at every mutation entry
**Source:** `01-RESEARCH.md` lines 693 (ASVS V5), 512.
**Apply to:** `app/login/actions.ts` now; the pattern for all phase 2–6 mutations.

### 5. Generic Russian error messages; no secret leakage
**Source:** `01-RESEARCH.md` line 523 (no user-exists leak), ASVS V7 line 695.
**Apply to:** login action (single generic «Неверный логин или пароль»), backup script (stderr + exit 1, no secrets in logs), CLI scripts (human-readable Russian messages).

### 6. ESM discipline in `scripts/`
**Source:** `01-RESEARCH.md` Pitfall 7 (482–485), CLAUDE.md line 123.
**Apply to:** all `scripts/` — `.mjs` extension; no `jose` import there (not needed: CLI writes `users` rows directly).

### 7. Structure conventions this phase ESTABLISHES for phases 2–6
**Source:** `01-RESEARCH.md` lines 196–225; CONTEXT.md "фаза 1 задаёт паттерны".
**Apply to:** `app/` routes + colocated `actions.ts`, `lib/` server-only utilities, `db/` single client + schema, `scripts/` operational CLIs, `tests/` vitest. Phases 2–6 copy this layout.

## No Analog Found

**All 33 files.** Greenfield — there is no application code to analog against. Every file has a verified authoritative prescription (table above). Two structural cautions for the planner:

| Conflict | Resolution |
|----------|------------|
| ARCHITECTURE.md (lines 53–87) shows a stack-agnostic `routes/ services/ views/` layout | **Superseded** by `01-RESEARCH.md` lines 196–225 (Next.js App Router layout). Use RESEARCH.md's structure; keep ARCHITECTURE.md for *data model + invariants only* (its movements transaction sketch at lines 162–175 is pseudocode — the drizzle/`db.transaction` equivalent lands in Phase 4, not Phase 1) |
| STACK.md/CLAUDE.md mention nginx/Caddy reverse proxy as "recommended" | **Overridden for Phase 1** by locked decision D-04 (plain HTTP, no reverse proxy); `.claude/CLAUDE.md` line 107's "add Secure if HTTPS" does not apply (D-04) |

Also note STACK.md's jose expiry example ("e.g. 7-day") is superseded by D-01's 30 days (`01-RESEARCH.md` State of the Art, line 598).

## Metadata

**Analog search scope:** entire repository `/Users/aleksey/projects/barahlo` (verified empty of code: only `.git/`, `.planning/`, `.claude/`; `package.json` search returned nothing)
**Files scanned:** 8 planning/config documents (`01-CONTEXT.md`, `01-RESEARCH.md`, `ARCHITECTURE.md`, `PITFALLS.md`, `STACK.md` via CLAUDE.md embed, `.claude/CLAUDE.md`, plus directory listings)
**Pattern extraction date:** 2026-08-31
**Excerpt provenance:** all code in this document is quoted verbatim from `01-RESEARCH.md` (fetched from official Next.js/better-sqlite3/drizzle/sqlite docs this session) — nothing is invented
