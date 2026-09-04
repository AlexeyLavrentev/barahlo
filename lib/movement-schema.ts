import { z } from 'zod'
import { DISPLAY_TZ } from '@/lib/ru'

// Keystone module of the custody actions (D-01/D-02): the SINGLE source of the
// movement event vocabulary, its Russian labels and the zod pieces shared by
// the dialogs, the server actions and the tests. eventType is NEVER part of
// any client schema — each action hardcodes its own event (RESEARCH C2); the
// device projection (status/currentEmployeeId) is likewise absent here: it is
// decided by the DB row inside the transaction, never by a payload.
//
// Pure and immutable: no framework imports, no module-level mutable state —
// safe to import from RSC, actions and vitest alike (same contract as
// lib/device-schema.ts).

// D-01 wire format: what input[type=date] submits.
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const MOVEMENT_EVENT_LABELS = {
  received: 'Поступление',
  assigned: 'Выдача',
  transferred: 'Передача',
  returned: 'Возврат',
  to_repair: 'В ремонт',
  from_repair: 'Из ремонта',
  disposed: 'Списание',
} as const

export type MovementEventType = keyof typeof MOVEMENT_EVENT_LABELS

// Timeline event label (04-UI-SPEC vocabulary table); an unknown value falls
// back to itself — the event_type column is free text, the display stays
// honest anyway.
export function movementEventLabel(eventType: string): string {
  return MOVEMENT_EVENT_LABELS[eventType as MovementEventType] ?? eventType
}

// Calendar-day helpers run on the OFFICE wall clock (CR-01): the deployment
// container is UTC while the office is Moscow, so a server-local comparison
// rejected the prefilled «today» during MSK 00:00–03:00 every night. Both
// helpers take an injectable `now` so the day boundary is pinned by frozen-
// clock regression tests (tests/movement-schema.test.ts).

// Wall-clock parts of `date` in a named zone (hourCycle h23 → midnight is 0,
// never 24).
function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPart['type']): number =>
    Number(parts.find((part) => part.type === type)!.value)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

// D-01: a movement date may be backdated but never lies about the future.
// The chosen CALENDAR DAY is compared against TODAY IN DISPLAY_TZ (the office
// wall clock — CR-01); both are yyyy-mm-dd, so lexicographic order IS
// chronological order. Today is always legal (its time-of-day is supplied by
// occurredAtFromDate below), any later day is rejected. The client `max`
// attribute is convenience only; this check is the authority (RESEARCH C7).
export function isNotFutureDate(iso: string, now: Date = new Date()): boolean {
  const today = zonedParts(now, DISPLAY_TZ)
  const todayIso =
    `${String(today.year).padStart(4, '0')}` +
    `-${String(today.month).padStart(2, '0')}` +
    `-${String(today.day).padStart(2, '0')}`
  return iso <= todayIso
}

// D-01 default «сейчас», made concrete (RESEARCH C7): a submitted day becomes
// that day with NOW's DISPLAY_TZ time-of-day — «выдал вчера» keeps a
// plausible hour, the timeline ordering stays stable, and the stored
// instant's Moscow day equals the submitted one even on the UTC container
// (CR-01). No date at all = now.
export function occurredAtFromDate(
  iso: string | undefined,
  now: Date = new Date(),
): Date {
  if (!iso) return now
  const [y, m, d] = iso.split('-').map(Number)
  const wall = zonedParts(now, DISPLAY_TZ)
  // Interpret chosen day + wall-clock time AS DISPLAY_TZ: start from the
  // naive-UTC guess and re-subtract the zone offset measured at the CURRENT
  // guess from the ORIGINAL target (fixed-point; two steps are exact even
  // across DST transitions — Moscow itself has been a fixed UTC+3 since
  // 2014, so the first step already lands).
  const target = Date.UTC(y, m - 1, d, wall.hour, wall.minute, wall.second)
  const offsetMs = (t: number): number => {
    const p = zonedParts(new Date(t), DISPLAY_TZ)
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t
  }
  let guess = target
  guess = target - offsetMs(guess)
  guess = target - offsetMs(guess)
  return new Date(guess)
}

const occurredAtSchema = z
  .string()
  .regex(DATE_PATTERN)
  // Arrow wrapper: isNotFutureDate's second parameter is the injectable
  // clock — a bare refine reference could forward a zod context into it.
  .refine((iso) => isNotFutureDate(iso), {
    message: 'Дата не может быть в будущем',
  })

const commentSchema = z.string().max(500)

// Выдать — the target employee is the only person field; ids ride as hidden
// inputs and are coerced here (an empty one collapses to 0 and fails positive).
export const assignSchema = z.strictObject({
  deviceId: z.coerce.number().int().positive(),
  employeeId: z.coerce.number().int().positive(),
  occurredAt: occurredAtSchema.optional(),
  comment: commentSchema.optional(),
})

// Принять — no person fields; strictness rejects an injected employeeId.
export const acceptSchema = z.strictObject({
  deviceId: z.coerce.number().int().positive(),
  occurredAt: occurredAtSchema.optional(),
  comment: commentSchema.optional(),
})

// В ремонт / Из ремонта (D-04) — no person fields either: the holder of an
// assigned device is auto-accepted by the transaction itself (returned
// event), never chosen in a form. Strictness rejects an injected employeeId.
export const repairSchema = z.strictObject({
  deviceId: z.coerce.number().int().positive(),
  occurredAt: occurredAtSchema.optional(),
  comment: commentSchema.optional(),
})

// Списать (D-03) — the reason IS the comment and it is ОБЯЗАТЕЛЬНА: без
// причины списания не существует. The event stays append-only and the
// transition is terminal (no schema anywhere leads out of disposed).
export const disposeSchema = z.strictObject({
  deviceId: z.coerce.number().int().positive(),
  occurredAt: occurredAtSchema.optional(),
  comment: z.string().min(1).max(500),
})

// Передать — adjacency: получатель ≠ текущий держатель. The current holder id
// arrives as an ARGUMENT read from the DB row (never from the payload); the
// device-status guard itself lives in the transaction (C1) — this refine is
// the fast, friendly rejection of a legal-looking but meaningless no-op.
export function transferSchema(currentHolderId: number | null | undefined) {
  return assignSchema.refine(
    (data) => data.employeeId !== currentHolderId,
    {
      message: 'Нельзя передать устройство текущему держателю',
      path: ['employeeId'],
    },
  )
}

// Вернуть всю технику — no dedicated schema: the employee id comes from the
// card's hidden input and passes the plain positive-int gate in the action
// (the transaction re-resolves the actual device list from the DB row).

export const movementSchemas = {
  assign: assignSchema,
  accept: acceptSchema,
  transfer: transferSchema,
  repair: repairSchema,
  dispose: disposeSchema,
}
