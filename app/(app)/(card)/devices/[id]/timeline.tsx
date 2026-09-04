import type { MovementEventView } from '@/db/queries/movements'
import { movementEventLabel } from '@/lib/movement-schema'
import { occurredAtFormat } from '@/lib/ru'

// Vertical timeline of one device (04-UI-SPEC «История перемещений»): a dot
// rail, newest first — the first row's dot carries the quiet `bg-ink-secondary`
// emphasis of the current state, older dots and the connector stay hairline.
// Event labels are 14/600 (the list-of-mini-headers rule); route/meta lines
// and dates are 14/400 secondary; a comment renders only when present (no
// empty rows, no «—» filler inside comments).
//
// Names render as plain text — history is history: archived employees appear
// exactly like active ones, nothing is a link (accent/link discipline).

// Route line per event type — verbatim vocabulary of the 04-UI-SPEC table.
// Missing name slots render «—»; a route with nothing to say renders nothing.
function routeLine(event: MovementEventView): string | null {
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

export function Timeline({ events }: { events: MovementEventView[] }) {
  if (events.length === 0) {
    // Defaults #18/#19: legacy devices have no received backfill and the app
    // invents no synthetic events — the honest empty state of the copy table.
    return (
      <p className="px-4 py-2 text-sm text-ink-secondary">
        История появится после первого действия с устройством.
      </p>
    )
  }
  return (
    <ol className="px-4 py-2">
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
              {occurredAtFormat.format(event.occurredAt)}
              {route ? ` · ${route}` : ''}
            </p>
            {event.comment ? (
              <p className="text-sm text-ink">{event.comment}</p>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
