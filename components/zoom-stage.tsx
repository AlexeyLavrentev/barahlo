'use client'

/* eslint-disable @next/next/no-img-element -- same rationale as photo-grid:
   the photo is pre-sized at upload (1600px full) and served from an
   authorized route; next/image would re-fetch and re-process auth'd binaries
   per request for nothing (04-RESEARCH decision). */

import { useEffect, useRef, useState } from 'react'

import {
  clampOffset,
  normalizeWheelDelta,
  wheelScale,
  zoomAtPoint,
} from '@/lib/zoom'

// Phase 15 (D-03/D-04): the lightbox zoom stage. The image lives on a CSS
// transform (translate + scale, origin center) manipulated directly — NO
// transition on transform, so zoom responds instantly (a reduced-motion-safe
// case by construction); the load-in fades opacity instead (200 ms over the
// muted stage fill, bg-black/5 — the upload-tile family) once the full
// variant fires onLoad. Hand-rolled per D-04: no lightbox/zoom libraries —
// the Base UI Dialog keeps ESC/scroll-lock/focus-trap, this module owns only
// the stage. Wheel zoom lands in the next slice of this plan, pointer
// gestures in Wave 2; all zoom math comes from lib/zoom.ts (one pure source
// shared with vitest). Remount-by-key (photo.id at the call site) is the
// constructive reset path — no setState in effect bodies (repo eslint rule).
export function ZoomStage({ src, alt }: { src: string; alt: string }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [zoom, setZoom] = useState({ scale: 1, tx: 0, ty: 0 })
  const [loaded, setLoaded] = useState(false)

  // Wheel zoom to the cursor (SC 2). React 19 registers wheel passively on
  // the root — preventDefault inside an onWheel prop is a no-op that logs an
  // Intervention warning (Pitfall 1), so the ONLY correct interception is a
  // native non-passive listener on the stage element. The listener hangs on
  // the stage ONLY: over the overlay controls (close/«Удалить фото») the
  // wheel stays inert (Default 5). The recompute goes exclusively through
  // lib/zoom.ts helpers in one functional setState — no stale closures, no
  // setState in effect bodies: scale clamped FIRST (Pitfall 8), then
  // zoom-to-point, then the offset clamp (an axis without overflow pins to 0,
  // so panning cannot exist at 1x).
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

  return (
    <div
      ref={stageRef}
      className="relative flex h-[70svh] select-none items-center justify-center overflow-hidden rounded-lg bg-black/5 [touch-action:none]"
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
