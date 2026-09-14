---
status: resolved
trigger: "UAT Test 1: «поле поиска в целом работает если вводить и удалять символы по одному с паузами. Если вводить символы или удалять их быстро то поле ведет себя странно, и либо не прописывает то что я пишу, либо не удаляет»"
created: 2026-09-05T00:00:00+03:00
updated: 2026-09-05T00:40:00+03:00
---

## Current Focus

hypothesis: CONFIRMED — The CR-01 adoption effect misclassifies the island's OWN pending push as an external q change. `lastSynced.current = value` is written at debounce-ARM time (search-box.tsx:57, outside the setTimeout callback), while the `q` prop still holds the pre-typing value until the server echo lands. For the whole arm→echo window (≥300ms by design, network-independent) every further local keystroke satisfies `q !== lastSynced.current`, so the effect takes the adopt branch (search-box.tsx:47-51) and `setValue(q)` clobbers the user's newer input with stale server `q`. Cleanup (lines 66-73) had already cleared the pending timer and the adopt branch `return`s before re-arming — so the newer text is never even pushed.
test: Event-driven simulation of the exact effect semantics (React effect order: previous-run cleanup → body; deps [value,q,current,router], current/router stable during typing) for fast/slow typing and fast deletion.
expecting: Fast sequences show ADOPT firing on keystroke 2 reverting value; slow sequences show q===lastSynced at every keystroke (echo lands between keys) → no adopt.
next_action: DONE — root cause confirmed, diagnosis returned (find_root_cause_only; no fix applied per mode).

### Structured Reasoning Checkpoint

```yaml
reasoning_checkpoint:
  hypothesis: >
    Adopt-branch misfire: `q !== lastSynced.current` is true during the arm→echo
    window because lastSynced.current is pre-written with the local value at arm
    time (line 57) while q prop is stale; the effect reads this difference as
    "external navigation" and setValue(q) clobbers the user's pending keystrokes.
  confirming_evidence:
    - "search-box.tsx:57 — lastSynced.current = value executes at ARM time, not at push/echo time (comment on 56-58 says the intent was echo absorption; the side effect is a guaranteed q≠lastSynced window)"
    - "Simulation scenario A: fast 'ab' — ADOPT fires on keystroke 2, final input='' ; NO navigation ever occurs (timer cleared, adopt returns early) ⇒ failure is network-independent"
    - "Simulation scenario C: fast delete from 'abc' — input reverts to 'abc' (deletion undone)"
    - "Simulation scenario B: slow typing — q===lastSynced at every keystroke (echo lands between keys) ⇒ no adopt ⇒ works, exactly matching the report"
    - "UAT Test 2 passes: reset/Back/Forward arrive when value===lastSynced (no pending local edits) ⇒ adopt fires correctly for genuinely external changes — the branch is right for the case it was built for and wrong exactly when local edits are pending"
  falsification_test: >
    If the clobber required the server echo to land (broken only while a
    navigation is in flight, intact when typing faster than the debounce but
    with no push fired yet), the arm-time mechanism would be wrong. Scenario A
    disproves that: clobber at keystroke 2 with zero pushes. Further
    falsifier: moving `lastSynced.current = value` inside the setTimeout
    callback (or gating adopt on value===lastSynced) removes the failure in
    simulation — if the real bug survived that, hypothesis would be wrong.
  fix_rationale: >
    (direction only — find_root_cause_only mode, no fix applied) Restore the
    invariant 'local pending edits win over URL': adopt q ONLY when the local
    input is clean (value === lastSynced.current) and q differs — i.e. check
    local-pending BEFORE the adopt branch. Preserves CR-01 behaviors (reset/
    Back/Forward adopt; trimmed echo adopts because value===lastSynced then),
    un-breaks fast typing (value!==lastSynced ⇒ skip adopt, re-arm debounce).
  blind_spots: >
    No browser repro run (logical repro permitted by constraints; vitest
    cannot render islands). React effect-order semantics assumed standard
    (cleanup-before-next-run, post-render run) — same semantics the research
    Pattern 3 relies on. Concurrent-reset-vs-typing resolution after the
    suggested reorder (local wins) is a product call for planning to confirm.
  candidate_causes:
    - "code (CONFIRMED, sufficient): search-box.tsx:47-57 adopt guard + arm-time lastSynced write"
    - "environment (RULED OUT as necessary): network latency only widens the window; failure reproduces with instant echo and with no navigation at all"
    - "config: 300ms is a code constant; resizing it changes window width, not the defect"
    - "data: none — input-content-independent (trim affects only the echo path, query-params.ts:61)"
  and_gate: >
    no — a single code defect suffices; the trigger (second keystroke within
    the arm→echo window) is guaranteed reachable because the window is ≥300ms
    by design. No second contributing condition required.
```

bug_class: Bohrbug (deterministic — reproduces on any fast sequence, any environment).
SBFL (Phase 1.25): SKIPPED with note — no runnable failing test exists for islands (repo has no component-test harness; vitest is node-env DB-only).
Knowledge base (Phase 0): MemPalace absent in this session; `.planning/debug/knowledge-base.md` does not exist (debug dir was empty) — no prior-pattern candidate.

## Symptoms

expected: Быстрый ввод/удаление символов в поиске не теряет keystrokes: инпут не откатывается к старому q из серверного эха, пока летит навигация. Медленный ввод с паузами работает корректно.
actual: «поле поиска в целом работает если вводить и удалять символы по одному с паузами. Если вводить символы или удалять их быстро то поле ведет себя странно, и либо не прописывает то что я пишу, либо не удаляет»
errors: None reported (visual/behavioral only).
reproduction: UAT Test 1 — type or delete characters FAST in the /devices search box; each rapid keystroke sequence loses characters or reverts deletions.
started: Discovered during Phase 5 UAT (2026-09-05). Related history: CR-01 fix (commit be80413) added a `lastSynced` ref to search-box.tsx (reset/Back/Forward reconciliation — PASSED UAT Test 2).

## Eliminated

- hypothesis: "Clobber happens only while a navigation is IN FLIGHT (echo lands over newer input) — the prompt's working hypothesis"
  evidence: "Simulation scenario A: fast 'a','b' at 80ms — ADOPT clobber at keystroke 2 BEFORE any timer fire; no PUSH ever occurs. The window opens at ARM time (first unsynced keystroke), not at navigation start. In-flight (scenario D) is a sub-case of the same window, not its cause."
  timestamp: 2026-09-05T00:35:00+03:00
- hypothesis: "Effect cleanup loses the debounce timer / never re-arms (leaked-timer class)"
  evidence: "Cleanup (search-box.tsx:66-73) is correct and necessary; the reason no new timer is armed after the clobber is the adopt branch `return`ing early (line 50). Without the adopt branch (research Pattern 3 shape, 05-RESEARCH.md:305-313) the timer re-arms on every keystroke and fast typing pushes correctly."
  timestamp: 2026-09-05T00:36:00+03:00
- hypothesis: "Next 16 startTransition / RSC re-render fights the controlled input with stale props"
  evidence: "Failure occurs with zero navigations (scenario A) — no server render, no prop change involved. Pure client-side effect logic."
  timestamp: 2026-09-05T00:36:00+03:00
- hypothesis: "IME/composition (Cyrillic input) or type=\"search\" native-clear artifacts"
  evidence: "Mechanism is input-content-agnostic and reproduces in simulation with plain ASCII; slow typing of the same characters works (scenario B)."
  timestamp: 2026-09-05T00:37:00+03:00

## Evidence

- timestamp: 2026-09-05T00:05:00+03:00
  checked: app/(app)/devices/search-box.tsx:38-74 (reconciliation effect)
  found: Effect order is (1) mount guard, (2) adopt-if `q !== lastSynced.current` → setValue(q), (3) no-op if value===q, (4) else arm 300ms push and set `lastSynced.current = value` at ARM time (line 57), before the timer fires.
  implication: Between arm time and server-echo landing, lastSynced.current (local value) intentionally differs from q prop (stale) — exactly the condition the adopt branch treats as "external change". Candidate root cause window.
- timestamp: 2026-09-05T00:10:00+03:00
  checked: app/(app)/devices/query-params.ts:61,96; app/(app)/devices/page.tsx:41; app/(app)/devices/filter-bar.tsx:26
  found: Server trims and caps q (`rawQ.trim().slice(0,100)`); page parses searchParams → filters; FilterBar feeds `<DeviceSearchBox q={filters.q} current={filters} />`. buildDevicesQuery omits q when ''.
  implication: q prop changes only via server echo (or hard Link nav); the island's only other q-shaping is its own push. Trim is why lastSynced was made to absorb echo diffs (CR-01).
- timestamp: 2026-09-05T00:15:00+03:00
  checked: .planning/phases/05-search-filters/05-RESEARCH.md:290-323 (Pattern 3) vs search-box.tsx
  found: Research Pattern 3 had NO lastSynced: guard was `if (value === q) return` then arm. That shape types correctly but mis-pushes on external q change (reset → re-push of stale value) — which is why CR-01 (be80413) added lastSynced.
  implication: The regression was introduced BY the CR-01 reconciliation: it fixed external-adoption and broke the pending-local-edit case.
- timestamp: 2026-09-05T00:20:00+03:00
  checked: .planning/phases/05-search-filters/05-UAT.md (G-5-1), .planning/STATE.md
  found: Test 1 issue = G-5-1 (severity major); Test 2 (reset/Back/Forward/trim-echo reconciliation) PASSED; UI-SPEC SearchBox contract (05-UI-SPEC.md:127) requires re-typing cancels pending timer and input keeps focus/value across the swap.
  implication: Adopt must keep working for external changes while never adopting over pending local edits — the two requirements the current branch order cannot satisfy simultaneously.
- timestamp: 2026-09-05T00:40:00+03:00
  checked: Event-driven simulation of exact effect semantics (node, no repo files written) — scenarios A-D
  found: |
    A. FAST "a","b" @80ms (nav=50ms): KEY a → ARM(lastSynced="a",q="") → KEY ab → cleanup clears timer → q("")!==lastSynced("a") → ADOPT value="" → FINAL input="" url-q="" (keystrokes lost, NO navigation ever fired).
    B. SLOW "a","b" @500ms: ARM → PUSH@300 → ECHO q="a"@350 → noop → KEY ab@500 → ARM → PUSH → ECHO → noop → FINAL "ab" (correct).
    C. FAST delete from "abc", Backspaces @0/80ms: ARM "ab"(lastSynced="ab") → Backspace → ADOPT value="abc" → FINAL input="abc" (deletion reverted, no push).
    D. KEY "b" @320ms during flight (push@300, nav=100ms): ADOPT value="" @320 → ECHO q="a"@400 → ADOPT value="a" → FINAL "a" (b lost; field visibly rolls back ""→"a").
  implication: All four reported behaviors («не прописывает», «не удаляет», откат, работает с паузами) derive from the one adopt-misfire mechanism. Window ≥300ms by design, grows with RTT.

## Resolution

root_cause: >
  In app/(app)/devices/search-box.tsx the CR-01 reconciliation effect (lines
  38-74) treats ANY difference between the q prop and the lastSynced ref as an
  external URL change and adopts it (lines 47-51: lastSynced.current = q;
  setValue(q)). But line 57 writes `lastSynced.current = value` at
  debounce-ARM time — before any navigation — so from the first unsynced
  keystroke until the server echo lands (a ≥300ms window plus RTT, and the
  whole in-flight period after commitNow line 83), `q !== lastSynced.current`
  is true BY THE COMPONENT'S OWN DOING. Every further keystroke in that window
  therefore hits the adopt branch: the pending timer was already cleared by the
  effect cleanup (66-73), the branch setValue()s the STALE server q over the
  user's newer input and returns without re-arming — typed characters vanish,
  deletions revert, and the newer text is never pushed at all. Slow typing
  escapes because each echo lands before the next keystroke (q===lastSynced at
  every run). UAT Test 2 passes because reset/Back/Forward arrive when
  value===lastSynced (no pending local edits), the one case the branch handles
  correctly. Introduced by the CR-01 fix (be80413): the original research
  Pattern-3 guard (`value === q`, 05-RESEARCH.md:305-313) typed correctly but
  mishandled external resets; lastSynced fixed that and broke pending local
  edits.
fix: "(NOT applied — find_root_cause_only) Suggested direction for gap-closure planning: enforce 'pending local edits win over URL' by checking local cleanliness BEFORE the adopt branch — adopt q only when value === lastSynced.current && q !== lastSynced.current; when value !== lastSynced.current (user typed past the anchor) never adopt — fall through to re-arm the debounce so the newer text still pushes. Apply the same to commitNow (line 83 context). This preserves every CR-01 behavior: reset/Back/Forward adopt (local is clean then), and the server's trimmed echo still adopts (after push 'abc ', value===lastSynced='abc ', echo q='abc' differs → adopt removes the space). Planning should confirm the one product edge this reorder creates: a user typing WHILE an external navigation (reset link) lands keeps their keystrokes (local wins) instead of being reset — consistent with the G-5-1 truth statement."
verification: "Logical reproduction per constraints (browser repro optional, not run): exact-effect-semantics event simulation reproduces all four reported behaviors (A-D) and shows the slow-typing control case clean; falsification probes (no-navigation scenario A; lastSynced-write-inside-timeout thought experiment) confirm mechanism. No automated island test exists (no component harness in repo) — regression risk for the fix must be closed in gap planning."
files_changed: []
