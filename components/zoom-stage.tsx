'use client'

/* eslint-disable @next/next/no-img-element -- same rationale as photo-grid:
   the photo is pre-sized at upload (1600px full) and served from an
   authorized route; next/image would re-fetch and re-process auth'd binaries
   per request for nothing (04-RESEARCH decision). */

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import {
  clamp,
  clampOffset,
  DBL_TAP_WINDOW_MS,
  doubleClickTargetScale,
  DRAG_THRESHOLD_PX,
  MAX_SCALE,
  MIN_SCALE,
  normalizeWheelDelta,
  wheelScale,
  zoomAtPoint,
} from '@/lib/zoom'

type ClientPoint = { x: number; y: number }

// Gesture-DETECTION geometry only. Zoom/pan MATH lives in lib/zoom.ts and is
// never duplicated here: the component composes {scale, tx, ty} exclusively
// through those helpers.
function distance(a: ClientPoint, b: ClientPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

// A client point as the `p` of zoomAtPoint: offset from the stage center
// (the transform origin — RESEARCH Pattern 1).
function offsetFromCenter(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): ClientPoint {
  return {
    x: clientX - rect.left - rect.width / 2,
    y: clientY - rect.top - rect.height / 2,
  }
}

// Phase 15 (D-01..D-04): the lightbox zoom stage — the FULL gesture contract
// (SC 2/3). The image lives on a CSS transform (translate + scale, origin
// center) manipulated directly — NO transition on transform, so zoom
// responds instantly (a reduced-motion-safe case by construction); the
// load-in fades opacity instead (200 ms over the muted stage fill, bg-black/5
// — the upload-tile family) once the full variant fires onLoad. Gestures are
// unified Pointer Events (MDN Pattern 3): drag-pan while zoomed, pinch to the
// moving midpoint, manual double-tap/click detection (D-02: a single tap is
// inert), and a full reset on pointercancel AND lostpointercapture so an
// aggressive iOS cancel never sticks (SC 3). Wheel zoom stays a native
// non-passive listener on the stage ONLY — over the overlay controls the
// wheel is inert (Default 5). Remount-by-key (photo.id at the call site) is
// the constructive reset path — no setState in effect bodies (repo eslint
// rule). Hand-rolled per D-04: no lightbox/zoom libraries — the Base UI
// Dialog keeps ESC/scroll-lock/focus-trap; this module owns only the stage.
export function ZoomStage({ src, alt }: { src: string; alt: string }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [zoom, setZoom] = useState({ scale: 1, tx: 0, ty: 0 })
  const [loaded, setLoaded] = useState(false)

  // Mutable gesture state — refs, never React state (only {scale, tx, ty}
  // and `loaded` render). pointers is the MDN pointer cache; panStart
  // anchors t = t0 + Δ; pinch keeps the basis {dist0, scale0} (the anchor is
  // the CURRENT midpoint each move — zoomAtPoint is recomposed per event);
  // down/lastTap drive the double-tap detector (two taps < 300 ms apart,
  // each with < 5 px of travel, at nearly the same spot — D-02).
  const pointersRef = useRef<Map<number, ClientPoint>>(new Map())
  const panStartRef = useRef<{
    clientX: number
    clientY: number
    tx0: number
    ty0: number
  } | null>(null)
  const pinchRef = useRef<{ dist0: number; scale0: number } | null>(null)
  const downRef = useRef<ClientPoint | null>(null)
  const lastTapRef = useRef<{ x: number; y: number; time: number } | null>(
    null,
  )

  // SC 3 (the iOS guard): cancel/capture-loss reset EVERYTHING — cache,
  // bases, pan start, pending tap — or the gesture sticks "pressed".
  const resetGesture = () => {
    pointersRef.current.clear()
    panStartRef.current = null
    pinchRef.current = null
    downRef.current = null
    lastTapRef.current = null
    const el = stageRef.current
    if (el) el.style.cursor = ''
  }

  // Wheel zoom to the cursor (SC 2). React 19 registers wheel passively on
  // the root — preventDefault inside an onWheel prop is a no-op that logs an
  // Intervention warning (Pitfall 1), so the ONLY correct interception is a
  // native non-passive listener on the stage element. The listener hangs on
  // the stage ONLY: over the overlay controls (close/«Удалить фото») the
  // wheel stays inert (Default 5). The recompute goes exclusively through
  // lib/zoom.ts helpers in one functional setState — scale clamped FIRST
  // (Pitfall 8), then zoom-to-point, then the offset clamp (an axis without
  // overflow pins to 0, so panning cannot exist at 1x).
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const dy = normalizeWheelDelta(e.deltaY, e.deltaMode, window.innerHeight)
      setZoom((prev) => {
        const nextScale = wheelScale(prev.scale, dy)
        const next = zoomAtPoint(
          prev,
          nextScale,
          {
            x: e.clientX - rect.left - rect.width / 2,
            y: e.clientY - rect.top - rect.height / 2,
          },
        )
        const img = imgRef.current
        const clamped = clampOffset(
          next.tx,
          next.ty,
          nextScale,
          img ? img.offsetWidth : 0,
          img ? img.offsetHeight : 0,
          rect.width,
          rect.height,
        )
        return { scale: nextScale, tx: clamped.tx, ty: clamped.ty }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = stageRef.current
    if (!el) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // Explicit capture for every pointer type (safe for mouse too — A6;
    // touches get implicit capture anyway): the gesture keeps receiving
    // events outside the element.
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      // pointer already inactive (rare race) — cache tracking below still
      // sees a coherent gesture
    }
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointersRef.current.size === 1) {
      downRef.current = { x: e.clientX, y: e.clientY }
      panStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        tx0: zoom.tx,
        ty0: zoom.ty,
      }
      return
    }
    // Second pointer: pinch basis over the two cached points. A pinch is
    // never a tap and pan is suspended (D-02 pending-tap reset).
    downRef.current = null
    panStartRef.current = null
    lastTapRef.current = null
    const [a, b] = Array.from(pointersRef.current.values())
    const dist0 = distance(a, b)
    if (dist0 > 0) pinchRef.current = { dist0, scale0: zoom.scale }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = stageRef.current
    const img = imgRef.current
    if (!el || !img || !pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const rect = el.getBoundingClientRect()
    const imgW = img.offsetWidth
    const imgH = img.offsetHeight

    if (pointersRef.current.size === 1 && panStartRef.current) {
      // Drag-pan (SC 2): t = t0 + Δ, only while zoomed — at 1x an axis
      // without overflow pins to 0, so there is nothing to pan (Pitfall 8).
      if (zoom.scale <= MIN_SCALE) return
      const start = panStartRef.current
      el.style.cursor = 'grabbing'
      setZoom((prev) => {
        const clamped = clampOffset(
          start.tx0 + (e.clientX - start.clientX),
          start.ty0 + (e.clientY - start.clientY),
          prev.scale,
          imgW,
          imgH,
          rect.width,
          rect.height,
        )
        return { scale: prev.scale, tx: clamped.tx, ty: clamped.ty }
      })
      return
    }

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      // Pinch (SC 2): s' = clamp(scale0 · dist/dist0, 1, 4) anchored at the
      // CURRENT midpoint — the point under the fingers stays under them;
      // guard dist > 0 (MDN prevDiff guard).
      const [a, b] = Array.from(pointersRef.current.values()).slice(0, 2)
      const dist = distance(a, b)
      const basis = pinchRef.current
      if (dist <= 0) return
      const nextScale = clamp(
        (basis.scale0 * dist) / basis.dist0,
        MIN_SCALE,
        MAX_SCALE,
      )
      const mid = offsetFromCenter((a.x + b.x) / 2, (a.y + b.y) / 2, rect)
      setZoom((prev) => {
        const next = zoomAtPoint(prev, nextScale, mid)
        const clamped = clampOffset(
          next.tx,
          next.ty,
          nextScale,
          imgW,
          imgH,
          rect.width,
          rect.height,
        )
        return { scale: nextScale, tx: clamped.tx, ty: clamped.ty }
      })
    }
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = stageRef.current
    if (!el) return
    const wasPinching = pointersRef.current.size >= 2
    pointersRef.current.delete(e.pointerId)
    el.style.cursor = ''

    if (pointersRef.current.size === 0) {
      // Gesture fully over. Tap detection (D-02) runs only for
      // single-pointer sessions — a pinch never classifies as a tap.
      const down = downRef.current
      if (!wasPinching && down) {
        const moved = distance({ x: e.clientX, y: e.clientY }, down)
        if (moved < DRAG_THRESHOLD_PX) {
          const last = lastTapRef.current
          const now = e.timeStamp
          if (
            last &&
            now - last.time < DBL_TAP_WINDOW_MS &&
            distance({ x: e.clientX, y: e.clientY }, last) < DRAG_THRESHOLD_PX
          ) {
            // Double tap/click: toggle 1 → 2.5 → 1 toward the tap point
            // (D-02). lastTap clears so a third tap starts a fresh cycle.
            lastTapRef.current = null
            const rect = el.getBoundingClientRect()
            const img = imgRef.current
            const p = offsetFromCenter(e.clientX, e.clientY, rect)
            setZoom((prev) => {
              const target = doubleClickTargetScale(prev.scale)
              const next = zoomAtPoint(prev, target, p)
              const clamped = clampOffset(
                next.tx,
                next.ty,
                target,
                img ? img.offsetWidth : 0,
                img ? img.offsetHeight : 0,
                rect.width,
                rect.height,
              )
              return { scale: target, tx: clamped.tx, ty: clamped.ty }
            })
          } else {
            // Single tap stays inert (D-02) — remembered for the detector.
            lastTapRef.current = { x: e.clientX, y: e.clientY, time: now }
          }
        }
      }
      downRef.current = null
      panStartRef.current = null
      pinchRef.current = null
    } else if (pointersRef.current.size === 1 && wasPinching) {
      // Pinch → pan (Pitfall 6): re-anchor the pan start at the CURRENT
      // offsets under the remaining finger — no jerk on release.
      const [remaining] = Array.from(pointersRef.current.values())
      panStartRef.current = {
        clientX: remaining.x,
        clientY: remaining.y,
        tx0: zoom.tx,
        ty0: zoom.ty,
      }
      pinchRef.current = null
    }
  }

  // SC 3 iOS guard. pointercancel (edge swipe, gesture takeover) resets
  // everything. lostpointercapture fires BOTH when capture is yanked
  // mid-gesture AND implicitly after every pointerup/pointercancel (W3C PE
  // spec) — resetting on that implicit path would erase the just-recorded
  // pending double-tap (D-02) and kill SC 2, so the capture-loss path only
  // resets while the pointer is still tracked (yanked before its up/cancel
  // was processed); the up/cancel paths own the normal end of a gesture.
  const onPointerCancel = () => resetGesture()
  const onLostPointerCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointersRef.current.has(e.pointerId)) resetGesture()
  }

  return (
    <div
      ref={stageRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
      className={`relative flex h-[70svh] select-none items-center justify-center overflow-hidden rounded-lg bg-black/5 [touch-action:none] ${
        zoom.scale > 1 ? 'cursor-grab' : ''
      }`}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={() => setLoaded(true)}
        style={{
          transform: `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.scale})`,
        }}
        className={`max-h-full max-w-full object-contain transition-opacity duration-200 [-webkit-touch-callout:none] [-webkit-user-drag:none] ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  )
}
