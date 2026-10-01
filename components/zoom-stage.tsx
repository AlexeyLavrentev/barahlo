'use client'

/* eslint-disable @next/next/no-img-element -- same rationale as photo-grid:
   the photo is pre-sized at upload (1600px full) and served from an
   authorized route; next/image would re-fetch and re-process auth'd binaries
   per request for nothing (04-RESEARCH decision). */

import { useRef, useState } from 'react'

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
  const [zoom] = useState({ scale: 1, tx: 0, ty: 0 })
  const [loaded, setLoaded] = useState(false)

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
