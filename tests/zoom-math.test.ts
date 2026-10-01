import { describe, expect, it } from 'vitest'
import {
  clamp,
  clampOffset,
  doubleClickTargetScale,
  normalizeWheelDelta,
  wheelScale,
  zoomAtPoint,
  DBL_TAP_WINDOW_MS,
  DRAG_THRESHOLD_PX,
  DOUBLE_CLICK_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  WHEEL_LINE_HEIGHT_PX,
  WHEEL_STEP,
} from '@/lib/zoom'

// Phase 15 matrix (PHOTO-01, SC 2/3): the zoom math ZoomStage recomputes on
// every gesture, pinned here as the single pure source (lib/zoom.ts, D-02/D-04).
// Formula (15-RESEARCH Pattern 1, origin center): a point q projects to
// center + s·(q − center) + t; keeping the point under the cursor fixed while
// s → s' gives t' = (1 − k)·p + k·t with k = s'/s and p the cursor offset from
// the stage center. Scale is clamped BEFORE the translate recompute (Pitfall
// 8) and offsets after — an axis without overflow pins to 0 (no pan at 1x).
describe('clamp', () => {
  it('clamps with inclusive boundaries [1, 4] (SC 2 zoom range)', () => {
    expect(clamp(5, 1, 4)).toBe(4)
    expect(clamp(0.5, 1, 4)).toBe(1)
    expect(clamp(2.5, 1, 4)).toBe(2.5)
  })
})

describe('zoomAtPoint', () => {
  it('is the identity when the scale does not change (k = 1)', () => {
    const state = { scale: 2, tx: -30, ty: 10 }
    const next = zoomAtPoint(state, 2, { x: 100, y: 50 })
    expect(next.scale).toBe(2)
    expect(next.tx).toBe(-30)
    expect(next.ty).toBe(10)
  })

  it('shifts translate so the point under the cursor stays put (s=1→2)', () => {
    const next = zoomAtPoint({ scale: 1, tx: 0, ty: 0 }, 2, { x: 100, y: 0 })
    expect(next.scale).toBe(2)
    expect(next.tx).toBe(-100)
    expect(next.ty).toBe(0)
  })

  it('composes over an existing offset (s=2→4, k=2)', () => {
    // tx = (1−2)·60 + 2·(−50) = −160; ty = (1−2)·40 + 2·(−20) = −80.
    const next = zoomAtPoint({ scale: 2, tx: -50, ty: -20 }, 4, {
      x: 60,
      y: 40,
    })
    expect(next.tx).toBe(-160)
    expect(next.ty).toBe(-80)
  })
})

describe('clampOffset', () => {
  it('limits each axis to (scaled − stage)/2 when the scaled image overflows', () => {
    // 1600×1200 at scale 2 in an 800×600 stage: |tx| ≤ 1200, |ty| ≤ 900.
    expect(clampOffset(1500, 0, 2, 1600, 1200, 800, 600)).toEqual({
      tx: 1200,
      ty: 0,
    })
    expect(clampOffset(-1500, 100, 2, 1600, 1200, 800, 600)).toEqual({
      tx: -1200,
      ty: 100,
    })
  })

  it('pins an axis without overflow to 0 — the photo stays centered (no pan at 1x)', () => {
    // 600×1200 portrait at scale 1 in an 800×600 stage: x underflows → 0.
    expect(clampOffset(-42, 250, 1, 600, 1200, 800, 600)).toEqual({
      tx: 0,
      ty: 250,
    })
    expect(clampOffset(99, 0, 1, 600, 1200, 800, 600)).toEqual({
      tx: 0,
      ty: 0,
    })
  })
})

describe('normalizeWheelDelta', () => {
  it('passes pixel deltas through (deltaMode 0)', () => {
    expect(normalizeWheelDelta(5, 0, 900)).toBe(5)
  })

  it('converts line deltas ×16 px (Firefox — Pitfall 7)', () => {
    expect(normalizeWheelDelta(3, 1, 900)).toBe(48)
  })

  it('converts page deltas × viewport height', () => {
    expect(normalizeWheelDelta(2, 2, 800)).toBe(1600)
  })
})

describe('wheelScale', () => {
  it('applies the exponential step (2·e^0.15) — uniform trackpad/mouse feel', () => {
    expect(wheelScale(2, -100)).toBeCloseTo(2 * Math.exp(0.15), 6)
  })

  it('clamps to MAX_SCALE before translate recompute (Pitfall 8 — no boundary jump)', () => {
    expect(wheelScale(3.9, -500)).toBe(4)
  })

  it('clamps to MIN_SCALE — zoom never dips below 1x', () => {
    expect(wheelScale(1.05, 100)).toBe(1)
  })
})

describe('doubleClickTargetScale', () => {
  it('toggles 1 → 2.5 (mid-range multiplier, D-02 discretion)', () => {
    expect(doubleClickTargetScale(1)).toBe(2.5)
  })

  it('toggles any zoomed state back to 1 (D-02)', () => {
    expect(doubleClickTargetScale(2.5)).toBe(1)
    expect(doubleClickTargetScale(3.9)).toBe(1)
  })
})

describe('constants', () => {
  it('exports the shared tuning values — ONE source for the component and Wave 2', () => {
    expect(MIN_SCALE).toBe(1)
    expect(MAX_SCALE).toBe(4)
    expect(WHEEL_STEP).toBe(0.0015)
    expect(DOUBLE_CLICK_SCALE).toBe(2.5)
    expect(WHEEL_LINE_HEIGHT_PX).toBe(16)
    expect(DBL_TAP_WINDOW_MS).toBe(300)
    expect(DRAG_THRESHOLD_PX).toBe(5)
  })
})
