---
phase: 15-lightbox
reviewed: 2026-10-01T07:44:20Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - app/(app)/(card)/devices/[id]/photo-grid.tsx
  - components/zoom-stage.tsx
  - lib/zoom.ts
  - tests/zoom-math.test.ts
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-10-01T07:44:20Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the Phase 15 lightbox slice: gesture math (`lib/zoom.ts`), the zoom stage (`components/zoom-stage.tsx`), the photo grid with upload/delete/lightbox (`app/(app)/(card)/devices/[id]/photo-grid.tsx`), and the math test suite (`tests/zoom-math.test.ts`).

Verification performed beyond reading: all 15 zoom-math assertions hand-checked against the formulas; cross-checked client calls against the actual server routes (`app/api/devices/[id]/photos/route.ts`, `app/api/attachments/[attachmentId]/route.ts` — FormData field `file`, mandatory `?device=`, `variant=thumb|full` all match); verified `components/ui/dialog.tsx` forwards `onKeyDown`/`showCloseButton` and that Base UI's `FloatingFocusManager` traps focus so the ←/→ handler survives clicks on the non-focusable stage; confirmed session cookie is `sameSite: 'lax'` (cross-site form-POST upload CSRF blocked); confirmed `ZoomStage` and `lib/zoom` have no other consumers. Tooling: `npx tsc --noEmit` clean, `npx eslint` clean on all four files, `npx vitest run` 530/530 green.

The core is sound: the zoom math is correct (clamped scale before translate recompute, per-axis overflow clamping pins no-overflow axes to 0), the pointer state machine handles pinch→pan re-anchoring and the iOS pointercancel/lostpointercapture guards per the plan truths, and key-remount gives a constructive zoom reset. One Warning: the broken-image backstop truth documented in both plans is contradicted by the implementation — a failed full-image load leaves a permanently blank stage instead of the visible alt. No Critical issues found.

## Warnings

### WR-01: Broken full image renders a permanently blank stage — contradicts the plan's backstop truth (alt stays invisible)

**File:** `components/zoom-stage.tsx:327-339`

**Issue:** The `<img>` is gated by `opacity-0` until `onLoad` fires (`loaded` state, lines 69, 332, 336-338). There is no `onError` path. When the full variant fails (404, network error, session expiry mid-view), `loaded` stays `false`, so the image — including its `alt` text — remains at `opacity: 0` forever: the user sees an empty muted gray box with no error surface and no recovery except closing the lightbox. This contradicts the backstop truth stated in both `15-01-PLAN.md` and `15-02-PLAN.md`: «Сломанный `<img>` (сеть/404) оставляет alt «Фото n из m» на приглушённом стейдже без коллапса раскладки» — the alt is technically rendered but invisible under `opacity-0`, so the documented fallback does not hold.

**Fix:**
```tsx
const [failed, setFailed] = useState(false)
// ...
<img
  ref={imgRef}
  src={src}
  alt={alt}
  draggable={false}
  onLoad={() => setLoaded(true)}
  onError={() => setFailed(true)}
  // ...
  className={`... ${loaded || failed ? 'opacity-100' : 'opacity-0'}`}
/>
```
With `failed → opacity-100` the broken image collapses to the browser's alt rendering on the muted stage — exactly the plan's stated backstop (alt visible, layout intact, no new error copy). Reset is already constructive via the `key={photo.id}` remount.

## Info

### IN-01: `offsetFromCenter` helper duplicated inline in the wheel handler

**File:** `components/zoom-stage.tsx:124-126` (vs. helper at `39-48`)

**Issue:** The module-scope helper `offsetFromCenter(clientX, clientY, rect)` exists precisely to express "cursor offset from stage center", but the wheel effect re-implements the identical arithmetic inline. Two copies of the anchor-point formula risk drifting apart if the origin model ever changes (the module comment declares the math must live in exactly one place).

**Fix:** Inside `onWheel`, replace the inline object with `offsetFromCenter(e.clientX, e.clientY, rect)`.

### IN-02: `bitmap.close()` skipped on failure — bitmap leak on the error path

**File:** `app/(app)/(card)/devices/[id]/photo-grid.tsx:45-60`

**Issue:** In `resizeToJpeg`, `bitmap.close()` (line 52) runs only on the success path between `drawImage` and `toBlob`. If `canvas.getContext('2d')` returns `null` (the `!` assertion at line 51 produces a bare `TypeError`) or `drawImage` throws, the `ImageBitmap` is never closed and the caller's `catch` maps the raw TypeError onto the generic upload copy. Functionally contained, but a resource leak plus an opaque failure shape.

**Fix:**
```ts
const bitmap = await createImageBitmap(file)
try {
  // ... scale/canvas/drawImage
} finally {
  bitmap.close()
}
const ctx = canvas.getContext('2d')
if (!ctx) throw new Error('2d context unavailable')
```

### IN-03: Test gap — `zoomAtPoint` has no zoom-out case (k < 1)

**File:** `tests/zoom-math.test.ts:33-58`

**Issue:** `zoomAtPoint` is pinned for identity (k=1) and zoom-in (s=1→2, s=2→4), but zoom-out — the most frequent wheel direction once zoomed and the path that composes with the `MIN_SCALE` clamp — has no assertion. A sign or k-inversion regression in the zoom-out direction would pass the suite.

**Fix:** Add a case, e.g. `zoomAtPoint({ scale: 2, tx: -50, ty: 0 }, 1, { x: 60, y: 0 })` → `tx = (1 − 0.5)·60 + 0.5·(−50) = 5`, `ty = 0`.

### IN-04: >2-pointer pinch applies a stale basis when the first-inserted finger lifts — zoom jump

**File:** `components/zoom-stage.tsx:174-176`, `209-235`, `289-300`

**Issue:** With three active pointers, the basis is computed from the first two cached points, and `onPointerMove` always reads `values().slice(0, 2)`. If the first-inserted finger of the pair lifts while two remain, `onPointerUp` matches neither re-anchor branch (`size === 0` nor `size === 1`), so `pinchRef` keeps `dist0` of the old pair while moves now measure the new pair — `scale0 · dist(new)/dist0(old)` can jump visibly. The plan truths cover only pinch→pan and pan→pinch transitions, so this is beyond-plan robustness, not a plan violation; sloppy three-finger contact on a phone makes it reachable.

**Fix:** Re-anchor the basis from the current pair whenever pointer membership changes while ≥ 2 pointers remain (e.g., in the `size >= 2` path of `onPointerUp`, recompute `pinchRef` from the remaining two points with `scale0` taken from the last committed `zoom.scale`).

---

_Reviewed: 2026-10-01T07:44:20Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
