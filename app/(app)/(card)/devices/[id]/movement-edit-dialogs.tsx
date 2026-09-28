'use client'

import { useActionState, useEffect, useState } from 'react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Combobox,
  ComboboxContent,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { ruCollator } from '@/lib/ru'
import {
  MOVEMENT_EVENT_LABELS,
  movementEventLabel,
  type MovementEventType,
} from '@/lib/movement-schema'
import {
  deleteMovementAction,
  editMovementAction,
} from '@/app/(app)/devices/actions'
import type { MovementFormState } from '@/app/(app)/devices/actions'
import {
  routeLine,
  type TimelineEventSnapshot,
} from './timeline'

// Phase 12 dialogs (HIST-01/02, D-01/D-02/D-07): movement-dialog family
// byte-parity — max-w-md p-6, WR-01 split (the wrapper stays mounted, the
// form lives in the portal and holds useActionState), echo values on failure,
// role=alert, pending-disabled submits. Copy is the 12-UI-SPEC Copywriting
// Contract verbatim.

const CONTROL_CLASS = 'h-10 px-3 text-base md:text-base'
const ERROR_CLASS = 'text-sm text-[#D70015]'
const HINT_CLASS = 'text-sm text-ink-secondary'

// Local yyyy-mm-dd for the date max — NEVER toISOString().slice(0,10)
// (movement-dialogs recipe verbatim; CR-01 anti-pattern).
function todayLocal(): string {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${mm}-${dd}`
}

// Stable ok-effect shared by every dialog form (movement-dialogs precedent).
function useCloseOnOk(state: MovementFormState, onDone: () => void) {
  useEffect(() => {
    if (state.ok) onDone()
  }, [state, onDone])
}

// The keystone vocabulary IS the option list — no parallel label dictionary.
const EVENT_OPTIONS = (
  Object.keys(MOVEMENT_EVENT_LABELS) as MovementEventType[]
).map((key) => ({ value: key, label: movementEventLabel(key) }))

// EmployeePicker over ACTIVE employees — bulk-dialogs onPick-variant recipe
// verbatim (Ё/ё fold, value = имя, id через hidden input, two zero-states)
// with the phase-12 prefill extension: `initial` seats the record's stored
// employee (an archived holder keeps name + original id unless replaced —
// OQ2); a NEW pick comes from active employees only (D-02 parity). The hidden
// input name is a parameter: the edit form carries both employeeId and
// fromEmployeeId pickers.
function EmployeePicker({
  inputId,
  label,
  name,
  employees,
  error,
  initial,
}: {
  inputId: string
  label: string
  name: 'employeeId' | 'fromEmployeeId'
  employees: { id: number; name: string }[]
  error?: string
  initial?: { id: number; name: string } | null
}) {
  const [inputValue, setInputValue] = useState(initial?.name ?? '')
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(
    initial ?? null,
  )
  const foldRu = (s: string) => s.toLowerCase().replaceAll('ё', 'е')
  // listActiveEmployees() pre-sorts in SQL; the picker re-sorts its small
  // copy so ordering never depends on the server roundtrip shape.
  const sorted = [...employees].sort((a, b) => ruCollator.compare(a.name, b.name))
  const query = inputValue.trim()
  const matches =
    query === ''
      ? sorted
      : sorted.filter((e) => foldRu(e.name).includes(foldRu(query)))
  // value = само имя (id-строки всплывали в поле — фазовые 2–3 урок).
  const items = matches.map((e) => ({ value: e.name, label: e.name }))
  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Combobox
        items={items}
        filter={null}
        autoHighlight
        inputValue={inputValue}
        onInputValueChange={setInputValue}
        onValueChange={(value) => {
          if (typeof value !== 'string') return
          const picked = sorted.find((e) => e.name === value)
          if (picked) {
            setSelected(picked)
            setInputValue(picked.name)
          }
        }}
      >
        <ComboboxInput
          id={inputId}
          placeholder="Выберите сотрудника"
          autoComplete="off"
          className="h-10 w-full"
          inputClassName="h-full px-3 text-base md:text-base"
          aria-invalid={error ? true : undefined}
        />
        <ComboboxContent>
          <ComboboxList>
            <ComboboxCollection>
              {(item: { value: string; label: string }) => (
                <ComboboxItem key={item.value} value={item.value}>
                  {item.label}
                </ComboboxItem>
              )}
            </ComboboxCollection>
          </ComboboxList>
          {employees.length === 0 ? (
            <ComboboxEmpty>
              Нет активных сотрудников — добавьте их в разделе «Сотрудники».
            </ComboboxEmpty>
          ) : matches.length === 0 ? (
            <p className="px-3 py-2 text-sm text-ink-secondary">
              Никого не найдено
            </p>
          ) : null}
        </ComboboxContent>
        <input
          type="hidden"
          name={name}
          value={selected ? String(selected.id) : ''}
        />
      </Combobox>
      {error ? <p className={ERROR_CLASS}>{error}</p> : null}
    </div>
  )
}

// Slots of one event type (D-01): what pickers the type renders, their labels
// and hidden-input names. Slotless types render none — the server derives the
// slots fully from (type, input) and NULLs the rest.
function slotsOf(
  eventType: MovementEventType,
): Array<{ name: 'employeeId' | 'fromEmployeeId'; label: string }> {
  switch (eventType) {
    case 'assigned':
      return [{ name: 'employeeId', label: 'Сотрудник' }]
    case 'transferred':
      return [
        { name: 'fromEmployeeId', label: 'От кого' },
        { name: 'employeeId', label: 'Кому' },
      ]
    case 'returned':
      return [{ name: 'fromEmployeeId', label: 'От кого' }]
    default:
      return []
  }
}

// ─── Исправить запись (HIST-01, D-01/D-02) ──────────────────────────────────

function MovementEditForm({
  deviceId,
  event,
  employees,
  onDone,
}: {
  deviceId: number
  event: TimelineEventSnapshot
  employees: { id: number; name: string }[]
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState(editMovementAction, {})
  useCloseOnOk(state, onDone)
  const [eventType, setEventType] = useState<MovementEventType>(
    event.eventType as MovementEventType,
  )
  // Type switch resets the slots (UI-SPEC Default 8): once the operator has
  // changed the type, every picker renders empty — even switching back to the
  // record's own type is a conscious re-entry.
  const [typeChanged, setTypeChanged] = useState(false)
  const route = routeLine(event)
  const storedType = event.eventType as MovementEventType
  const slots = slotsOf(eventType)
  const isDisposed = eventType === 'disposed'

  return (
    <>
      {/* Context line: the record as the timeline renders it (Default 12) —
          orients the operator when several rows look alike. */}
      <p className={HINT_CLASS}>
        {movementEventLabel(event.eventType)} · {event.occurredAtDisplay}
        {route ? ` · ${route}` : ''}
      </p>
      {event.comment ? (
        <p className={`break-words ${HINT_CLASS}`}>{event.comment}</p>
      ) : null}
      {state.error ? (
        <p className={ERROR_CLASS} role="alert">
          {state.error}
        </p>
      ) : null}
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="deviceId" value={deviceId} />
        <input type="hidden" name="movementId" value={event.id} />
        <input type="hidden" name="eventType" value={eventType} />
        <div className="space-y-2">
          <Label htmlFor="movement-event-type">Тип действия</Label>
          <Select
            items={EVENT_OPTIONS}
            value={eventType}
            onValueChange={(next) => {
              if (typeof next !== 'string') return
              setEventType(next as MovementEventType)
              setTypeChanged(true)
            }}
          >
            <SelectTrigger id="movement-event-type" className={`${CONTROL_CLASS} w-full`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {slots.map((slot, index) => (
          <EmployeePicker
            key={`${slot.name}-${index}`}
            inputId={`movement-${slot.name}-${index}`}
            label={slot.label}
            name={slot.name}
            employees={employees}
            error={state.fieldErrors?.[slot.name]}
            initial={
              // Prefill only on the record's own untouched type (OQ2): an
              // archived holder keeps name + original id until replaced.
              !typeChanged && eventType === storedType
                ? {
                    id: (slot.name === 'employeeId'
                      ? event.toId
                      : event.fromId) ?? 0,
                    name:
                      (slot.name === 'employeeId'
                        ? event.toName
                        : event.fromName) ?? '',
                  }
                : null
            }
          />
        ))}
        <div className="space-y-2">
          <Label htmlFor="movement-occurred-at">Дата события</Label>
          <Input
            id="movement-occurred-at"
            name="occurredAt"
            type="date"
            // Prefill = the event's own DISPLAY_TZ day (Pitfall 4) — the day
            // the timeline shows; echo wins after a failed submit.
            defaultValue={state.values?.occurredAt ?? event.occurredAtDate}
            max={todayLocal()}
            className={CONTROL_CLASS}
            aria-invalid={state.fieldErrors?.occurredAt ? true : undefined}
          />
          {state.fieldErrors?.occurredAt ? (
            <p className={ERROR_CLASS}>{state.fieldErrors.occurredAt}</p>
          ) : null}
        </div>
        {isDisposed ? (
          // Dispose parity (Pitfall 6): the reason IS the comment — the field
          // reshapes to a required textarea, same name, echo survives.
          <div className="space-y-2">
            <Label htmlFor="movement-comment">Причина списания</Label>
            <Textarea
              id="movement-comment"
              name="comment"
              rows={3}
              maxLength={500}
              placeholder="Например: сгорела после скачка питания"
              defaultValue={state.values?.comment ?? event.comment ?? ''}
              className="text-base md:text-base"
              aria-invalid={state.fieldErrors?.comment ? true : undefined}
            />
            {state.fieldErrors?.comment ? (
              <p className={ERROR_CLASS}>{state.fieldErrors.comment}</p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="movement-comment">Комментарий</Label>
            <Input
              id="movement-comment"
              name="comment"
              type="text"
              maxLength={500}
              placeholder="Номер акта, примечание…"
              defaultValue={state.values?.comment ?? event.comment ?? ''}
              className={CONTROL_CLASS}
              aria-invalid={state.fieldErrors?.comment ? true : undefined}
            />
            {state.fieldErrors?.comment ? (
              <p className={ERROR_CLASS}>{state.fieldErrors.comment}</p>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="secondary" />}>Отмена</DialogClose>
          <Button type="submit" disabled={pending}>
            {pending ? 'Сохраняем…' : 'Сохранить изменения'}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

export function MovementEditDialog({
  open,
  onOpenChange,
  deviceId,
  event,
  employees,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  deviceId: number
  event: TimelineEventSnapshot
  employees: { id: number; name: string }[]
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 *:min-w-0">
        <DialogHeader>
          <DialogTitle>Исправить запись</DialogTitle>
        </DialogHeader>
        <MovementEditForm
          deviceId={deviceId}
          event={event}
          employees={employees}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

// ─── Удалить запись? (HIST-02, D-07) ────────────────────────────────────────

function MovementDeleteForm({
  deviceId,
  event,
  onDone,
}: {
  deviceId: number
  event: TimelineEventSnapshot
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState(deleteMovementAction, {})
  useCloseOnOk(state, onDone)
  const route = routeLine(event)

  return (
    <>
      {/* The record EXACTLY as the timeline renders it (D-07) — neutral ink,
          never red: the content is not the consequence, the button is. */}
      <div>
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
      </div>
      <p className={HINT_CLASS}>
        Запись будет удалена безвозвратно; статус и держатель устройства
        пересчитаются из оставшейся истории.
      </p>
      {state.error ? (
        <p className={ERROR_CLASS} role="alert">
          {state.error}
        </p>
      ) : null}
      <form action={formAction}>
        <input type="hidden" name="deviceId" value={deviceId} />
        <input type="hidden" name="movementId" value={event.id} />
        <DialogFooter>
          {/* Mirrored negative on purpose (dispose precedent). */}
          <DialogClose render={<Button variant="secondary" />}>
            Не удалять
          </DialogClose>
          {/* The second red solid fill in the UI (UI-SPEC color table): the
              irreversible destruction joins the «Списать» family. */}
          <Button
            type="submit"
            disabled={pending}
            className="bg-destructive font-semibold text-white hover:bg-destructive/90"
          >
            {pending ? 'Удаляем…' : 'Удалить'}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

export function MovementDeleteConfirmDialog({
  open,
  onOpenChange,
  deviceId,
  event,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  deviceId: number
  event: TimelineEventSnapshot
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6 *:min-w-0">
        <DialogHeader>
          <DialogTitle>Удалить запись?</DialogTitle>
        </DialogHeader>
        <MovementDeleteForm
          deviceId={deviceId}
          event={event}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
