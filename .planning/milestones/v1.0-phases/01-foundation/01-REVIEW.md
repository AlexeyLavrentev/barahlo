---
phase: 01-foundation
reviewed: 2026-09-01T09:07:00Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - proxy.ts
  - db/schema.ts
  - db/index.ts
  - drizzle.config.ts
  - drizzle/0000_amusing_talon.sql
  - lib/session.ts
  - lib/auth.ts
  - lib/rate-limit.ts
  - lib/normalize.ts
  - lib/normalize.mjs
  - app/login/page.tsx
  - app/login/login-form.tsx
  - app/login/actions.ts
  - app/(app)/page.tsx
  - app/(app)/actions.ts
  - app/api/health/route.ts
  - scripts/create-admin.mjs
  - scripts/reset-admin.mjs
  - scripts/seed.mjs
  - scripts/backup.mjs
  - scripts/deploy.sh
  - Dockerfile
  - compose.yml
  - .dockerignore
  - .env.example
  - vitest.config.ts
  - tests/helpers.ts
  - tests/stubs/server-only.ts
  - tests/normalize.test.ts
  - tests/session.test.ts
  - tests/rate-limit.test.ts
  - tests/schema.test.ts
  - tests/backup.test.ts
  - tests/proxy-matcher.test.ts
findings:
  critical: 2
  warning: 3
  info: 4
  total: 9
status: issues_found
fix_status: Critical+Warning fixed (693a5ce, f702ab4, beb7412, fc59695, 8fe3a73; 41/41 tests green); Info findings open
---

# Phase 01: Code Review Report

**Reviewed:** 2026-09-01T09:07:00Z
**Depth:** standard
**Files Reviewed:** 34
**Status:** issues_found

## Summary

Phase 1 foundation is overall well-built: the default-deny `proxy.ts` perimeter is correct (only asset prefixes excluded, `/login` publicity decided in the handler), `requireSession()` is applied as the second layer in the page and the health route, the login action orders checks correctly (zod → rate limit → DB → bcrypt, generic error, no enumeration via message), the schema carries the D-17 UNIQUE indexes and append-only triggers, and `backup.mjs` correctly uses the online backup API under WAL. The D-01/D-04 session choices (30d, no Secure flag) and the single-user CLI model are honored as locked.

Two Critical defects were found and both were **empirically reproduced** during this review:

1. `lib/session.ts` derives its HMAC key from `AUTH_SECRET` with zero validation. Unset/empty secret builds a zero-length key (login then crashes at first sign — fail-closed but late and cryptic), and any short non-empty secret (e.g. `abc`) is silently accepted by jose, making session tokens forgeable — an auth-bypass-by-misconfiguration in the phase's single security keystone.
2. `scripts/backup.mjs` creates the dated destination folder *before* the backup; any failure mid-run leaves the folder in place and the idempotency check then reports `skipped: true` on every retry — the day is silently never backed up, and the empty folder occupies a rotation slot (proven by reproduction: retry returned `{skipped: true}` after a failed run).

Security posture notes: all SQL is parameterized; `.env` and `data/` are correctly gitignored and untracked; `.dockerignore` keeps secrets and planning material out of the build context; no `eval`/`innerHTML`/debug artifacts in app code; container runs non-root.

## Critical Issues

### CR-01: AUTH_SECRET is used with no presence/strength validation — weak secret silently accepted, missing secret crashes login at runtime

**File:** `lib/session.ts:7`
**Issue:** `const encodedKey = new TextEncoder().encode(process.env.AUTH_SECRET)` is evaluated at module load with no check. Verified during this review:

- `AUTH_SECRET` unset → `encode(undefined)` returns a **zero-length** key (WebIDL default for the optional argument), and `jose`'s `sign()` then throws `DataError: Zero-length key is not supported` — i.e. every login attempt dies with an unhandled 500 only when the first user actually tries to log in (fail-closed, but late and opaque; the app boots "successfully" into a broken auth state).
- `AUTH_SECRET=abc` (any short non-empty value, e.g. someone quickly filling `.env`) → sign/verify **succeed** silently (verified: 3-char secret produces accepted tokens). HS256 over a guessable secret means anyone on the LAN can forge a valid session cookie and walk past the perimeter — full auth bypass (CWE-321/CWE-1188).

Note that `tests/session.test.ts` always sets a strong test secret before import and `tests/proxy-matcher.test.ts` imports `@/lib/session` with no secret at all and passes — so the test suite structurally cannot catch either failure mode.

**Fix:**
```typescript
// lib/session.ts
function getEncodedKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 32) {
    // Fail at startup, not at first login. 32+ chars ~= openssl rand -base64 32.
    throw new Error('AUTH_SECRET is missing or too short — generate with: openssl rand -base64 32')
  }
  return new TextEncoder().encode(secret)
}
const encodedKey = getEncodedKey()
```
Also consider a startup log line confirming secret length (never the value), and make `.env.example`'s `AUTH_SECRET=` comment say the app refuses to boot without a real value.

### CR-02: Failed backup leaves the dated folder in place — retries silently report `skipped`, the day is never backed up, and rotation slot is stolen

**File:** `scripts/backup.mjs:52-67`
**Issue:** `runBackup()` creates `backups/<day>/` (line 54) *before* the snapshot (line 58-64) and the integrity check (line 67). If `db.backup()` or `checkIntegrity` fails (disk full, corrupted live DB, transient lock), the partial/empty folder remains, and the idempotency check at line 52 treats its existence as "already backed up". Reproduced during this review: after a forced failure, `readdirSync(dest)` showed an empty folder and the same-day retry returned `{ dest, skipped: true }` with exit code 0 — the operator (cron logs) sees "уже есть" for a day that has **no backup at all**. Additionally the phantom folder participates in rotation (`slice(0, -KEEP_DAYS)` counts it), so once at capacity it evicts a real old backup. This is a data-loss risk in exactly the safety net the phase was supposed to establish (D-05/06/07/14).

**Fix:**
```javascript
mkdirSync(dest, { recursive: true })
try {
  const db = new Database(join(dataDir, 'app.db'))
  db.pragma('busy_timeout = 5000')
  try {
    await db.backup(join(dest, 'app.db'))
  } finally {
    db.close()
  }
  checkIntegrity(join(dest, 'app.db'))
  // ...uploads copy...
} catch (err) {
  rmSync(dest, { recursive: true, force: true }) // never leave a partial day folder
  throw err
}
```
(Alternative: snapshot into `backups/.tmp-<day>` and rename into place on success — atomic and equally correct.) Add a vitest case: failed `runBackup` → `dest` absent → immediate retry performs a real backup.

## Warnings

### WR-01: Rate-limit failure log grows without bound — unauthenticated memory/CPU amplifier

**File:** `lib/rate-limit.ts:7-19`
**Issue:** `recordFailure()` pushes timestamps into `failures` and nothing ever prunes entries older than the 15-minute window; `checkRateLimit()` scans the entire array on every login attempt. The input is unauthenticated: a scripted LAN host can grow the array indefinitely (memory leak) and force an ever-growing scan per attempt. Window semantics are correct (verified by tests), but the implementation never forgets.
**Fix:** prune inside the check (or on write):
```typescript
export function checkRateLimit(nowMs: number = Date.now()): boolean {
  const cutoff = nowMs - WINDOW_MS
  while (failures.length > 0 && failures[0] <= cutoff) failures.shift()
  return failures.length >= MAX_FAILURES
}
```
(`shift()` in a loop is fine at this scale; a ring buffer is overkill for one user.)

### WR-02: deploy.sh runs `npm ci` before `git pull` — host-side migrate executes with the previous commit's dependencies

**File:** `scripts/deploy.sh:13-30`
**Issue:** Step 1 installs `node_modules` from the *old* lockfile, then step 2 pulls new code. Step 4 (`npx drizzle-kit migrate`) then runs the new commit's migration files with the old commit's drizzle-kit version (and against any new drizzle-kit journal format) — version drift on the exact tool the deploy depends on, and the fresh `npm ci` the update was supposed to deliver never happens this run. `docker compose build` (step 3) installs fresh deps only inside the image; the host migrate is the stale one.
**Fix:** reorder — `git pull` first, then `npm ci`:
```bash
echo "==> [1/6] git pull origin main"
# ...pull...
echo "==> [2/6] npm ci (devDeps on host for the migrate step)"
npm ci
```

### WR-03: Admin CLI password prompts are echoed in plaintext, contradicting the code's own claim

**File:** `scripts/reset-admin.mjs:3-4, 28` and `scripts/create-admin.mjs:48`
**Issue:** `reset-admin.mjs` states "The typed password is never printed anywhere", but `readline.createInterface({ input, output })` echoes every typed character to the terminal (that is what providing `output` does). The new password is fully visible on screen/SSH session while typing — shoulder-surfing and session-recording exposure on the server where this runs.
**Fix:** mute echo for the password prompt, e.g. route the interface through a output shim that suppresses writes while the password is being entered, or use `rl.question` with `output` temporarily set to a write-discarding stub (restore after). Keep the prompt itself (`output.write`) outside the mute.

## Info

### IN-01: `movements.eventType` and `attachments.kind` lack CHECK constraints while `devices.status` has one

**File:** `db/schema.ts:121` (event_type), `db/schema.ts:143` (kind)
**Issue:** The comment enumerates 7 valid `event_type` values and `kind` defaults to `'photo'`, but nothing enforces either — a typo in phase 2-4 code writes a silent garbage row into the append-only history, which can then never be updated or deleted (by design). Inconsistent with the `devices_status_ck` precedent established in the same file.
**Fix:** add `check('movements_event_type_ck', sql`...`)` with the documented value list (and optionally a `kind` CHECK) to the next migration; the append-only triggers make post-hoc cleanup impossible, so the constraint is worth more than usual here.

### IN-02: Login timing side-channel — no bcrypt compare when the login is unknown

**File:** `app/login/actions.ts:39`
**Issue:** `user && (await bcrypt.compare(...))` short-circuits, so an unknown login returns in ~1ms while a known login with a wrong password pays ~100ms+ of bcrypt cost 12. The generic error message prevents message-based enumeration, but response timing still reveals whether the single account's login string was guessed. Low stakes (single account, LAN), but cheap to close.
**Fix:** compare against a fixed dummy hash when `user` is undefined:
```typescript
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZDZQj1Vp1p2b3kqQq0y0Qq0y0Qq0y0' // precomputed
const valid = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH)
```

### IN-03: seed.mjs cannot even load inside the production container — the NODE_ENV refusal never runs

**File:** `scripts/seed.mjs:6` with `Dockerfile:104`
**Issue:** The Dockerfile copies `scripts/` into the runner but not `lib/`. `seed.mjs` has a top-level `import ... from '../lib/normalize.mjs'`, which is resolved at module load — before the "Seed запрещён в production" guard. Inside the container the script crashes with `ERR_MODULE_NOT_FOUND` (stack trace) instead of refusing cleanly. The guard's protective intent still holds (it never runs), but the failure mode is confusing and the script is dead weight in the image.
**Fix:** either `COPY --chown=node:node lib ./lib` next to the scripts copy, or make the import dynamic *after* the NODE_ENV check.

### IN-04: backup.mjs CLI-tail guard crashes when `process.argv[1]` is undefined

**File:** `scripts/backup.mjs:92`
**Issue:** `pathToFileURL(process.argv[1]).href` throws `ERR_INVALID_ARG_TYPE` (reproduced) whenever the module is imported from a context where `argv[1]` is unset (REPL, `node -e`, programmatic import). Today the vitest suite only survives because the vitest binary happens to occupy `argv[1]` — the guard's correctness is accidental. Real CLI runs are unaffected.
**Fix:**
```javascript
const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) { /* ... */ }
```

---

_Reviewed: 2026-09-01T09:07:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
