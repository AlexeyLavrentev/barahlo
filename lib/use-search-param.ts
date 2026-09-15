'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

// Shared live-search hook (phase 7, D-07): the verbatim body of the device
// search island — 300 ms debounce → router.replace inside startTransition,
// Enter commits immediately via commitNow. Consumers: DeviceSearchBox,
// EmployeeSearchBox and the Phase 11 ⌘K palette; its API is a frozen shared
// dependency (D-07 reversibility: costly).
//
// The URL is the only search state: the server re-validates q
// (query-params.ts of each route) and the transition keeps the current list
// mounted through the swap (no skeleton flash per keystroke).
//
// buildQuery MUST be a stable module-level reference the island imports
// itself — never a prop: functions are not serializable across the RSC
// boundary (vercel server-serialization). The push is buildQuery applied to
// the spread of target overridden with the current value — for devices
// target=current already carries q, so the override preserves the exact
// push semantics the island had before the extraction.
//
// Reconciliation priority (G-5-1): pending local edits win over the URL.
// The URL is adopted into the input only when the input is clean
// (value === lastSynced.current); the island's own pushes are recognized by
// their echo via the inFlight ref and absorbed without clobbering fresher
// keystrokes.
export function useDebouncedSearchQuery<T extends object>(args: {
  q: string
  // The builder inputs minus q. For devices this is the full DeviceFilters
  // (its q is replaced by the spread override on every push); for employees
  // it is the segment alone.
  target: T
  buildQuery: (f: T & { q: string }) => string
}): { value: string; setValue: (v: string) => void; commitNow: () => void } {
  const { q, target, buildQuery } = args
  const router = useRouter()
  const [value, setValue] = useState(q)
  const [, startTransition] = useTransition()
  const mounted = useRef(false)
  // The last q the server actually holds (CR-01 reconciliation anchor).
  // Stamped when a push LEAVES (inside the debounce callback / commitNow),
  // not when the debounce arms — stamping at arm time kept q !== lastSynced
  // for the whole arm→echo window (≥300 ms by design), so every keystroke
  // there looked like an external q change and the old adopt branch
  // clobbered it (the G-5-1 keystroke loss).
  const lastSynced = useRef(q)
  // Values we pushed whose echo has not returned yet (G-5-1): a q prop
  // matching an entry — or its trim, the server normalizes q in
  // query-params.ts — is our OWN echo and is absorbed silently instead of
  // being adopted over fresher input. shift-capped to bound stuck entries.
  const inFlight = useRef<string[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      lastSynced.current = q
      return
    }
    // Own echo: q answers a push still tracked by inFlight (exact or
    // trimmed — the server trims q, query-params.ts; maxLength 100 keeps
    // the server cap unreachable from the input). Absorb it: drop the
    // entry and advance lastSynced. The input is NEVER rewritten to the
    // trimmed form — a trailing space mid-composition («aspire ») is
    // pending user text, and rewriting it away made multi-word search
    // impossible (G-5-2: the space was eaten ~300 ms after typing by the
    // echo of its own push). A whitespace-only divergence stays as-is and
    // arms nothing — rewriting would otherwise re-push the same trimmed
    // query on every echo in a 300 ms request loop.
    const echoIdx = inFlight.current.findIndex((p) => q === p || q === p.trim())
    if (echoIdx !== -1) {
      inFlight.current.splice(echoIdx, 1)
      lastSynced.current = q
      if (value === q || value.trim() === q.trim()) return
      // Input carries real edits typed during the flight: fall through and
      // re-arm below so the newer text still pushes. Invariant: this
      // effect never returns with value.trim() !== q.trim() and no timer
      // armed — that is exactly how the old adopt branch lost text forever.
    } else if (
      value.trim() === lastSynced.current.trim() &&
      q !== lastSynced.current
    ) {
      // Externally changed q with a CLEAN input («Сбросить фильтры»,
      // Back/Forward): adopt the URL into the input (CR-01) — value===q
      // after the state update, so the debounce stays silent. Clean means
      // equal to the server's q modulo surrounding whitespace: a stale
      // trailing space left by an absorbed echo is not pending content and
      // must not block the reset from clearing the input. A truly dirty
      // input (pending local edits) NEVER adopts: a user typing through a
      // foreign navigation keeps their text — it re-arms below and pushes
      // (G-5-1). `target` in the push comes fresh from props, so a reset
      // of OTHER filters still lands.
      lastSynced.current = q
      setValue(q)
      return
    }
    // Input already matches the URL — no-op skip (Pitfall 6).
    if (value === q) return
    // We are initiating: arm the push. lastSynced and inFlight are stamped
    // INSIDE the callback — at push time, not arm time — so an older
    // push's echo landing during a newer arm window is classified as our
    // own (the branch above) instead of looking external and clobbering
    // fresher input (the G-5-1 keystroke loss).
    timer.current = setTimeout(() => {
      timer.current = null
      inFlight.current.push(value)
      if (inFlight.current.length > 4) inFlight.current.shift()
      lastSynced.current = value
      startTransition(() =>
        router.replace(buildQuery({ ...target, q: value }), {
          scroll: false,
        }),
      )
    }, 300)
    return () => {
      // Retyping cancels the pending timer; a prop change («Сбросить
      // фильтры», another filter island) also cancels it.
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
    }
  }, [value, q, target, buildQuery])

  // Enter commits immediately: drop the pending debounce, navigate now.
  const commitNow = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (value === q) return
    // Same push-time stamping as the debounce callback: the echo of this
    // Enter-push is classified via inFlight as our own and must not roll
    // back text typed while the navigation is in flight (G-5-1).
    inFlight.current.push(value)
    if (inFlight.current.length > 4) inFlight.current.shift()
    lastSynced.current = value // our own push — its echo must not re-push
    startTransition(() =>
      router.replace(buildQuery({ ...target, q: value }), {
        scroll: false,
      }),
    )
  }

  return { value, setValue, commitNow }
}
