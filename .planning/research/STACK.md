# Stack Research

**Domain:** Internal IT asset-tracking web app (single manager, 50–200 employees, hundreds of devices, LAN-deployed, Russian UI)
**Researched:** 2026-08-31
**Confidence:** HIGH overall (core choices verified against npm registry + official docs on 2026-08-31; see per-section confidence and Sources)

## Recommended Stack

One Next.js app, one SQLite file, one Docker container. Everything else follows from three facts: one writer user, hundreds of rows, internal server. Any technology that solves multi-user, multi-server, or internet-scale problems is dead weight here.

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js (App Router) | 16.3.3 | Full-stack framework: pages, API, mutations in one codebase | The 2025/2026 default for solo-built CRUD apps. App Router + Server Components + Server Actions means no separate REST layer to design and maintain — a form submits straight into a typed server function that writes to SQLite. Turbopack is now the stable default bundler (2–5x faster builds). Best-documented self-hosting story of any React framework, with an official maintained Docker example. Verified: nextjs.org blog (Oct 21 2025) + npm registry. **Confidence: HIGH** |
| React + TypeScript | 19.2.x / ≥5.1 | UI runtime; type safety end-to-end | Next 16 requires TS ≥5.1 and ships React 19.2 (View Transitions available if wanted for the Apple-like feel). create-next-app scaffolds TS + Tailwind + ESLint in one command. **Confidence: HIGH** |
| SQLite + better-sqlite3 | 3.x / 13.0.3 | Database | Correct at this scale by official criteria: SQLite allows unlimited readers and exactly one writer at a time — with a single manager user, the "limitation" is simply not a problem. Zero administration, backup = copy one file (`VACUUM INTO` for a consistent hot backup). sqlite.org itself serves ~400–500K requests/day on SQLite. WAL mode gives smooth read-during-write. better-sqlite3 is the mature driver (sync API is faster and simpler than async for this workload, prebuilt binaries for Node 24). `node:sqlite` built into Node is only a Release Candidate — not yet for production. **Confidence: HIGH** |
| Drizzle ORM + drizzle-kit | 0.45.2 / latest | Type-safe queries and schema migrations | Typed schema that doubles as documentation; `drizzle-kit push` during dev, `generate`+`migrate` for prod upgrades. Lighter than Prisma (no query-engine binary, no generate step, sync native driver). Keeps the Postgres escape hatch: schema/query changes on a future Postgres move are near-mechanical. **Confidence: HIGH** |
| Tailwind CSS | 4.3.3 | Styling | v4 is current (CSS-first config, no tailwind.config.js needed). Default in create-next-app. The sole realistic choice for hand-tuned Apple-like design: utility classes give precise control over spacing/typography that component-kit admin themes cannot. **Confidence: HIGH** |
| shadcn/ui | CLI v4 (2026) | Accessible component primitives | Copy-in components (table, dialog, dropdown, command palette) built on Base UI (default since Jul 2026; Radix/React Aria also supported) — accessible behavior without imposing visual design. You restyle with Tailwind to Apple aesthetics instead of fighting a theme. Init: `pnpm dlx shadcn@latest init -t next`. **Confidence: HIGH** |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| jose | 6.2.10 | Sign/verify session token (JWT, HS256) | Auth: issue a signed session cookie at login; verify in `proxy.ts`/layout. Tiny, edge-and-node safe, ESM. Note: ESM-only — fine under Next bundling. |
| bcryptjs | latest | Password hashing | Hash the single manager's password (env var or seeded DB row). Pure JS — no native build issues in Docker. (argon2 is stronger but native; unnecessary for one account behind a LAN.) |
| zod | 4.5.4 | Validation in Server Actions and forms | Validate device/employee payloads server-side before touching SQLite; v4 is current. |
| sharp | 0.35.4 | Resize/compress photo uploads | At upload: produce a ~1600px web image + ~400px thumbnail, store both on disk; keep SQLite rows referencing paths. Never store blobs in the DB file. |
| papaparse | 5.7.0 | CSV import parsing (future-proofing) | Mature RFC-4180 parser. PROJECT.md defers spreadsheet import, but CSV **export** is in scope — see Stack Patterns. |
| lucide-react | latest | Icons | Standard icon set shipped by shadcn/ui; thin-stroke style fits Apple aesthetics. |
| react-hook-form + @hookform/resolvers | latest | Complex form state | Only for the device card form (many typed fields incl. per-type attributes). Simple forms can use Server Actions + `useActionState` alone — do not add RHF everywhere. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| create-next-app | Project scaffold | `npx create-next-app@latest` — App Router, TS, Tailwind v4, ESLint, Turbopack by default |
| drizzle-kit | Schema push / migrations / studio | `drizzle-kit push` in dev; `generate` + `migrate` for prod; `drizzle-kit studio` for a quick data GUI |
| Docker + compose | Deployment unit | Official `examples/with-docker` Dockerfile: multi-stage, `node:24-slim`, non-root, `output: "standalone"`, ships a `compose.yml` |
| nginx or Caddy | Reverse proxy on the internal server | Official self-hosting guidance recommends a proxy in front (payload limits, malformed requests). Caddy: 5-line config, auto-renews certs if HTTPS-on-LAN ever wanted. Optional but recommended. |
| Biome or ESLint | Lint/format | `next lint` was removed in Next 16 — run ESLint directly or use Biome |

## Installation

```bash
# Scaffold (App Router + TS + Tailwind v4 + ESLint)
npx create-next-app@latest barahlo

# Core app deps
npm install drizzle-orm@0.45 better-sqlite3@13 jose bcryptjs zod@4 sharp

# Supporting
npm install papaparse lucide-react
npm install react-hook-form @hookform/resolvers   # only when building the device card form

# Dev dependencies
npm install -D drizzle-kit @types/better-sqlite3 @types/papaparse
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Next.js 16 | SvelteKit 2 | Solo dev who prefers Svelte and doesn't need the React/shadcn ecosystem; smaller component library selection makes Apple-like polish more manual |
| Next.js 16 | React Router 7 (Remix) | Excellent framework, but smaller self-hosting docs/community and no comparable copy-in component ecosystem |
| Next.js 16 | Laravel / Django | If the solo maintainer were a PHP/Python shop; wrong runtime here — adds a second language and templating world |
| SQLite | PostgreSQL 17/18 | Only if: several staff will write concurrently, the app will grow past one server, or a company Postgres instance already exists and is free to piggyback on. Revisit at multi-user — Drizzle makes the move cheap |
| Drizzle | Prisma | Prisma is fine, but its engine binary + generate step is heavier in Docker and its async client adds no value over better-sqlite3's sync API at this scale |
| Hand-rolled cookie session (jose) | Better Auth 1.7.2 | The moment a second user/role appears — Auth.js has been folded into Better Auth, making it the successor standard. Do not start with it for one account; its setup/config outweighs a ~50-line session module |
| Next.js Docker (official example) | Bare `node server.js` + systemd | If Docker cannot be installed on the internal server. Standalone output runs as plain Node — `node .next/standalone/server.js` under a systemd unit is a legitimate fallback |
| shadcn/ui | Mantine / Ant Design / react-admin | Mantine if you want batteries-included over design control; Ant/react-admin actively fight the Apple aesthetic ("admin from 2010") |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| NextAuth / Auth.js v5 | Still beta (`5.0.0-beta` docs; stable npm tag is legacy 4.24.15) and the project has merged into Better Auth — adopting it now means migrating later | ~50-line session: login form → `bcryptjs.compare` → `jose`-signed HttpOnly cookie; verify in `proxy.ts`/layouts |
| PostgreSQL (now) | A second service to install, monitor, back up, and upgrade on an internal server — for one writer and hundreds of rows | SQLite + WAL; keep Drizzle so the door stays open |
| Prisma | Query-engine binary + codegen step complicate the Docker image for zero benefit over Drizzle here | Drizzle ORM |
| `node:sqlite` (built-in) | Stability 1.2 "Release candidate" as of Node 25.7+ — not production-stable on the LTS line you'll run | better-sqlite3 13 |
| Alpine-based Node images with better-sqlite3 | musl libc breaks/slow-paths native module builds; the official Next.js example deliberately chooses `node:24-slim` (glibc) | `node:24-slim` |
| next-intl / i18n libraries | Single Russian locale; i18n routing/message machinery is pure overhead | Russian strings inline; `Intl.DateTimeFormat('ru-RU')` / `Intl.NumberFormat('ru-RU')` for dates/currency |
| Refine, react-admin, Ant Design, Bootstrap templates | They impose an admin-dashboard look — the explicit opposite of the Apple-minimal requirement | Tailwind v4 + shadcn/ui primitives restyled per the `apple-design` skill |
| Tailwind v3 + tailwind.config.js | v3 is the previous major; shadcn/ui has supported v4 since Feb 2025 | Tailwind v4 (CSS-first `@theme`) |
| Storing photos as BLOBs in SQLite | Bloats the DB file, complicates backup/streaming | sharp-resized files under a volume-mounted `data/uploads/`, paths in DB |
| Redis / any session store | One user, one process | Signed cookie holds the session |
| Client-side data fetching (TanStack Query + REST) | Doubles the data layer for a server-rendered CRUD app | Server Components read SQLite directly; Server Actions mutate; `updateTag`/`refresh` (Next 16) for cache freshness |

## Stack Patterns by Variant

**CSV export (in scope):**
- Generate RFC-4180 CSV server-side (string building is enough at hundreds of rows), prepend UTF-8 BOM `\uFEFF`, `Content-Type: text/csv; charset=utf-8`
- Use `;` as the delimiter — Russian Excel localizes the list separator to semicolon (comma is the decimal mark); papaparse on import if it ever arrives
- Filename via `Content-Disposition` with RFC 5987 encoding for the Cyrillic name

**Photo uploads:**
- Route Handler or Server Action receives `FormData` → validate MIME + size (≤~10 MB) → `sharp` resize to web + thumb → UUID filenames under `data/uploads/` → DB stores paths
- Serve via same-origin relative URLs; then `next/image` optimization works with zero config under `next start`. Next 16 blocks optimization of LAN-IP URLs by default (`images.dangerouslyAllowLocalIP`) — only relevant if images are referenced by IP, which this design avoids

**Auth shape (single user):**
- Credentials in env (`AUTH_PASSWORD_HASH`, `AUTH_SECRET`) or a seeded `user` table
- Login Server Action → bcrypt compare → jose HS256 JWT (e.g. 7-day expiry) in `HttpOnly; SameSite=Lax` cookie (add `Secure` if HTTPS on LAN)
- Gate the app in the root layout / `proxy.ts` (Next 16 proxy runs on the Node runtime, so the JWT verify is trivial there)

**Deployment:**
- `output: "standalone"` + official multi-stage Dockerfile (`node:24-slim`, non-root) + `compose.yml`
- Volume mounts: `data/app.db` (SQLite) and `data/uploads/` (photos) — the entire state of the system, backup = copy both
- `docker compose up -d --build` to update; nginx/Caddy in front on port 80

**If Docker is unavailable on the server:**
- Standalone build runs as plain Node: systemd unit → `node /opt/barahlo/server.js` with `NODE_ENV=production`; identical state layout

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| next@16.3.3 | react@19.2.x, react-dom@19.2.x, TS ≥5.1, Node ≥20.9 | Pin Node 24 LTS (Active, EOL ~Apr 2028); Node 20 is EOL since Mar 2026 |
| drizzle-orm@0.45.x | drizzle-kit (install latest of both together) | Always bump the pair in lockstep |
| better-sqlite3@13 | Node 24 | Prebuilt binaries for LTS; needs glibc — hence `node:24-slim`, not Alpine. Rebuild not needed in Docker since the image ships prebuilds |
| tailwindcss@4.3.x | shadcn/ui (v4 support since Feb 2025), create-next-app default | No config-file migration needed on new project |
| zod@4.x | @hookform/resolvers latest, Server Actions | zod v4 is current; older resolvers versions target v3 — install resolvers@latest |
| jose@6 | Next.js server runtime | ESM-only package — fine under Next/Turbopack bundling; do not import it in `scripts/` run with bare CJS |
| Next 16 middleware patterns | `proxy.ts` | `middleware.ts` is deprecated (removed in a future major); export `proxy`, runs on Node runtime |

## Sources

- npm registry (fetched 2026-08-31, authoritative for versions): next 16.3.3, react 19.2.8, drizzle-orm 0.45.2, better-sqlite3 13.0.3, tailwindcss 4.3.3, next-auth 4.24.15, better-auth 1.7.2, jose 6.2.10, iron-session 9.0.1, papaparse 5.7.0, zod 4.5.4, sharp 0.35.4
- https://nextjs.org/blog/next-16 — Next 16 features, breaking changes, Node/TS minimums (official, Oct 2025)
- https://nextjs.org/docs/app/guides/self-hosting — reverse proxy, image optimization, standalone (official, lastUpdated 2026-08-25)
- https://github.com/vercel/next.js/tree/canary/examples/with-docker — official Docker example: standalone, node:24-slim, non-root, compose.yml
- https://www.sqlite.org/whentouse.html — official SQLite vs client/server criteria (one writer, readers unlimited, <100K hits/day fine)
- https://orm.drizzle.team/docs/get-started-sqlite — Drizzle SQLite drivers and drizzle-kit workflow (official)
- https://authjs.dev/getting-started — v5 beta status; "Auth.js project is now part of Better Auth" (official)
- https://ui.shadcn.com/docs/installation/next and /docs/changelog — CLI v4, Base UI default (Jul 2026), Tailwind v4 support (Feb 2025)
- https://nodejs.org/en/about/previous-releases — v24 Active LTS, v22 Maintenance, v20 EOL
- https://nodejs.org/api/sqlite.html — node:sqlite Stability 1.2 Release candidate
- https://www.tinybird.co/blog/postgres-vs-sqlite and r/django thread — community cross-check of SQLite-for-single-user consensus (MEDIUM)

**Confidence note:** Versions are HIGH (two independent official sources: npm registry + vendor docs). The SQLite-over-Postgres and avoid-NextAuth calls are HIGH (official guidance + ecosystem status verified 2026-08-31). CSV delimiter/BOM guidance for Russian Excel is MEDIUM (well-established but not verified against a Microsoft doc). Overall stack direction: HIGH.

---
*Stack research for: Barahlo — internal IT asset tracking (single manager, LAN-deployed)*
*Researched: 2026-08-31*
