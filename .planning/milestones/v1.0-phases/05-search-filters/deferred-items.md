# Deferred Items — Phase 5 (out-of-scope discoveries)

Logged by 05-06 execution per executor scope-boundary rules (pre-existing issues in
unrelated files are not fixed by the gap-closure plan).

## Pre-existing lint warnings (not from 05-06)

- `tests/devices-queries.test.ts:282,283,285` — `wIn30`, `wIn60`, `wPast` assigned but
  never used (`@typescript-eslint/no-unused-vars`, warnings only, `npm run lint` exits 0).
  File untouched by 05-06 (which changed only `app/(app)/devices/search-box.tsx`).
  Suggested owner action: drop the three bindings or assert on them in a future test cleanup.

## Flaky test (pre-existing, environmental)

- `tests/attachments-queries.test.ts > attachments queries — cap, strict pair, delete
  (D-05) > deleteAttachment removes the row AND both disk files` — intermittently fails
  with `expect(existsSync(resolve(dir, 'uuid-del.jpg'))).toBe(false)` receiving `true`:
  a disk-unlink visibility race right after `deleteAttachment`, observed on macOS in
  ~2 of 5 consecutive `npx vitest run` executions (2026-09-05 ~03:35 local, before any
  05-06-related test infrastructure change; the test does not import search-box code).
  Suite passes on re-run (278/278). Suggested owner action: investigate whether
  `deleteAttachment` unlinks asynchronously / defer the assertion, in a dedicated fix —
  not in a search-filter gap-closure plan.
