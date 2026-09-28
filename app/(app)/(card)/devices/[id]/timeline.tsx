'use client'

import { useCallback, useState } from 'react'
import { movementEventLabel } from '@/lib/movement-schema'
import {
  MovementDeleteConfirmDialog,
  MovementEditDialog,
} from './movement-edit-dialogs'

// Vertical timeline of one device (04-UI-SPEC «История перемещений»), phase
// 12 edition: a client island owning the per-row «Исправить»/«Удалить»
// triggers (D-07). Rendering of the event content is byte-identical to the
// pre-12 server component — dot rail, 14/600 label, 14/400 secondary meta,
// comment-only-when-present, names as plain text (D-05: ids ride the island
// props for the dialog prefill only, never as links).
//
// The island receives a FLAT serializable snapshot (vercel
// server-serialization): dates as precomputed strings — occurredAtDisplay
// («dd.mm.yyyy, hh:mm», server-side occurredAtFormat) and occurredAtDate
// (yyyy-mm-dd, server-side occurredAtDateIso in DISPLAY_TZ, Pitfall 4) —
// never Date objects. employees serialize ONCE for the whole island
// (server-dedup-props), not per row.

// Route line per event type — verbatim vocabulary of the 04-UI-SPEC table.
// Missing name slots render «—»; a route with nothing to say renders nothing.
// Shared with the dialogs: the context line and the delete record block show
// the record EXACTLY as the timeline renders it (D-07).
export function routeLine(event: {
  eventType: string
  fromName: string | null
  toName: string | null
}): string | null {
  const from = event.fromName ?? '—'
  const to = event.toName ?? '—'
  switch (event.eventType) {
    case 'assigned':
      return `→ ${to}`
    case 'transferred':
      return `${from} → ${to}`
    case 'returned':
      return `← ${from}`
    case 'to_repair':
      return event.fromName ? `от ${from}` : null
    default:
      // received / from_repair / disposed — no route
      return null
  }
}

export type TimelineEventSnapshot = {
  id: number
  eventType: string
  fromId: number | null
  toId: number | null
  fromName: string | null
  toName: string | null
  comment: string | null
  occurredAtDisplay: string
  occurredAtDate: string
}

type TimelineDialogState = { movementId: number; mode: 'edit' | 'delete' }

// Quiet row action (UI-SPEC Default 1): 14/400 secondary → ink on hover,
// spring-tap scale, and a ≥44px hit area grown via ::after inset — the row
// stays a record, never a toolbar.
const ROW_ACTION_CLASS =
  'relative text-sm text-ink-secondary transition-[color,transform] duration-100 ease-out hover:text-ink active:scale-[0.97] after:absolute after:content-[""] after:-inset-x-2 after:-inset-y-3'

export function Timeline({
  events,
  employees,
  deviceId,
}: {
  events: TimelineEventSnapshot[]
  employees: { id: number; name: string }[]
  deviceId: number
}) {
  const [dialog, setDialog] = useState<TimelineDialogState | null>(null)
  const close = useCallback(() => setDialog(null), [])
  // Only one dialog open at a time (UI-SPEC Defaults 16): one keyed state.
  const active =
    dialog === null ? undefined : events.find((e) => e.id === dialog.movementId)

  if (events.length === 0) {
    // Defaults #18/#19: legacy devices have no received backfill and the app
    // invents no synthetic events — the honest empty state of the copy table.
    // Triggers exist only on rows — an empty history offers no affordances.
    return (
      <p className="px-4 py-2 text-sm text-ink-secondary">
        История появится после первого действия с устройством.
      </p>
    )
  }
  return (
    <div className="px-4 py-2">
      <ol>
        {events.map((event, index) => {
          const route = routeLine(event)
          return (
            <li key={event.id} className="relative pb-4 pl-6 last:pb-1">
              {/* Connector to the next (older) item; none after the last. */}
              {index < events.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute bottom-0 left-[3.5px] top-[22px] w-px bg-hairline"
                />
              ) : null}
              <span
                aria-hidden
                className={`absolute left-0 top-1.5 size-2 rounded-full ${
                  index === 0 ? 'bg-ink-secondary' : 'bg-hairline'
                }`}
              />
              <p className="text-sm font-semibold text-ink">
                {movementEventLabel(event.eventType)}
              </p>
              <p className="text-sm text-ink-secondary">
                {event.occurredAtDisplay}
                {route ? ` · ${route}` : ''}
              </p>
              {event.comment ? (
                <p className="break-words text-sm text-ink">{event.comment}</p>
              ) : null}
              {/* D-05/D-06 verbatim: one uniform recipe on EVERY row — no
                  status matrix, no hiding logic. */}
              <div className="mt-2 flex gap-4">
                <button
                  type="button"
                  data-timeline-edit={event.id}
                  className={ROW_ACTION_CLASS}
                  onClick={() => setDialog({ movementId: event.id, mode: 'edit' })}
                >
                  Исправить
                </button>
                <button
                  type="button"
                  data-timeline-delete={event.id}
                  className={ROW_ACTION_CLASS}
                  onClick={() =>
                    setDialog({ movementId: event.id, mode: 'delete' })
                  }
                >
                  Удалить
                </button>
              </div>
            </li>
          )
        })}
      </ol>
      {active && dialog?.mode === 'edit' ? (
        <MovementEditDialog
          open
          onOpenChange={(next) => {
            if (!next) close()
          }}
          deviceId={deviceId}
          event={active}
          employees={employees}
        />
      ) : null}
      {active && dialog?.mode === 'delete' ? (
        <MovementDeleteConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next) close()
          }}
          deviceId={deviceId}
          event={active}
        />
      ) : null}
    </div>
  )
}
