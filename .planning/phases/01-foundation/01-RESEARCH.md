# Phase 1: Foundation - Research

**Researched:** 2026-08-31
**Domain:** Next.js 16 app skeleton: auth gate + session, SQLite schema v1 (Drizzle), append-only enforcement, nightly backups + restore rehearsal, Docker standalone deploy on internal server
**Confidence:** HIGH (all core mechanisms verified against official docs fetched this session; deployment scheduling and native-module Docker details MEDIUM from corroborating sources)

## Summary

Phase 1 is a greenfield scaffold where every hard-to-retrofit decision is made once: the full SQLite schema v1, the auth gate that covers *everything*, the backup routine, and the deploy path. The stack is already locked at project level (STACK.md) — this research goes one level deeper into the *phase-specific mechanics*: Next.js 16's new `proxy.ts` convention, the jose signed-cookie session, SQLite trigger-based append-only enforcement, `db.backup()`-based nightly backups with `integrity_check`, and the official standalone Docker pattern extended for better-sqlite3.

Three findings dominate the design. **First:** Next.js 16 renamed `middleware` → `proxy` and made Node.js its only runtime — the official authentication guide shows the exact pattern we need (optimistic cookie check in `proxy.ts` + re-verification inside Server Functions/DAL), and explicitly warns that Proxy alone is not sufficient for Server Actions. **Second:** "события нельзя перезаписать" (success criterion 3) should be enforced at the *database* level with `BEFORE UPDATE/DELETE ... RAISE(ABORT)` triggers on `movements` — app-level discipline alone is the documented way this invariant eventually rots. **Third:** nightly backup must use the online backup API (`better-sqlite3` `db.backup()`) or `VACUUM INTO` — a raw `cp` of a WAL-mode database is the documented way to produce a backup that silently misses recent commits.

The deploy path follows the official `examples/with-docker` Dockerfile verbatim (fetched this session: `node:24.13.0-slim`, 3 stages, `USER node`, `CMD ["node","server.js"]`) with two documented extensions for the native module: build tools in the deps stage, and copying `node_modules/better-sqlite3` into the runner because standalone file tracing can miss the compiled `.node` binding. Scheduler placement for the backup job (host cron vs sidecar) is the one genuinely open choice — both options are documented with tradeoffs; host cron via the deploy script is the recommended default.

**Primary recommendation:** Build in this order — scaffold → schema+migration (with triggers and normalized UNIQUE indexes) → session/auth libs → login page+action with rate limit → `proxy.ts` default-deny gate → CLI scripts (create-admin/reset-admin/seed) → backup script → Docker+compose+deploy script → rehearse restore once (manual, end of phase).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Session lives 30 days («запомнить меня»). Risk minimal — personal tool in trusted LAN.
- **D-02:** Forgotten-password recovery is a CLI command on the server (`node scripts/reset-admin.mjs`) that sets a new password. No email recovery, no plaintext env password.
- **D-03:** Login brute-force limiting is mandatory (locking success criterion); mechanism at planner's discretion.
- **D-04:** Plain HTTP in office LAN, no reverse proxy. Cookie `Secure` flag NOT set. Self-signed certs / internal CA not needed.
- **D-05:** Backups stored on the same server (volume outside the container, separate folder). NAS/second location — not now.
- **D-06:** Keep 30 daily copies, delete older.
- **D-07:** Frequency — once daily (nightly). Losing at most a day is acceptable: DB changes a couple of times per day.
- **D-08:** Docker is on the server — main deploy path: one container + volume (docker compose), official Next.js standalone pattern.
- **D-09:** App listens on port 3000, access via `http://<server>:3000`.
- **D-10:** Update = git pull + one-command deploy script on the server (rebuild + restart). No CI/CD.
- **D-11:** Seed script with realistic fakes (30–50 employees, ~80 devices with models/serials) for local dev only — never reaches prod.
- **D-12:** Local dev on the Mac (`npm run dev`, local SQLite file); Docker is for prod only.
- **D-13:** Account creation at first run is CLI-only (`create-admin`, same mechanics as D-02). No web setup screen.
- **D-14:** Nightly backup job includes `PRAGMA integrity_check` of the copy. No full automated restore test; restore is rehearsed manually at phase acceptance (success criterion).
- **D-15:** Canonical remote is the corporate GitLab (private): code + `.planning/`, deploy git pull comes from there. Public GitHub is a later mirror without `.planning/` and work data.
- **D-16:** Inventory numbers are manual entry only, no auto-generator (assigned by 1C accounting/IT, format like `ИБ-0000146`; entered as-is).
- **D-17:** UNIQUE on normalized inventory number: 1C has no duplicates, a fired constraint = input typo to catch. UNIQUE on serials — from research (confirmed).
- **D-18:** Departments are a lookup table `departments`; initial list created by the user. Lookup CRUD is Phase 2 UI.

### Claude's Discretion
- Rate-limit mechanism (fixed window in memory is sufficient for one user)
- CLI command shape/name for reset-admin/create-admin
- Backup scheduler: cron inside container vs host cron — planner's choice
- Number normalization mechanics (case, spaces, homoglyphs) — per PITFALLS.md
- Detailed DB schema — per `.planning/research/ARCHITECTURE.md` (six tables, hybrid movements pattern)
- bcrypt cost, cookie size, other security defaults

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ACC-01 | User can log in with username + password (single account, session cookie) | Official Next.js auth guide pattern: login Server Action → zod → `bcryptjs.compare` → jose HS256 SignJWT → `cookies().set` with `httpOnly/sameSite/maxAge`; persistent cookie (30d, D-01) survives browser restart; in-memory fixed-window rate limit (D-03); CLI create-admin/reset-admin (D-02/D-13) write the `users` row |
| ACC-02 | All pages, uploads and API are blocked without authentication | Next 16 `proxy.ts` (Node runtime, verified official docs) with a default-deny negative-lookahead matcher that excludes only `/login` and `/_next` assets; `_next/data` still gated automatically; second layer: `requireSession()` inside Server Actions/DAL per official guidance that Proxy alone is insufficient for Server Functions |
| ACC-03 | Data persists in a single SQLite database with an automatic backup routine | Drizzle `generate`+`migrate` (not `push`) creates schema v1 from day one — incl. append-only `movements` with RAISE(ABORT) triggers, normalized serial/inventory columns with UNIQUE indexes; nightly `db.backup()` + `integrity_check` + 30-copy rotation (D-05/06/07/14); single container + mounted volume survives restart (D-08) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

Extracted directives from `.claude/CLAUDE.md` (mirrors PROJECT.md/STACK.md):
- Deploy target: internal company server, office-LAN access only, no external clouds
- Exactly one account (login+password), no role model
- Start from zero data — no Excel/Sheets import
- Apple-aesthetic design (clean, typography, air) — not "admin from 2010"
- Lists/filters must be fast at hundreds of devices
- Stack table in CLAUDE.md == STACK.md (locked); what-NOT-to-use list applies (NextAuth, Postgres, Prisma, Alpine, node:sqlite, i18n libs, admin kits, BLOB photos, Redis, client-side data fetching)
- GSD workflow enforcement: repo edits only through GSD commands (this research is part of that flow)

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Route-level auth gate (ACC-02) | Frontend Server (Next 16 `proxy.ts`, Node runtime) | API/Backend (Server Action + DAL re-check) | Proxy is the default-deny perimeter; official docs require re-verification inside Server Functions — Proxy alone is explicitly insufficient |
| Login + session issue (ACC-01) | API/Backend (Server Action) | Browser (form via `useActionState`) | Credentials validated server-side only; cookie set in the action (`.set` is illegal in Server Components — verified) |
| Brute-force rate limit (D-03) | API/Backend (in-process memory) | — | One process, one user; nothing to distribute |
| Schema v1 + append-only + UNIQUE indexes (ACC-03) | Database/Storage (SQLite via Drizzle migrations) | API (no UPDATE path in code) | DB-level triggers make the invariant survive any future code bug |
| Nightly backups + rotation (D-05..07,14) | Database/Storage (backup script on volume) | OS (host cron) or sidecar container | File copy mechanics live next to the data; scheduler placement is planner's choice |
| Admin CLI (create/reset admin, seed) | API/Backend (plain node scripts) | Database | Direct better-sqlite3+bcryptjs access; no Next/jose dependency |
| Container + volume runtime (D-08/09) | Frontend Server (standalone Node in Docker) | OS (compose, volume) | Official with-docker pattern; state entirely in mounted volume |
| Deploy (git pull + rebuild, D-10/15) | OS (deploy script on server) | Git (corporate GitLab remote) | No CI/CD by decision |

## Standard Stack

Project-level stack is locked by STACK.md — versions re-verified against npm registry this session (2026-08-31). Only phase-1-relevant additions detailed below.

### Core (used this phase)

| Library | Version (verified today) | Purpose in Phase 1 | Notes |
|---------|---------|--------------|-------|
| next | 16.3.3 | App skeleton, `proxy.ts` auth gate, Server Action login | middleware→proxy rename; Turbopack default; `next lint` removed [VERIFIED: npm registry + nextjs.org docs] |
| react / react-dom | 19.2.8 | `useActionState` login form | [VERIFIED: npm registry] |
| drizzle-orm + drizzle-kit | 0.45.2 / 0.31.10 | Schema v1 + generated migrations | Install the pair in lockstep; `drizzle-kit` as devDependency [VERIFIED: npm registry] |
| better-sqlite3 | 13.0.3 | SQLite driver, `db.backup()`, `db.exec()` for triggers | No postinstall script; prebuilt binaries for major platforms [VERIFIED: npm registry + official README] |
| jose | 6.2.10 | HS256 signed session cookie | ESM-only; CJS require() only on Node ^20.19/^22.12/≥23 — scripts that need it must be `.mjs` [VERIFIED: npm registry + official README] |
| bcryptjs | 3.0.3 | Password hash for single `users` row | Pure JS, no native issues in Docker [VERIFIED: npm registry] |
| zod | 4.5.4 | Login form validation (and pattern for later phases) | [VERIFIED: npm registry] |
| tailwindcss | 4.3.3 | Login page styling (scaffold default) | [VERIFIED: npm registry] |
| server-only | 0.0.1 | Guard `lib/session.ts` from client import | Used in official Next.js auth docs examples; no repo URL (tiny stub by React team) |
| vitest | 4.1.11 | Unit/integration tests (Validation Architecture) | Chosen over node:test for TS+ESM ergonomics with native module |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/better-sqlite3 | 9.6.0 | Types | devDependency [VERIFIED: npm registry] |
| @faker-js/faker (optional) | latest | Seed realism (D-11) | Or hand-rolled generator to avoid a dep — planner's discretion |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Stateless jose JWT cookie | DB sessions table | DB sessions allow server-side revocation ("log out everywhere") — unnecessary for one trusted user; JWT matches D-01/D-04 simplicity |
| DB-level triggers on `movements` | App-level "never write UPDATE" convention | Triggers make the invariant survive future code bugs; trivially added in migration 0000 |
| Host cron for backups | supercronic sidecar / in-process `instrumentation.ts` scheduler | Sidecar keeps schedule in compose (portable, one more container); `instrumentation.ts` `register()` is stable and runs once per server start, but couples backup lifetime to app process and hides failures in app logs |
| Host-side `drizzle-kit migrate` in deploy | Migrating inside container at startup | Host-side avoids shipping devDeps/migration files through standalone tracing; container-side needs the migrator + `drizzle/` folder copied into the image explicitly |
| vite/vitest | node:test | vitest gives TS, ESM, and watch mode with zero config beyond a small config file; node:test fine but stricter CJS/TS friction |

**Installation:**
```bash
npx create-next-app@latest barahlo   # App Router + TS + Tailwind v4 + ESLint (Turbopack default)
npm install drizzle-orm@0.45 better-sqlite3@13 jose bcryptjs zod@4 server-only
npm install -D drizzle-kit @types/better-sqlite3 vitest
```

**Version verification:** all versions in the table were fetched from the npm registry this session (2026-08-31); no training-data versions used.

## Package Legitimacy Audit

> Run via `gsd-tools query package-legitimacy check --ecosystem npm <pkgs>` + `npm view` this session.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| next | npm | 8 yrs (16.3.3 rel. 2026-08-25) | 55.3M/wk | github.com/vercel/next.js | SUS ("too-new" release recency only) | Approved — canonical framework, locked by STACK.md; heuristic fired on version recency, not package identity |
| react / react-dom | npm | 12 yrs | 171.6M/161.2M/wk | github.com/react/react | OK | Approved |
| drizzle-orm / drizzle-kit | npm | 4 yrs | 20.3M/16.8M/wk | github.com/drizzle-team/drizzle-orm | OK | Approved |
| better-sqlite3 | npm | 8 yrs (13.0.3 rel. 2026-08-05) | 10.4M/wk | github.com/WiseLibs/better-sqlite3 | SUS ("too-new" only) | Approved — canonical SQLite driver per STACK.md; no postinstall script |
| jose | npm | 7 yrs (6.2.10 rel. 2026-08-21) | 128.0M/wk | github.com/panva/jose | SUS ("too-new" only) | Approved — canonical JOSE implementation, cited by official Next.js docs |
| bcryptjs | npm | 11 yrs (3.0.3) | 13.0M/wk | github.com/dcodeIO/bcrypt.js | OK | Approved |
| zod | npm | 6 yrs (4.5.4 rel. 2026-08-29) | 274.7M/wk | github.com/colinhacks/zod | SUS ("too-new" only) | Approved |
| tailwindcss | npm | 10 yrs | 125.6M/wk | github.com/tailwindlabs/tailwindcss | OK | Approved |
| vitest | npm | 4 yrs (4.1.11 rel. 2026-08-18) | 99.9M/wk | github.com/vitest-dev/vitest | SUS ("too-new" only) | Approved |
| server-only | npm | 4 yrs (0.0.1) | 16.0M/wk | none published (official React-team stub) | SUS ("no-repository") | Approved — imported in official Next.js auth docs; known stub package |
| @types/better-sqlite3 | npm | 6 yrs | 4.6M/wk | github.com/DefinitelyTyped/DefinitelyTyped | OK | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** every SUS above fired solely on `too-new` (latest version released within days of today) or, for `server-only`, missing a repo URL. All are the exact packages locked by STACK.md, re-verified on the registry today with legitimate repos and massive download counts; none has a postinstall script (checked: better-sqlite3, jose, bcryptjs → empty). **Planner discretion:** per protocol a `checkpoint:human-verify` may be inserted before install, but these names are framework-canonical and already user-locked via STACK.md — no realistic slopsquat risk.

*`@faker-js/faker` (optional seed dep) has not passed the legitimacy gate — run the check before adding it.*

## Architecture Patterns

### System Architecture Diagram

```
                        Browser (office LAN, plain HTTP :3000)
                              │  any request, no/invalid session
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Docker container (official standalone pattern, node:24-slim,        │
│ USER node, HOSTNAME=0.0.0.0, PORT=3000)                             │
│                                                                     │
│  proxy.ts  ──default-deny matcher─────────────┐                     │
│    │ valid jose JWT?                          │ no                 │
│    │ yes                                      ▼                    │
│    ▼                                    redirect → /login           │
│  App routes (pages, Server Components,                              │
│  Server Actions, Route Handlers)                                    │
│    │ requireSession() re-check (defense in depth)                   │
│    ▼                                                                │
│  Drizzle (better-sqlite3, WAL, foreign_keys=ON, busy_timeout)       │
│    │ INSERT-only path for movements                                 │
│    ▼                                                                │
│  SQLite file ── triggers: BEFORE UPDATE/DELETE RAISE(ABORT)         │
│  UNIQUE(serial_normalized, inventory_normalized)                    │
└──────────────┬──────────────────────────────────────────────────────┘
               │ volume mount (./data → /app/data) — the entire state
               ▼
   /app/data/app.db (+ -wal/-shm)   /app/data/uploads/   /app/data/backups/YYYY-MM-DD/
               ▲                              │
               │ nightly (host cron 02:00:    │ copied into dated backup dir
               │ docker compose exec -T app   │ + PRAGMA integrity_check on copy
               │ node scripts/backup.mjs)     │ + rotate to 30 copies
               └──────────────────────────────┘

Out-of-band entry points (no HTTP):
  node scripts/create-admin.mjs / reset-admin.mjs / seed.mjs  → direct SQLite + bcryptjs
  deploy.sh: git pull (corporate GitLab) → docker compose build → drizzle-kit migrate → up -d
```

### Recommended Project Structure

```
barahlo/
├── proxy.ts                      # default-deny auth gate (Next 16 convention)
├── instrumentation.ts            # optional; NOT for backups (see pitfalls)
├── app/
│   ├── login/page.tsx            # the only public UI this phase (Russian, Apple-clean)
│   ├── login/actions.ts          # 'use server' login + rate limit (or app/actions/auth.ts)
│   ├── (app)/page.tsx            # post-login stub («экраны появятся в фазах 2–6»)
│   └── api/health/route.ts       # authenticated probe route for curl tests
├── lib/
│   ├── session.ts                # 'server-only': jose sign/verify, createSession, getSession, COOKIE_NAME
│   ├── auth.ts (or dal.ts)       # requireSession() for actions/pages (React cache())
│   ├── rate-limit.ts             # in-memory fixed window
│   └── normalize.ts              # normalizeSerial/normalizeInventory (homoglyph map)
├── db/
│   ├── index.ts                  # better-sqlite3 client: pragmas (WAL, foreign_keys, busy_timeout) + drizzle()
│   └── schema.ts                 # drizzle schema v1 (all 7 tables)
├── drizzle/                      # generated migrations (0000_*.sql + snapshot + triggers in custom migration)
├── scripts/
│   ├── migrate.mjs (optional)    # programmatic migrate() if container-side path chosen
│   ├── create-admin.mjs          # D-13
│   ├── reset-admin.mjs           # D-02
│   ├── seed.mjs                  # D-11, local only
│   ├── backup.mjs                # db.backup + integrity_check + uploads copy + rotation
│   └── deploy.sh                 # D-10: git pull → build → migrate → up -d
├── tests/                        # vitest
├── Dockerfile                    # official with-docker + native-module extensions
├── compose.yml                   # one service + volume + env_file
└── drizzle.config.ts             # dialect 'sqlite', schema ./db/schema.ts, out ./drizzle, url from DATABASE_PATH
```

### Pattern 1: Default-deny auth gate in `proxy.ts` (Next 16)

**What:** `proxy.ts` at project root exports a single `proxy` function (Node runtime — edge unsupported, `runtime` config throws). Negative-lookahead matcher covers everything *except* the login page and static asset prefixes. Valid signed cookie → `NextResponse.next()`; otherwise redirect to `/login`.

**Critical difference from the docs' CORS example:** the official matcher example *excludes* `api` — for this app `api` must NOT be excluded. Exclusions are an allowlist of public paths only (`/login`, `/_next/static`, `/_next/image`, favicon). `_next/data` requests invoke the proxy even when excluded (verified, by design). Any future route (photos, API) is gated by default — this is what makes success criterion 1 structural rather than per-route discipline.

**Verified from official docs:** the authentication guide warns Proxy is not sufficient alone — Server Actions are POSTs to the page route they belong to, so every mutating action must also call `requireSession()` itself. (Phase 1's only action is `login` itself; the pattern is established here for phases 2–6.)

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

### Pattern 2: Stateless session with jose (30 days, no `Secure` flag)

**What:** HS256 JWT in an HttpOnly cookie; `maxAge`/`expires` set so the cookie is *persistent* (survives browser restart — explicit success criterion). Per D-04, `secure: false` (omit the flag) — a conscious, documented exception to the OWASP default because the deployment is plain HTTP in a trusted LAN.

```typescript
// lib/session.ts — pattern from nextjs.org/docs/app/guides/authentication (jose section)
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

`.set()` is legal only inside Server Actions / Route Handlers (verified — throws during Server Component render). The login Server Action is exactly that context. Logout: `cookieStore.delete(SESSION_COOKIE)` (also action-only).

### Pattern 3: Schema v1 with DB-enforced append-only `movements`

**What:** One generated migration (0000) creates all seven tables; a **custom migration** (drizzle-kit supports custom migration files) adds the immutability triggers, because drizzle-kit does not generate triggers. Constraint-level uniqueness on normalized number columns catches typos at insert time (D-17).

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
[CITED: sqlite.org/lang_createtrigger.html — RAISE(ABORT) aborts the statement and rolls back its changes; triggers are application-level enforcement (DROP TRIGGER can bypass) — acceptable for a single-operator app; the app code additionally has no UPDATE/DELETE path for movements]

```typescript
// db/schema.ts — normalized-number UNIQUE constraints (D-17) and status CHECK
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
  uniqueIndex('devices_serial_norm_uq').on(t.serialNormalized),
  uniqueIndex('devices_inventory_norm_uq').on(t.inventoryNormalized),
  index('devices_type_status_idx').on(t.typeKey, t.status),
  index('devices_current_employee_idx').on(t.currentEmployeeId),
  check('devices_status_ck', sql`${t.status} in ('in_stock','assigned','repair','disposed')`),
])
```
[CITED: orm.drizzle.team/docs/sqlite/indexes-constraints — third-arg array form, `uniqueIndex().on().where()` for partial indexes, `check(name, sql)`; known issue #3349: generated `where` clause of partial unique indexes needs verification in the generated SQL; issue #6060: `drizzle-kit push` on SQLite can silently drop UNIQUE constraints when recreating tables → use `generate`+`migrate` from day one, never `push` in prod]

Full v1 table set (per ARCHITECTURE.md + D-18): `users` (1 row), `departments` (lookup; `employees.department_id` FK — replaces ARCHITECTURE's free-text department string), `device_types` (4 fixed rows, seeded by migration), `employees`, `devices`, `movements` (append-only), `attachments` (paths only; upload UI is Phase 4). All FKs explicit `ON DELETE RESTRICT` — nothing in this app deletes.

### Pattern 4: Connection setup with pragmas

```typescript
// db/index.ts — better-sqlite3 verified API
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

const sqlite = new Database(process.env.DATABASE_PATH ?? './data/app.db')
sqlite.pragma('journal_mode = WAL')     // persistent per-DB file; README-recommended
sqlite.pragma('foreign_keys = ON')      // SQLite default is OFF — per connection!
sqlite.pragma('busy_timeout = 5000')    // host-side migrate can briefly overlap a running container
export const db = drizzle(sqlite)
```

### Pattern 5: Nightly backup + rotation + integrity check (D-05/06/07/14)

**Verified mechanics:** `db.backup(destination)` (online backup API) returns a promise, keeps the DB usable during the copy, and works correctly under WAL — a raw file `cp` is the documented failure mode (recent commits live in `-wal`; copying only the `.db` loses them). The job then runs `PRAGMA integrity_check` **on the copy**, copies `uploads/`, and deletes backups beyond the newest 30.

```javascript
// scripts/backup.mjs — skeleton (better-sqlite3 verified API)
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

**Scheduler options (planner's choice per CONTEXT):**

| Option | Pros | Cons | Sources |
|--------|------|------|---------|
| **Host crontab** `0 2 * * * cd /opt/barahlo && docker compose exec -T app node scripts/backup.mjs` — installed by `deploy.sh` (idempotent line) | Zero extra containers; battle-tested; job fails loudly if stack is down; matches "one container" (D-08) | Schedule lives outside the repo (mitigated: deploy.sh installs it); env doesn't carry into `exec` (script reads only volume paths); host TZ used — set the hour deliberately | OneUptime Docker-cron guide; r/docker SQLite-backup threads |
| **Sidecar** (`supercronic` service in compose, same image or tiny image, shared volume, crontab in repo) | Schedule versioned in compose; portable; logs in `docker compose logs` | Second container; ofelia needs docker.sock; supercronic is an extra binary to vet | Crontap guide; Dash0; matomo-org/docker#77 |
| **In-process** `instrumentation.ts register()` + `setInterval` | No new moving parts | `register()` verified: runs once per server instance, *must complete before server is ready* — a backup await would delay startup; failures invisible in docker-cron terms; timer drifts on restarts; dev-mode quirks | nextjs.org instrumentation reference |
| Cron *inside* the app container via apt cron | — | Documented anti-pattern (slim images lack cron daemon; env/PID1/zombie issues) | SO canonical thread; Dash0 |

**Recommendation:** host cron installed by `deploy.sh`; supercronic sidecar as the documented fallback if the host disallows crontab edits.

**Restore procedure (rehearsed once at phase acceptance — success criterion 4, manual):** stop container → move current `data/` aside → copy `backups/<day>/` into place (app.db + uploads/) → `docker compose up -d` → log in → `PRAGMA integrity_check` → spot-check a seeded record. Steps go in README; the rehearsal is a human acceptance step.

### Pattern 6: Deploy flow (D-08/10/15)

```bash
# scripts/deploy.sh — runs on the internal server
set -euo pipefail
git pull origin main                       # corporate GitLab canonical remote (D-15)
docker compose build
npx drizzle-kit migrate                    # host-side, against ./data/app.db through the volume
docker compose up -d
# idempotently ensure host cron line for backup (if host-cron option chosen)
```

Migrations run **host-side** because `drizzle-kit` is a devDependency and standalone output file-tracing does not include the `drizzle/` folder or devDeps. Requires Node ≥20.9 on the server host (fallback: a one-off `docker compose run --rm migrate` service built from a stage that has devDeps — documented alternative if host Node is unavailable).

### Anti-Patterns to Avoid

- **Auth gate per page instead of default-deny:** a matcher that lists protected paths grows stale; default-deny + public-path allowlist is structural (ACC-02).
- **`cp app.db backup.db`:** under WAL it silently loses recent commits; use `db.backup()`/`VACUUM INTO`.
- **`drizzle-kit push` in prod:** documented to be able to drop UNIQUE constraints on SQLite table recreation; `generate`+`migrate` from day one.
- **Session cookie without `maxAge`/`expires`:** becomes a session cookie that dies when the browser closes — violates success criterion 2.
- **`Secure` flag on a plain-HTTP deployment:** browsers drop Secure cookies over http — login would silently never persist (D-04).
- **Writing backup logic into `instrumentation.ts`:** delays server readiness (`register()` must complete before requests are served) and hides failures.
- **EXCLUSIVE dependence on Proxy for auth:** official docs: Server Actions are POSTs to their owning route — every action must self-verify (`requireSession()`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session signing/validation | Custom HMAC cookie scheme | `jose` SignJWT/jwtVerify HS256 | Token standards, expiry handling, tamper detection for free; cited by official Next.js docs |
| Password hashing | Custom hash/salt | `bcryptjs` (cost 10–12) | Salting, timing-safe compare, tunable cost |
| Consistent DB snapshot | `cp` / hand-rolled page copy | `better-sqlite3 db.backup()` (or `VACUUM INTO`) | WAL consistency, restart-on-concurrent-write semantics already handled |
| Corruption detection | Row-count heuristics | `PRAGMA integrity_check` (D-14) | The engine's own verifier |
| Append-only enforcement | "Nobody calls UPDATE" convention | `RAISE(ABORT)` triggers | Survives future code, seeds, and manual psql/sqlite3 sessions |
| Case/homoglyph normalization | Ad-hoc `.toUpperCase()` at call sites | One `lib/normalize.ts` + tests | One map (С↔C, О↔O, А↔A...), applied identically on write and (later) search — PITFALLS Pitfall 5 |
| Migrations | Hand-maintained schema.sql drift | drizzle-kit generate → versioned SQL + journal | Reproducible, reviewable, prod-safe (vs `push`) |
| Brute-force limiting | DB-backed lockout tables | In-memory fixed-window counter | One process, one user (D-03 discretion); resets on restart — acceptable |

**Key insight:** every one of these is a "deceptively simple until it's 2 a.m." problem where the standard tool already encodes the edge cases (WAL snapshots, token expiry, salt format, SQLite locking).

## Common Pitfalls

### Pitfall 1: Auth bolted on last / holes in the gate
**What goes wrong:** `/api/*` or future `/uploads/*` reachable without a session; "pages have login" ≠ "everything is gated" (PITFALLS.md Pitfall 6 — the documented LAN-app failure).
**Why it happens:** per-page checks instead of a perimeter; the official matcher example excludes `api` and people copy it.
**How to avoid:** default-deny `proxy.ts` matcher (only `login` + `_next` assets excluded); `requireSession()` in every Server Action from day one; verification includes `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health` → expect 307/401, not 200.
**Warning signs:** a route added with "it's internal, I'll gate it later".

### Pitfall 2: Raw-copy backups under WAL
**What goes wrong:** backup file missing recent commits (they live in `-wal`) or torn mid-checkpoint.
**How to avoid:** `db.backup()` in `scripts/backup.mjs` (Pattern 5); never `cp` the live trio.
**Warning signs:** backup script contains `cp`/`rsync` of `app.db`.

### Pitfall 3: Standalone Docker image missing the native module
**What goes wrong:** container starts, first request touching SQLite dies with `Could not locate the bindings file` — standalone output tracing can omit `better_sqlite3.node`; also NODE_MODULE_VERSION mismatch if build and runner stages use different Node majors.
**How to avoid:** same `node:24-slim` in every stage (official Dockerfile does this via one ARG); add `python3 make g++` to the deps stage (insurance if prebuild download from GitHub releases is blocked on the corporate network); explicitly `COPY --from=deps /app/node_modules/better-sqlite3` into the runner after the standalone copy.
**Warning signs:** image builds fine, crashes at runtime; works on the Mac, fails in the container.

### Pitfall 4: Volume permission mismatch (non-root container vs bind mount)
**What goes wrong:** official pattern runs as `USER node` (uid 1000); a host-created `./data` dir owned by the deploy user makes SQLite fail with `SQLITE_CANTOPEN`.
**How to avoid:** in the Dockerfile `RUN mkdir -p /app/data && chown node:node /app/data`; on the server `mkdir -p data && chown -R 1000:1000 data` (documented in deploy.sh/README).
**Warning signs:** `EACCES` in container logs on first boot.

### Pitfall 5: `drizzle-kit push` drift / generated-SQL surprises
**What goes wrong:** `push` can silently drop UNIQUE constraints on SQLite when recreating tables (drizzle issue #6060); partial-unique-index `where` generation had a known bug (#3349).
**How to avoid:** `generate` + review the generated SQL (triggers, CHECKs, partial indexes are all visible in `migration.sql`) + `migrate`; add a vitest that asserts `UPDATE movements` raises and duplicate `serial_normalized` is rejected.
**Warning signs:** anyone typing `drizzle-kit push` outside throwaway dev.

### Pitfall 6: Foreign keys silently off
**What goes wrong:** SQLite enforces FKs only per-connection (`PRAGMA foreign_keys = ON` is not persistent); orphaned references appear and RESTRICT semantics never fire.
**How to avoid:** set the pragma in the single `db/index.ts` client (and in every script that opens the DB).
**Warning signs:** deleting rows "works" despite RESTRICT.

### Pitfall 7: jose in CommonJS scripts
**What goes wrong:** `require('jose')` fails outside Node ≥20.19/22.12 (ESM-only package).
**How to avoid:** all `scripts/*.mjs` (they don't need jose anyway — only better-sqlite3 + bcryptjs); app code is fine (Next bundles ESM).
**Warning signs:** a `.js` script importing jose.

### Pitfall 8: Session that doesn't survive browser restart
**What goes wrong:** cookie set without `expires`/`maxAge` → browser-session cookie → criterion 2 fails on relaunch.
**How to avoid:** set `expires` (Pattern 2). Also remember login rate-limit counters are in-memory and reset on container restart — acceptable per D-03 discretion, note it in the plan.

### Pitfall 9: Timezone-blind "nightly" job
**What goes wrong:** cron fires at 02:00 in a TZ nobody checked; backups land mid-day or the dated folder name disagrees with the server's date.
**How to avoid:** pick the hour in server-local time explicitly; script names folders by UTC ISO date — decide and document one convention (e.g., `TZ=Europe/Moscow` and date = local).
**Warning signs:** `date` on the server ≠ expected.

## Code Examples

### Login Server Action with rate limit (official docs pattern + in-memory window)

```typescript
// app/login/actions.ts — structure per nextjs.org/docs/app/guides/authentication
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

### Admin CLI scripts (D-02/D-13) — no Next, no jose

```javascript
// scripts/reset-admin.mjs — run on the server: node scripts/reset-admin.mjs
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
(`create-admin.mjs` is the same shape with an INSERT + login prompt; `seed.mjs` (D-11) wraps inserts of departments/employees/devices with generated fake serials and prints a summary; every script repeats the pragmas from Pattern 4.)

### Official Dockerfile baseline (fetched verbatim from vercel/next.js `examples/with-docker`) + phase extensions

The official file (3 stages, `ARG NODE_VERSION=24.13.0-slim`, `npm ci`, `COPY --from=builder /app/.next/standalone ./`, `.next/static`, `USER node`, `EXPOSE 3000`, `CMD ["node","server.js"]`) needs exactly two additions:

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

### Normalization (D-17, FIND-04 groundwork)

```typescript
// lib/normalize.ts — applied on write (create/edit, phases 3+) and on search (phase 5)
const HOMOGlyphs: Record<string, string> = { А:'A', В:'B', С:'C', Е:'E', Н:'H', К:'K', М:'M', О:'O', Р:'P', Т:'T', Х:'X' }
export function normalizeNumber(input: string): string {
  const upper = input.trim().replace(/\s+/g, ' ').toUpperCase()
  return [...upper].map(ch => HOMOGlyphs[ch] ?? ch).join('')
}
```
(The full homoglyph fixture is only *proven* by the Phase 5 typing-test per CONTEXT; the map covers the standard 11 Latin-lookalike capitals — flagged in Assumptions.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` (edge runtime) for auth gates | `proxy.ts` (Node runtime only) | Next 16.0 | Edge-incompatible auth libs moot; jose works natively; `runtime` export throws |
| Sync `cookies()`/`params` | Async only | Next 16 (sync compat removed) | `await cookies()` everywhere |
| `next lint` / eslint config in next.config | Removed — run ESLint CLI directly | Next 16 | Lint setup is plain ESLint flat config |
| Webpack dev/build | Turbopack default | Next 16 | No `--turbopack` flag needed; custom webpack config fails builds |
| Session JWT 7d examples | Our 30d (D-01) | — | Deliberate project decision, not stale docs |
| `.next` shared by dev+build | `next dev` writes `.next/dev`, lockfile prevents concurrent same-command | Next 16 | Dev/build can run concurrently |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `import { migrate } from 'drizzle-orm/better-sqlite3/migrator'` exists (pattern inferred from the officially-documented node-postgres migrator; SQLite page not fetched) | Architecture Pattern 6 / fallback | Container-side migration fallback breaks — host-side `drizzle-kit migrate` is the primary path and is unaffected |
| A2 | `bcryptjs@3` keeps `hash/compare` with cost param (major bump since STACK.md's "latest") | Code Examples | Low: would surface at first test run; swap cost/API trivially |
| A3 | Homoglyph map (11 capitals) sufficient as the starting normalization set | Normalization | Search misses some lookalikes — Phase 5 typing-test fixture is the designated proving ground (per CONTEXT) |
| A4 | Next Server Actions include built-in same-origin (CSRF) protection; SameSite=Lax covers the rest | Security Domain | If unverified, phase would need explicit CSRF tokens — one search away, flag to planner to confirm via `/docs/app/guides/data-security` |
| A5 | better-sqlite3 v13 ships prebuilds for Node 22/24 on linux x64/arm64 and darwin arm64 (README confirms "prebuilt binaries for major platforms" without a matrix) | Standard Stack | Worst case: source build — already covered by the Dockerfile build-tools insurance |
| A6 | Server host has Node ≥20.9 for the host-side migrate step | Deploy flow | Fallback documented (migrate via one-off compose service) |
| A7 | Corporate GitLab remote URL can be created before the deploy task | Open Questions | Deploy blocked on remote creation — human step, fits end-of-phase human gate |
| A8 | Rate-limit parameters (5 fails / 15 min, global counter) | Code Examples | Discretion area (D-03); any sane window passes the criterion |
| A9 | `supercronic` image is acceptable if sidecar option chosen | Backup scheduler | Not the primary path; would need a quick legitimacy check before use |
| A10 | `unstable_doesProxyMatch` (next/experimental/testing/server, verified in proxy docs) is usable for matcher unit tests | Validation Architecture | Test degrades to curl-based integration check — no plan impact |

## Open Questions

1. **Prod server profile (arch, Docker version, host Node, TZ)**
   - What we know: Docker is present (D-08); version/arch unknown; deploy rehearsal is end-of-phase.
   - Recommendation: planner adds a first deploy task that probes (`uname -m`, `docker --version`, `node --version`, `date`) and picks between host-side migrate (A6) and the container-side fallback.
2. **GitLab remote creation (D-15)**
   - What we know: local repo exists on `main`; no remote configured yet.
   - Recommendation: human step (add remote, push) before the deploy task; planner inserts it as a checkpoint.
3. **Backup hour + folder-date convention**
   - What we know: "ночью" (D-07); server TZ unknown.
   - Recommendation: default `02:00` server-local, dated folders in the same local TZ; confirm during deploy task.
4. **`departments` vs ARCHITECTURE's free-text department string**
   - What we know: D-18 locks a lookup table; ARCHITECTURE sketch used a text column.
   - Recommendation: schema v1 uses `departments` + FK (D-18 wins); seed populates a few departments.
5. **Root `/` content this phase**
   - What we know: UI is login-only; something must render after login.
   - Recommendation: minimal Russian stub page (name of app + «экраны появятся в фазах 2–6»); Apple aesthetics anchored in Phase 2 per roadmap.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | dev, build, host-side migrate | ✓ (dev machine) | 22.23.0 (LTS maintenance) | Next 16 needs ≥20.9 ✓; Docker image pins 24-slim; server host Node unknown → container-side migrate fallback |
| npm | installs | ✓ | 10.9.8 | pnpm 11.9.0 also present (STACK uses npm) |
| Docker | dev parity, prod deploy | ✓ (dev) | 29.6.1 | Prod per D-08 "есть" — version probed at deploy |
| Docker Compose | deploy unit | ✓ (dev) | v5.3.0 | — |
| git | D-10/D-15 flow | ✓ | 2.50.1 | Remote not yet configured (A7) |
| openssl | AUTH_SECRET generation | ✓ (macOS/Linux default) | system | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| better-sqlite3 prebuilds | install speed | assumed ✓ (A5) | — | Build tools in Dockerfile deps stage |

**Missing dependencies with no fallback:** none on the dev machine. Prod-side unknowns (host Node, arch) are probed by the deploy task with documented fallbacks.
**Missing dependencies with fallback:** host Node for migrate (fallback: one-off compose service); GitLab remote (human creates it).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.11 (devDependency) |
| Config file | `vitest.config.ts` — Wave 0 (none exists; greenfield) |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` (same; suite is small this phase) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACC-01 | `normalizeNumber` casing/spaces/homoglyphs | unit | `npx vitest run tests/normalize.test.ts` | ❌ Wave 0 |
| ACC-01 | session sign→verify roundtrip; tampered/expired token rejected | unit | `npx vitest run tests/session.test.ts` | ❌ Wave 0 |
| ACC-01 | rate limit: N failures then blocked; window reset | unit | `npx vitest run tests/rate-limit.test.ts` | ❌ Wave 0 |
| ACC-03 | migration 0000 on temp DB creates all 7 tables; duplicate `serial_normalized`/`inventory_normalized` rejected; FKs enforced | integration (temp sqlite file) | `npx vitest run tests/schema.test.ts` | ❌ Wave 0 |
| ACC-03 | `UPDATE`/`DELETE` on `movements` raise; INSERT works | integration | `npx vitest run tests/schema.test.ts -t movements` | ❌ Wave 0 |
| ACC-03 | `db.backup()` copy passes `integrity_check`; rotation keeps 30 | integration | `npx vitest run tests/backup.test.ts` | ❌ Wave 0 |
| ACC-02 | proxy matcher gates non-public paths, lets `/login`+assets through (A10) | unit | `npx vitest run tests/proxy-matcher.test.ts` | ❌ Wave 0 |
| ACC-02 | unauthenticated curl over running dev/prod server returns redirect/401 for `/`, `/api/health` | manual (curl script in README) | — | manual |
| ACC-01/03 | real login in browser; restore rehearsal | manual (end-of-phase acceptance, `human_verify_mode: end-of-phase`) | — | manual |

### Sampling Rate
- **Per task commit:** `npx vitest run` (fast, <10s)
- **Per wave merge:** full suite + `npm run build` (catches Turbopack/standalone issues early)
- **Phase gate:** full suite green + manual curl auth checks + one rehearsed restore before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` (node environment; path alias `@/`)
- [ ] `tests/helpers.ts` — temp SQLite file factory + apply-migrations helper
- [ ] Test files listed in the map above
- [ ] `.env.example` (DATABASE_PATH, AUTH_SECRET) + `.gitignore` entries (`data/`, `.env`)

## Security Domain

> `security_enforcement: true`, ASVS Level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `bcryptjs` hash (cost 12) in `users`; single account via CLI (D-02/13); login rate limit (D-03); generic error message (no user-enumeration) |
| V3 Session Management | yes | jose HS256 signed cookie; `HttpOnly; SameSite=Lax; Path=/; Max-Age 30d` (D-01); `Secure` deliberately omitted (D-04 plain HTTP — documented exception); logout deletes cookie |
| V4 Access Control | yes | Default-deny `proxy.ts` perimeter + `requireSession()` re-check in every Server Action/DAL (official guidance) |
| V5 Input Validation | yes | zod schema in login action; pattern established for all future mutations |
| V6 Cryptography | yes | `jose` (HS256) + `bcryptjs` only — never hand-rolled; `AUTH_SECRET` via `openssl rand -base64 32`, stored in server `.env` (gitignored), injected by compose |
| V7 Error Handling/Logging | yes | Backup script logs to stdout (visible via `docker logs` / cron mail); no password/secret in logs |
| V12 Files & Uploads | partial (future) | Phase 1 establishes the perimeter: any future `/uploads`-style Route Handler is proxy-gated by default; sharp/EXIF rules belong to Phase 4 |
| V14 Configuration | yes | Non-root container (`USER node`); secrets not in git (D-15: private GitLab; `.planning/` excluded from the future public mirror); no plaintext password anywhere (D-02) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Login brute force from LAN host | Spoofing | In-memory fixed-window limit on the login action (D-03) |
| Unauthenticated reach into API/uploads (lateral movement) | Information Disclosure / Elevation | Default-deny proxy + per-action re-check; curl checks in acceptance |
| Cookie theft via XSS | Spoofing / Elevation | `HttpOnly` cookie; React auto-escaping; no `dangerouslySetInnerHTML` |
| CSRF on mutations | Tampering | `SameSite=Lax` + Next Server Actions same-origin POST model (A4 — planner confirms) |
| SQL injection | Tampering | Drizzle parameterized queries only; `db.exec` used exclusively for trusted, version-controlled migration SQL |
| Malicious/typo'd duplicate numbers corrupting registry | Repudiation | UNIQUE on normalized columns (D-17); append-only triggers preserve evidence |
| Bit-rot / bad backup discovered during incident | Availability (Destruction) | Nightly `integrity_check` on the copy (D-14) + rehearsed restore (success criterion 4) |

## Sources

### Primary (HIGH confidence — fetched this session)
- nextjs.org/docs/app/api-reference/file-conventions/proxy — proxy.ts location, exports, matcher (incl. negative lookahead, `_next/data` behavior, Server-Function caveat), Node runtime, migration-from-middleware, `unstable_doesProxyMatch`
- nextjs.org/docs/app/guides/upgrading/version-16 — middleware→proxy (edge NOT supported, runtime not configurable), async-only Request APIs, Turbopack default, `next lint` removal, `.next/dev`
- nextjs.org/docs/app/api-reference/functions/cookies — async cookies(), `.set` in Server Functions/Route Handlers only, option semantics
- nextjs.org/docs/app/guides/authentication — login action + zod + useActionState; jose encrypt/decrypt sample; createSession cookie options; DAL `verifySession`; proxy.ts auth example with matcher; "verify inside each Server Function" guidance; secret via `openssl rand -base64 32`
- nextjs.org/docs/app/api-reference/file-conventions/instrumentation — `register()` once per server instance, must complete before ready; stable since 15
- github.com/WiseLibs/better-sqlite3 README + docs/api.md — `db.backup(destination, [options])` semantics; `db.pragma(..., {simple:true})`; `db.transaction` (sync-only, savepoints, `.immediate`); `db.exec` for multi-statement SQL/migrations; WAL recommendation; prebuilt binaries
- github.com/vercel/next.js examples/with-docker/Dockerfile (raw, verbatim) — ARG NODE_VERSION=24.13.0-slim, 3 stages, standalone copies, USER node, EXPOSE 3000, CMD node server.js; no build tools present (hence our extension)
- github.com/panva/jose README — ESM-only tree-shakeable; runtimes; require(esm) Node constraints
- orm.drizzle.team/docs/get-started-sqlite + /docs/migrations + /docs/sqlite/drizzle-config-file — drizzle() with better-sqlite3; drizzle.config (dialect 'sqlite'); generate→migration.sql+snapshot.json; migrate applies history-tracked migrations; per-driver migrator exists
- sqlite.org/lang_createtrigger.html + sqlite.org/backup.html (via search corroboration) — RAISE(ABORT) triggers; online backup API / VACUUM INTO consistency under WAL

### Secondary (MEDIUM confidence — corroborating sources)
- Drizzle GitHub issues #3349 (partial unique index `where` generation), #6060 (`push` dropping UNIQUE on SQLite) — github.com/drizzle-team/drizzle-orm
- Docker cron placement: OneUptime docker-cron guide, crontap.com/guides/docker-cron-jobs, Dash0 supercronic FAQ, mcuadros/ofelia, matomo-org/docker#77, r/docker SQLite-backup threads
- Native module in Docker: WiseLibs/better-sqlite3 issue #146, community Dockerfiles (finsys/dockhand, whiteout example), zylos.ai ABI explainer

### Tertiary (LOW confidence — practice-based, marked for later validation)
- Cyrillic homoglyph map completeness — PITFALLS.md [PE]; proven by Phase 5 typing-test fixture (per CONTEXT)
- Rate-limit window parameters — planner discretion (D-03)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version verified on npm registry today; auth/session/backup APIs verified in official docs fetched this session
- Architecture: HIGH for auth/schema/backup mechanics; MEDIUM for scheduler placement and Docker native-module handling (multiple corroborating community sources; no single official doc covers better-sqlite3-in-standalone)
- Pitfalls: HIGH for SQLite/WAL/auth traps (official docs); MEDIUM for Docker/volume/TZ operational details

**Research date:** 2026-08-31
**Valid until:** 2026-09-30 (stable stack; re-check Next.js minor releases before deploy task)
