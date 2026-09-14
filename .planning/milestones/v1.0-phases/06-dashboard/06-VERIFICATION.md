---
phase: 06-dashboard
verified: 2026-09-14T08:59:15Z
status: passed
score: 19/19 must-haves verified
behavior_unverified: 0
overrides_applied: 0
unverified_prohibition_note: "3 judgment-tier prohibitions (DASH-01/DASH-02/DASH-03) carry code-level LLM-judge verdicts of RESOLVED — non-authoritative; human review recommended (see Human Verification item 4). A 4th item: WR-01 post-fix semantic confirmation, flagged by the fixer itself."
human_verification:

  - test: "Visual hierarchy per 06-UI-SPEC on a seeded dev DB: open / and inspect the tiles grid (4 types then 4 statuses, one grid, quiet white tiles), the two-column blocks zone («Гарантия» left/first, feed second), counter rows with chevrons, «Ближайшие сроки» sub-header, top-5 two-line rows; then overflow probes: a very long device model and a long employee name/route in the feed, a long model in the top-5"
    expected: "Tiles/rows never break layout: model and route truncate before the shrink-0 pill/serial/date, top-5 model truncates before the chevron, title attributes carry the full texts; «Списано» tile is neutral (navigation, not a badge); «Списание» pill is the only destructive-tinted label"
    why_human: "Both PLANs declare overflow/truncate/title and the tile/card anatomy as held-out visual backstops (SUMMARY coverage D3/W3, human_judgment: true); rendered layout and title behavior cannot be asserted from the vitest node environment (no component test runner in the repo)"

  - test: "Deep-link click-through on the seeded dev DB: click a type tile, a status tile, each warranty counter (≤30, ≤60, Истекла) and a top-5 row; click a feed row's model and an employee name in the feed route"
    expected: "Every click lands on the pre-filtered /devices list (or the device/employee card); the list total for a clicked warranty counter equals the number shown on the dashboard (the plan's own manual probe: «клик по счётчику открывает отфильтрованный список с тем же числом»)"
    why_human: "Smoke asserts the href strings exist in HTML and parity tests prove counter==filter.total, but the felt navigation (browser routing to the right pre-filtered view, correct count rendering end-to-end on live data) is the deliberate end-of-phase manual check (06-02 verification section; post-execution note: deep-link navigation feel is manual-only)"

  - test: "WR-01 semantic confirmation on live data (fixer-flagged): with devices holding known warranty dates (today, today+60, today+61, yesterday, +70, NULL) on a seeded dev DB, read the three counters, the top-5 list and the colored WarrantyDate dates"
    expected: "«≤ 30» and «≤ 60» both include warranty-until-today; today+60 inside ≤60, today+61 in neither and not expired; yesterday counts only in «Истекла»; top-5 shows soonest-first alive-only dates, all warn-orange (no green), expired/NULL devices absent from the list but present in the «Истекла» count"
    why_human: "Commit a8c2bf7 changed SQL-boundary composition (injectable today param in warrantyPredicate, both dashboard consumers recomposed); the frozen-clock test suite pins the semantics, but the fixer explicitly flagged this logic-adjacent change for human confirmation during validation"

  - test: "Judgment-tier prohibition review (unverified-prohibition — human review recommended): read the three prohibition statements in 06-01/06-02 PLAN frontmatter against the code (db/queries/devices.ts:194-360, app/(app)/page.tsx:61-154) and sign off"
    expected: "Confirm: (a) no page counter has a parallel predicate/filter implementation — tiles are plain GROUP BY parity-pinned, warranty counters/top-5 COMPOSE warrantyPredicate; (b) the feed route table matches the UI-SPEC event table («склад» only in assigned/returned/transferred; to_repair keeps «от {держатель}»; received/from_repair/disposed have no route) and the SELECT reads append-only data — no mutation on the dashboard; (c) no second warranty math or color logic on the page (grep warrantyState( == 0; only WarrantyDate), expired devices never appear as «alive» in the top-5"
    why_human: "Judgment-tier prohibitions route to human resolution per ADR-550 D4 in autonomous verification; the code-level LLM-judge verdict is RESOLVED on all three but is non-authoritative"
---

# Phase 6: Dashboard — Verification Report

**Phase Goal:** Один экран-сводка над всеми данными: сколько техники и какой, у кого что, что в ремонте/списано, что истекает, что двигалось — чистая read-модель, наследующая корректность ядра.
**Verified:** 2026-09-14T08:59:15Z
**Status:** human_needed
**Re-verification:** No — initial verification

> **MVP-mode format discrepancy (escalation, per phase-5 precedent).** ROADMAP.md sets `Mode: mvp`, but the goal is not in User Story format — `gsd-tools query user-story.validate` returns `false` (the canonical regex is English-only; all goals in this RU-language project fail it). As in 05-VERIFICATION.md, verification proceeded against the ROADMAP's 3 Success Criteria (the non-negotiable roadmap contract), with the User Flow Coverage table below derived from them. If a strict MVP UAT script is wanted, run `/gsd mvp-phase 6`. This discrepancy does not change the technical verdict.

## User Flow Coverage

User story equivalent (from the 3 ROADMAP Success Criteria): an operator opens `/` and sees in one screen how much equipment there is and of what kind, who holds what, what is in repair/disposed, what is expiring, and what moved — every number clickable into the phase-5 filtered lists.

| Step | Expected | Evidence | Status |
|------|----------|----------|--------|
| Open / under a session | Live dashboard: «Дашборд» head, «Всего: {pluralDevices}» non-link, one grid of 8 always-present tiles | `app/(app)/page.tsx:259-325` (pure RSC, requireSession first, `Map.get ?? 0` over DEVICE_TYPES/TYPE_ITEMS + STATUS_TILE_ORDER); smoke `GET /` → 200 + markers (run by verifier, exit 0) | ✓ (layout/overflow feel → human #1) |
| Read counts by type and status | Each tile number equals the total of the matching /devices filter | Parity group in `tests/dashboard-queries.test.ts` — every counter == `listDevices({…}).total` through the public API + hand-known buckets 1/3/1 + type-sum == total; 17/17 green (verifier run) | ✓ |
| Click a tile → filtered list | Deep link into phase-5 filters, href built ONLY by buildDevicesQuery with a full DeviceFilters | `page.tsx:61-97` three href helpers over `buildDevicesQuery`; negative greps: `"/devices?` == 0, `next/navigation` == 0; smoke asserts `?type=`/`?status=` families | ✓ (navigation feel → human #2) |
| Look at «Гарантия» | Three counters 30 → 60 → истекла (inclusive boundary, same predicate as the filter), top-5 soonest alive warranties, warn-orange dates | `db/queries/devices.ts:311-360` composes `warrantyPredicate(w, today)` (post-WR-01, commit a8c2bf7 — verified in code); frozen-MSK TZ group green; smoke asserts all three labels + `?warranty=w30|w60|expired` hrefs + «: 0» rows + empty copy on fresh DB | ✓ (semantic live-data confirmation → human #3) |
| Scan the movements feed | 10 latest events, stable order at equal instants, segmented links (device card + employee cards, no nested anchors), «склад» only in custody moves, honest empty state on fresh DB | `db/queries/movements.ts:416-439` (alias double-join + innerJoin devices, desc(occurredAt)+desc(id), ids in SELECT); feed group tests (tie, limit-10-of-12, null slots, join correctness, 7 labels); `page.tsx:130-210` routeSegments per UI-SPEC table; smoke asserts «Перемещений пока нет» on fresh temp DB | ✓ (populated-feed click-through → human #2) |
| Open / without a session | 307 → /login, never 500 | smoke-dashboard + smoke-devices perimeter steps (verifier runs, exit 0); requireSession first line (`page.tsx:260`) | ✓ |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1 (DASH-01): дашборд показывает количество устройств по типам и по статусам | ✓ VERIFIED | Parity tests counter==listDevices.total (17/17 verifier run); tiles render aggregates over the same table (`devices.ts:269-294`); smoke renders 8 tiles |
| 2 | SC2 (DASH-02): блок гарантии перечисляет истекающие/истёкшие и ведёт в отфильтрованный список | ✓ VERIFIED | `warrantyPresetCounts`/`nearestExpiringWarranties` compose `warrantyPredicate` (code-verified, a8c2bf7); TZ-boundary tests green; smoke asserts counter labels + preset hrefs; click-through feel → human #2 |
| 3 | SC3 (DASH-03): лента показывает последние события со ссылками на устройства и сотрудников | ✓ VERIFIED | Feed tests pin order/tie/limit/null-slots/ids/join; `page.tsx` FeedRow renders `/devices/{id}` + `/employees/{id}` links; populated-feed render observed in executor's isolated live check (2/3/1, segmented hrefs); click-through → human #2 |
| 4 | «Дашборд» head + «Всего: {pluralDevices}» НЕ ссылка; 8 тайлов одной сеткой (4 типа → 4 статуса) | ✓ VERIFIED | `page.tsx:287-325` — `<p>` not `<Link>` for total (D-03); one `grid grid-cols-2 sm:grid-cols-4` |
| 5 | Zero-default: все 8 тайлов существуют всегда, включая свежую установку | ✓ VERIFIED | `Map.get ?? 0` over keystone lists (`page.tsx:270-275,301-324`); zero-default test group on empty DB green |
| 6 | Лента = 10 последних, desc(occurredAt)+desc(id) tiebreaker, сегментные ссылки без вложенных якорей, «склад» по таблице UI-SPEC | ✓ VERIFIED | `movements.ts:416-439`; `page.tsx:130-210` (row container no href; null «склад» only in assigned/returned/transferred); feed test group green |
| 7 | Тайл/счётчик-ссылки ТОЛЬКО buildDevicesQuery с полным DeviceFilters | ✓ VERIFIED | `page.tsx:61-97`; grep `'"/devices?'` == 0 |
| 8 | Свежая БД: честные пустые состояния (лента + гарантия + нули) | ✓ VERIFIED | smoke-dashboard asserts «: 0» counters, «Нет техники с истекающей гарантией», «Перемещений пока нет» (verifier run, exit 0) |
| 9 | D-06: чистый server component — ноль новых островов, ноль кэша, нет loading.tsx | ✓ VERIFIED | `use client` in page.tsx == 0; `app/(app)/loading.tsx`/`error.tsx` absent; build shows `/` dynamic (ƒ) |
| 10 | metadata title «Дашборд» (не корневой «Учёт техники») | ✓ VERIFIED | `page.tsx:32-34`; smoke asserts «Дашборд» + active nav aria-current on / |
| 11 | Списанное учитывается нейтрально; «Списание» пилюля destructive-тинт; plural + truncate/title | ✓ VERIFIED (code) | `page.tsx:170-173,182-187,304-308` (truncate/shrink-0/title present); visual overflow → human #1 |
| 12 | Гарантийная граница инклюзивна (≤30 ∧ ≤60 / 61 вне / −1 истекла / NULL нигде) и делит код с фазой 5 | ✓ VERIFIED | WR-01: both consumers call `warrantyPredicate(w, today)` (`devices.ts:314-320,348`); frozen-MSK boundary tests green; live semantics → human #3 |
| 13 | Parity-пин автоматизирован (тайлы, статусы, пресеты == total фильтра через публичный API) | ✓ VERIFIED | `tests/dashboard-queries.test.ts:112-185` parity group — 5 tests, green |
| 14 | Ноль в пресете → «: 0» кликабельно; пустой топ-5 → честная копия (в т.ч. при «Истекла: K > 0») | ✓ VERIFIED | Counters always rendered (`page.tsx:343-356`); empty copy truthful by construction (top-5 = w60-alive only); smoke asserts on fresh DB |
| 15 | Топ-5 = гарантия до ASC + id-tiebreaker, только w60-живые; порядок счётчиков 30 → 60 → истекла | ✓ VERIFIED | `devices.ts:337-360` orderBy(asc(warrantyUntil), asc(id)) + w60 where; tests: ordering/tiebreaker/exclusion/limit; locked order `page.tsx:103-110` |
| 16 | displayTodayUtc() один раз за рендер, делится счётчиками и WarrantyDate | ✓ VERIFIED | `page.tsx:263` single call; `today` passed to warrantyPresetCounts/nearestExpiringWarranties/WarrantyDate (`page.tsx:281-282,240-244`) |
| 17 | Лента зафиксирована тестами (tie, лимит 10 на 12, null-слоты, fromId/toId, 7 лейблов + raw-fallback) | ✓ VERIFIED | Feed group `tests/dashboard-queries.test.ts:308-409` — 5 tests green |
| 18 | Периметр доказан на production build (307 без cookie / 200 с маркерами и deep-link семействами) | ✓ VERIFIED | `npm run build` + `node scripts/smoke-dashboard.mjs` exit 0 (verifier run); step-8 rewrite in smoke-devices also green |
| 19 | Топ-5 строка: «гар. до » префикс страницы + WarrantyDate variant="card" (warn-only по построению), саб-хедер 14/600 | ✓ VERIFIED (code) | `page.tsx:220-251,357-361`; green-in-window impossible (query admits w60-alive only, test-pinned); paint → human #1 |

**Score:** 19/19 truths verified (0 present, behavior-unverified)

### Deferred Items

None — Phase 6 is the final phase of the milestone; no later phase exists to defer to (Step 9b checked via roadmap: phases 01-06 only, all executed).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `db/queries/devices.ts` | 5 exported aggregates co-located with predicates (D-04) | ✓ VERIFIED | deviceCountByType/deviceCountByStatus (GROUP BY), totalDeviceCount, warrantyPresetCounts, nearestExpiringWarranties — all at `devices.ts:267-360`, beside warrantyPredicate (:194); substantive, wired (imported by page + tests) |
| `db/queries/movements.ts` | listRecentMovements + RecentMovementView with ids in SELECT | ✓ VERIFIED | `movements.ts:416-439` — single 3-way join, orderBy + tiebreaker, limit; wired by page + tests |
| `app/(app)/page.tsx` | Full dashboard rewrite: tiles + warranty block + feed, metadata, requireSession | ✓ VERIFIED | 403 lines, no stub markers; data flows from real DB queries (Level 4: FLOWING — parity fixtures 1/3/1 prove real data; fresh-DB zeros smoke-proven) |
| `app/(app)/nav.tsx` | «Дашборд» first NAV_ITEMS item, active rule intact | ✓ VERIFIED | `{ href: '/', label: 'Дашборд' }` first; exact-match active rule untouched |
| `scripts/smoke-devices.mjs` | Step 8 rewritten (header, assert block, summary) | ✓ VERIFIED | Step 6 in current numbering asserts 200 + «Дашборд» + `/devices?type=laptop` + «Всего:» + empty feed; old root-redirect needle gone (remaining 307s are perimeter checks); exit 0 (verifier run) |
| `tests/dashboard-queries.test.ts` | Wave-0: parity, TZ-boundary, zero-default, feed (>= 8 cases) | ✓ VERIFIED | 4 describes / 17 tests; all green in verifier run; uses listDevices (13 refs), vi.setSystemTime frozen MSK, real custody-action fixtures |
| `scripts/smoke-dashboard.mjs` | :31xx port, perimeter + render + deep-link families + fresh-DB zeros | ✓ VERIFIED | Port 3119; asserts all three counter labels, «Ближайшие сроки», `?type=`/`?status=`/`?warranty=w30|w60|expired`, «: 0», empty feed; exit 0 twice per executor, exit 0 in verifier run |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `page.tsx` | `buildDevicesQuery` | imports + 3 href helpers (type/status/warranty), full DeviceFilters objects | ✓ WIRED | query string never hand-built (negative grep 0) |
| `page.tsx` | `DEVICE_TYPES` + `TYPE_ITEMS` | keystone iteration + TYPE_TILE_LABELS Map (WR-02 single source, c572e47) | ✓ WIRED | byte-exact labels by construction; `DEVICE_STATUS_KEYS` import unused (IN-01, Info — STATUS_TILE_ORDER holds the same 4 keys) |
| feed rows | `RecentMovementView.fromId/toId` | ids in SELECT make names links (`page.tsx:133-146,195`) | ✓ WIRED | id presence test-pinned |
| smoke-devices step 8 | page.tsx rewrite | same commit e02b059 | ✓ WIRED | both green in verifier run |
| `warrantyPresetCounts`/`nearestExpiringWarranties` | `warrantyPredicate` | direct composition `warrantyPredicate(w, today)` / `warrantyPredicate('w60', today)` (a8c2bf7) | ✓ WIRED | parity by construction + parity tests |
| counter rows | phase-5 presets | `warrantyCounterHref` via buildDevicesQuery (`page.tsx:88-97`) | ✓ WIRED | smoke asserts all three hrefs |
| top-5 dates | `WarrantyDate today={today} variant="card"` | same once-per-render Date as counters (`page.tsx:240-244`) | ✓ WIRED | fourth consumer of the single warranty math |
| tests | `db/queries/devices.ts` | parity group asserts counters == listDevices totals | ✓ WIRED | drift fails loudly (green now) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `page.tsx` tiles | countByType/countByStatus/total | GROUP BY + count() over devices table | Yes — parity-pinned against seeded fixtures (buckets 1/3/1) | ✓ FLOWING |
| `page.tsx` warranty block | warranty/nearest | warrantyPredicate-composed count()/select over devices | Yes — TZ-group fixtures with absolute dates | ✓ FLOWING |
| `page.tsx` feed | feed | 3-way join over movements+devices+employees | Yes — custody-action fixtures, tie/limit/null-slot assertions | ✓ FLOWING |
| Fresh-install path | all | same queries on empty DB | Yes — honest zeros/empty states smoke-asserted | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Dashboard query contract (parity/TZ/zero-default/feed) | `npx vitest run tests/dashboard-queries.test.ts` | 17 passed (17) | ✓ PASS |
| Full suite baseline | `npx vitest run` | 19 files / 295 tests passed | ✓ PASS |
| Production compile | `npm run build` | green; `/` dynamic (ƒ) | ✓ PASS |
| Dashboard perimeter/render/deep-links | `node scripts/smoke-dashboard.mjs` | SMOKE OK…, exit 0 | ✓ PASS |
| Registry smoke incl. root dashboard step | `node scripts/smoke-devices.mjs` | SMOKE OK…, exit 0 | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| `scripts/smoke-dashboard.mjs` | `bash`-equivalent `node scripts/smoke-dashboard.mjs` after `npm run build` (verifier's own process) | exit 0 — 307 /login perimeter; 200 + «Дашборд» + nav + «Всего:» + 3 counter labels + sub-header + feed header; ?type/?status/?warranty deep-link families; fresh-DB zeros + empty feed | PASS |
| `scripts/smoke-devices.mjs` | `node scripts/smoke-devices.mjs` (verifier's own process) | exit 0 — perimeter + dashboard root step + filters/card/404 matrix | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DASH-01 | 06-01, 06-02 | User sees dashboard with device counts by type and status | ✓ SATISFIED | Truths 1/4/5/7/13; parity tests + smoke; REQUIREMENTS.md maps DASH-01 → Phase 6 |
| DASH-02 | 06-02 | Dashboard shows list of devices with expiring/expired warranty | ✓ SATISFIED | Truths 2/12/14/15/16/19; warranty block + top-5 + preset links, boundary test-pinned |
| DASH-03 | 06-01 | Dashboard shows recent movements feed | ✓ SATISFIED | Truths 3/6/17; feed tests + segmented links |

All three phase requirement IDs from REQUIREMENTS.md appear in PLAN frontmatter (`requirements:`) — union {DASH-01, DASH-02, DASH-03} exactly matches; **no orphaned requirements**.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/(app)/page.tsx` | 22 | Unused import `DEVICE_STATUS_KEYS` (review IN-01, deliberately out of fix scope) | ℹ️ Info | Pre-existing eslint warning, 0 errors; zero-default for statuses runs over STATUS_TILE_ORDER (same 4 keys) and is test-pinned |
| `app/(app)/page.tsx` | 152 | `return null` in routeSegments | ℹ️ Info | Legitimate route-table "no route" case (received/from_repair/disposed); flows to conditional render — not a stub |

No TBD/FIXME/XXX/debt markers in any phase-modified file; no new client islands; no loading/error boundaries added.

**Out-of-scope product-code change (transparency note, not a gap):** commit bbffb92 changed `db/queries/attachments.ts` (phase-4 code) — `deleteAttachment` now uses sync unlink to ROOT-FIX a pre-existing flaky test (D-05 determinism). The D-05 contract test documents the behavior and the full suite is green (295/295 in this verification; executor reports twice consecutively).

**Review-fix verification (06-REVIEW-FIX):** both Warning findings confirmed fixed in code, not just narrated — WR-01: `warrantyPredicate(w, today)` composed at `devices.ts:314-320` and `:348` (commit a8c2bf7); WR-02: `TYPE_ITEMS` in `query-params.ts:47-52`, consumed by both filter island and `TYPE_TILE_LABELS` (commit c572e47). `tsc --noEmit` clean per fix report; build green in verifier run.

## Human Verification Required

See the four structured items in frontmatter `human_verification:`:

1. **Visual hierarchy + overflow backstops** — tiles grid, blocks layout, truncate/title behavior per 06-UI-SPEC (both SUMMARYs hold this out deliberately).
2. **Deep-link click-through** — tile/counter/feed clicks land on the right pre-filtered views; counter click → list with the same count (the plan's own seeded-DB manual probe).
3. **WR-01 semantic confirmation on live data** — fixer-flagged logic-adjacent SQL boundary change; inclusive 30/60/expired semantics + warn-orange-only top-5.
4. **Judgment-tier prohibition sign-off** — three prohibition statements (no parallel predicate implementation; no falsified feed history; no second warranty math) — code-level verdicts RESOLVED, human review recommended (autonomous routing per ADR-550 D4).

### Gaps Summary

No gaps. All 19 consolidated must-haves verified: every behavior-dependent invariant (parity, inclusive TZ boundary, tie ordering, limit, zero-default, null slots) is exercised by passing tests; the perimeter and render path are proven on a production build by both smoke probes in the verifier's own process. The status is `human_needed` solely because of the deliberately held-out visual/navigation surface and the flagged WR-01 semantic confirmation — the items the executor itself reserved for end-of-phase validation.

---

_Verified: 2026-09-14T08:59:15Z_
_Verifier: ZCode (gsd-verifier)_
