// Zoom math for the device-photo lightbox (PHOTO-01, D-02/D-04; formula —
// 15-RESEARCH Pattern 1). Pure named exports over Math only — same convention
// as lib/inventory-increment.ts: no framework imports, no side effects, safe
// to import from client components and vitest alike. ONE source for BOTH
// consumers: ZoomStage recomputes {scale, tx, ty} through these helpers on
// every gesture, and tests/zoom-math.test.ts pins the formulas the component
// depends on.
//
// Transform model (origin center, Jake Archibald — scale applied after
// translate keeps the offset in screen pixels): an element point q projects
// to center + s·(q − center) + t. Keeping the point under the cursor fixed
// while s → s' gives t' = (1 − k)·p + k·t, where k = s'/s and p is the cursor
// offset from the stage center. Scale is clamped BEFORE the translate
// recompute (Pitfall 8 — no boundary jump) and offsets are clamped after: an
// axis whose scaled size overflows the stage is limited to
// |t| ≤ (scaled − stage)/2, an axis without overflow pins to 0 — the photo
// stays centered and no pan exists at 1x.

export const MIN_SCALE = 1
export const MAX_SCALE = 4
export const WHEEL_STEP = 0.0015
export const DOUBLE_CLICK_SCALE = 2.5
export const WHEEL_LINE_HEIGHT_PX = 16
export const DBL_TAP_WINDOW_MS = 300
export const DRAG_THRESHOLD_PX = 5

export type ZoomState = { scale: number; tx: number; ty: number }

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function zoomAtPoint(
  state: ZoomState,
  nextScale: number,
  p: { x: number; y: number },
): ZoomState {
  const k = nextScale / state.scale
  return {
    scale: nextScale,
    tx: (1 - k) * p.x + k * state.tx,
    ty: (1 - k) * p.y + k * state.ty,
  }
}

export function clampOffset(
  tx: number,
  ty: number,
  scale: number,
  imgW: number,
  imgH: number,
  stageW: number,
  stageH: number,
): { tx: number; ty: number } {
  const limitX = (imgW * scale - stageW) / 2
  const limitY = (imgH * scale - stageH) / 2
  return {
    tx: limitX > 0 ? clamp(tx, -limitX, limitX) : 0,
    ty: limitY > 0 ? clamp(ty, -limitY, limitY) : 0,
  }
}

export function normalizeWheelDelta(
  deltaY: number,
  deltaMode: number,
  viewportHeight: number,
): number {
  if (deltaMode === 1) return deltaY * WHEEL_LINE_HEIGHT_PX
  if (deltaMode === 2) return deltaY * viewportHeight
  return deltaY
}

export function wheelScale(scale: number, deltaYpx: number): number {
  return clamp(scale * Math.exp(-deltaYpx * WHEEL_STEP), MIN_SCALE, MAX_SCALE)
}

export function doubleClickTargetScale(scale: number): number {
  return scale > MIN_SCALE ? MIN_SCALE : DOUBLE_CLICK_SCALE
}
