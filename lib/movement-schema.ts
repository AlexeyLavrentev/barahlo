import { z } from 'zod'

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

// D-01: a movement date may be backdated but never lies about the future.
// The chosen CALENDAR DAY is compared against the start of tomorrow in the
// server timezone — today is always legal (its time-of-day is supplied by
// occurredAtFromDate below), any later day is rejected. The client `max`
// attribute is convenience only; this check is the authority (RESEARCH C7).
export function isNotFutureDate(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number)
  const chosen = new Date(y, m - 1, d)
  const now = new Date()
  const startOfTomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  )
  return chosen.getTime() < startOfTomorrow.getTime()
}

// D-01 default «сейчас», made concrete (RESEARCH C7): a submitted day becomes
// that day with NOW's time-of-day — «выдал вчера» keeps a plausible hour and
// the timeline ordering stays stable. No date at all = now.
export function occurredAtFromDate(iso: string | undefined): Date {
  if (!iso) return new Date()
  const [y, m, d] = iso.split('-').map(Number)
  const now = new Date()
  return new Date(
    y,
    m - 1,
    d,
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  )
}

const occurredAtSchema = z
  .string()
  .regex(DATE_PATTERN)
  .refine(isNotFutureDate, { message: 'Дата не может быть в будущем' })

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
}
