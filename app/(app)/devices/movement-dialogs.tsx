'use client'

import { useActionState, useCallback, useEffect, useState } from 'react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { pluralDevices, ruCollator } from '@/lib/ru'
import type { EmployeeOption } from '@/db/queries/movements'
import {
  acceptDeviceAction,
  assignDeviceAction,
  disposeDeviceAction,
  returnFromRepairDeviceAction,
  sendToRepairDeviceAction,
  transferDeviceAction,
  type MovementFormState,
} from './actions'
// The return-all action belongs to the employees feature (it mutates the
// employee's holdings); the confirm dialog lives here with the other
// movement dialogs and is mounted by the employee card.
import { returnAllDevicesAction } from '@/app/(app)/employees/actions'

// The custody dialogs (04-UI-SPEC «Dialogs»): one per action, the dialog IS
// the confirmation for reversible actions. Field order everywhere — сотрудник
// → дата события → комментарий; «Дата события» is input[type=date] prefilled
// with TODAY (D-01 default «сейчас» made visible; backdating is an edit away,
// the future is rejected inline and server-side). Pending and error copy is
// the UI-SPEC copy table verbatim; failures render role=alert and echo the
// submitted values (React 19 form-reset pattern, 4886f6a).
//
// WR-01 split: every wrapper below stays mounted (it owns the trigger and the
// open state), so useActionState lives in the inner form component — the
// dialog portal unmounts its children once the close animation finishes, and
// every open session starts from a clean state.

const CONTROL_CLASS = 'h-10 px-3 text-base md:text-base'
const ERROR_CLASS = 'text-sm text-[#D70015]'
const HINT_CLASS = 'text-sm text-ink-secondary'

// Local yyyy-mm-dd for the date prefill/max — NEVER toISOString().slice(0,10),
// that is the UTC date and drifts after midnight in any TZ east of UTC
// (RESEARCH C7 anti-pattern).
function todayLocal(): string {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${mm}-${dd}`
}

// Employee picker over ACTIVE employees only (04-UI-SPEC Default 20): the
// existing combobox re-parametrized — filter-as-you-type, accent checkmark on
// the selected row, NO create-option (custody dialogs never create employees).
// Zero active employees renders the popover hint, never a dead dropdown.
// The selection rides to the action as employeeId via a hidden input (the
// combobox itself submits nothing — the phase 2 lesson, now explicit).
function EmployeePicker({
  inputId,
  label,
  employees,
  error,
}: {
  inputId: string
  label: string
  employees: EmployeeOption[]
  error?: string
}) {
  const [inputValue, setInputValue] = useState('')
  const [selected, setSelected] = useState<EmployeeOption | null>(null)
  const foldRu = (s: string) => s.toLowerCase().replaceAll('ё', 'е')
  // listActiveEmployees() pre-sorts in SQL; the picker re-sorts its small
  // copy so ordering never depends on the server roundtrip shape.
  const sorted = [...employees].sort((a, b) => ruCollator.compare(a.name, b.name))
  const query = inputValue.trim()
  const matches =
    query === ''
      ? sorted
      : sorted.filter((e) => foldRu(e.name).includes(foldRu(query)))
  const items = matches.map((e) => ({ value: String(e.id), label: e.name }))
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
          const picked = sorted.find((e) => String(e.id) === value)
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
          <ComboboxEmpty>
            Нет активных сотрудников — добавьте их в разделе «Сотрудники».
          </ComboboxEmpty>
        </ComboboxContent>
        <input
          type="hidden"
          name="employeeId"
          value={selected ? String(selected.id) : ''}
        />
      </Combobox>
      {error ? <p className={ERROR_CLASS}>{error}</p> : null}
    </div>
  )
}

// «Дата события» — prefilled with today, `max` mirrors the server refine
// (client convenience only; the server is authoritative, RESEARCH C7).
function OccurredAtField({
  id,
  echoValue,
  error,
}: {
  id: string
  echoValue?: string
  error?: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Дата события</Label>
      <Input
        id={id}
        name="occurredAt"
        type="date"
        defaultValue={echoValue ?? todayLocal()}
        max={todayLocal()}
        className={CONTROL_CLASS}
        aria-invalid={error ? true : undefined}
      />
      {error ? <p className={ERROR_CLASS}>{error}</p> : null}
    </div>
  )
}

// «Комментарий» — a one-line input (a comment is a номер акта/примечание, not
// a note), optional, DOM maxLength mirrors the schema bound.
function CommentField({ id, echoValue }: { id: string; echoValue?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Комментарий</Label>
      <Input
        id={id}
        name="comment"
        type="text"
        autoComplete="off"
        maxLength={500}
        placeholder="Номер акта, примечание…"
        defaultValue={echoValue}
        className={CONTROL_CLASS}
      />
    </div>
  )
}

// Shared footer: dismiss (secondary) + pending-aware primary (right).
function DialogActions({
  pendingCopy,
  label,
  pending,
}: {
  pendingCopy: string
  label: string
  pending: boolean
}) {
  return (
    <DialogFooter>
      <DialogClose render={<Button variant="secondary" />}>Отмена</DialogClose>
      <Button type="submit" disabled={pending}>
        {pending ? pendingCopy : label}
      </Button>
    </DialogFooter>
  )
}

// Stable ok-effect shared by every dialog form (device-dialog precedent).
function useCloseOnOk(state: MovementFormState, onDone: () => void) {
  useEffect(() => {
    if (state.ok) onDone()
  }, [state, onDone])
}

// ─── Выдать (in_stock → assigned) ───────────────────────────────────────────

function AssignDialogForm({
  deviceId,
  employees,
  onDone,
}: {
  deviceId: number
  employees: EmployeeOption[]
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState(assignDeviceAction, {})
  useCloseOnOk(state, onDone)
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="deviceId" value={deviceId} />
      <EmployeePicker
        inputId="assign-employeeId"
        label="Сотрудник"
        employees={employees}
        error={state.fieldErrors?.employeeId}
      />
      <OccurredAtField
        id="assign-occurredAt"
        echoValue={state.values?.occurredAt}
        error={state.fieldErrors?.occurredAt}
      />
      <CommentField id="assign-comment" echoValue={state.values?.comment} />
      {state.error ? (
        <p className={ERROR_CLASS} role="alert">
          {state.error}
        </p>
      ) : null}
      <DialogActions pendingCopy="Выдача…" label="Выдать" pending={pending} />
    </form>
  )
}

export function AssignDialog({
  deviceId,
  employees,
}: {
  deviceId: number
  employees: EmployeeOption[]
}) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* The one accent button of an in_stock card (04-UI-SPEC accent rule #1). */}
      <DialogTrigger render={<Button size="xl" data-device-assign-id={deviceId} />}>
        Выдать
      </DialogTrigger>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle>Выдать устройство</DialogTitle>
        </DialogHeader>
        {/* Portal-mounted: WR-01 clean state per dialog session. */}
        <AssignDialogForm deviceId={deviceId} employees={employees} onDone={close} />
      </DialogContent>
    </Dialog>
  )
}

// ─── Принять (assigned → in_stock) ──────────────────────────────────────────

function AcceptDialogForm({
  deviceId,
  onDone,
}: {
  deviceId: number
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState(acceptDeviceAction, {})
  useCloseOnOk(state, onDone)
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="deviceId" value={deviceId} />
      <p className={HINT_CLASS}>Устройство вернётся на склад.</p>
      <OccurredAtField
        id="accept-occurredAt"
        echoValue={state.values?.occurredAt}
        error={state.fieldErrors?.occurredAt}
      />
      <CommentField id="accept-comment" echoValue={state.values?.comment} />
      {state.error ? (
        <p className={ERROR_CLASS} role="alert">
          {state.error}
        </p>
      ) : null}
      <DialogActions pendingCopy="Приём…" label="Принять" pending={pending} />
    </form>
  )
}

export function AcceptDialog({ deviceId }: { deviceId: number }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="secondary" size="xl" data-device-accept-id={deviceId} />}>
        Принять
      </DialogTrigger>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle>Принять на склад</DialogTitle>
        </DialogHeader>
        <AcceptDialogForm deviceId={deviceId} onDone={close} />
      </DialogContent>
    </Dialog>
  )
}

// ─── Передать (assigned → assigned) ─────────────────────────────────────────

function TransferDialogForm({
  deviceId,
  employees,
  onDone,
}: {
  deviceId: number
  employees: EmployeeOption[]
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState(transferDeviceAction, {})
  useCloseOnOk(state, onDone)
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="deviceId" value={deviceId} />
      <EmployeePicker
        inputId="transfer-employeeId"
        label="Новый сотрудник"
        employees={employees}
        error={state.fieldErrors?.employeeId}
      />
      <OccurredAtField
        id="transfer-occurredAt"
        echoValue={state.values?.occurredAt}
        error={state.fieldErrors?.occurredAt}
      />
      <CommentField id="transfer-comment" echoValue={state.values?.comment} />
      {state.error ? (
        <p className={ERROR_CLASS} role="alert">
          {state.error}
        </p>
      ) : null}
      <DialogActions pendingCopy="Передача…" label="Передать" pending={pending} />
    </form>
  )
}

export function TransferDialog({
  deviceId,
  holderName,
  employees,
}: {
  deviceId: number
  holderName: string | null
  employees: EmployeeOption[]
}) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="secondary" size="xl" data-device-transfer-id={deviceId} />}>
        Передать
      </DialogTrigger>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle>Передать устройство</DialogTitle>
        </DialogHeader>
        {/* Read-only context line above the fields (04-UI-SPEC dialogs table). */}
        <p className={HINT_CLASS}>
          Сейчас у: {holderName ?? '—'}
        </p>
        <TransferDialogForm deviceId={deviceId} employees={employees} onDone={close} />
      </DialogContent>
    </Dialog>
  )
}

// ─── В ремонт / Из ремонта (D-04) ───────────────────────────────────────────

// Shared form of both repair directions: the only difference is the server
// action, the hint and the pending copy (04-UI-SPEC dialogs table).
function RepairDialogForm({
  deviceId,
  idPrefix,
  action,
  hint,
  pendingCopy,
  primaryLabel,
  onDone,
}: {
  deviceId: number
  idPrefix: string
  action: (prev: unknown, formData: FormData) => Promise<MovementFormState>
  hint: string | null
  pendingCopy: string
  primaryLabel: string
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState(action, {})
  useCloseOnOk(state, onDone)
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="deviceId" value={deviceId} />
      {hint ? <p className={HINT_CLASS}>{hint}</p> : null}
      <OccurredAtField
        id={`${idPrefix}-occurredAt`}
        echoValue={state.values?.occurredAt}
        error={state.fieldErrors?.occurredAt}
      />
      <CommentField id={`${idPrefix}-comment`} echoValue={state.values?.comment} />
      {state.error ? (
        <p className={ERROR_CLASS} role="alert">
          {state.error}
        </p>
      ) : null}
      <DialogActions
        pendingCopy={pendingCopy}
        label={primaryLabel}
        pending={pending}
      />
    </form>
  )
}

export function RepairDialog({
  deviceId,
  direction,
  holderName,
}: {
  deviceId: number
  direction: 'to_repair' | 'from_repair'
  holderName?: string | null
}) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  // «В ремонт» is a secondary trigger everywhere it appears; «Из ремонта» is
  // the repair card's ONE accent button — the forward action of the status
  // (04-UI-SPEC accent rule #2).
  const toRepair = direction === 'to_repair'
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant={toRepair ? 'secondary' : 'default'}
            size="xl"
            data-device-to-repair-id={toRepair ? deviceId : undefined}
            data-device-from-repair-id={toRepair ? undefined : deviceId}
          />
        }
      >
        {toRepair ? 'В ремонт' : 'Из ремонта'}
      </DialogTrigger>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle>
            {toRepair ? 'Отправить в ремонт' : 'Вернуть из ремонта'}
          </DialogTitle>
        </DialogHeader>
        {/* Portal-mounted: WR-01 clean state per dialog session. */}
        <RepairDialogForm
          deviceId={deviceId}
          idPrefix={toRepair ? 'to-repair' : 'from-repair'}
          action={toRepair ? sendToRepairDeviceAction : returnFromRepairDeviceAction}
          hint={
            toRepair
              ? holderName
                ? `Устройство будет автоматически принято у ${holderName}.`
                : null
              : 'Устройство вернётся на склад.'
          }
          pendingCopy={toRepair ? 'Отправляем…' : 'Возвращаем…'}
          primaryLabel={toRepair ? 'В ремонт' : 'Из ремонта'}
          onDone={close}
        />
      </DialogContent>
    </Dialog>
  )
}

// ─── Списать (→ disposed, ФИНАЛЬНО — D-03) ──────────────────────────────────

function DisposeDialogForm({
  deviceId,
  onDone,
}: {
  deviceId: number
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState(disposeDeviceAction, {})
  useCloseOnOk(state, onDone)
  const reasonError = state.fieldErrors?.comment
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="deviceId" value={deviceId} />
      {/* Finality warning (14, secondary) above the fields — copy table. */}
      <p className={HINT_CLASS}>
        Списание финально: устройство останется в базе только для просмотра,
        история сохранится.
      </p>
      {/* Причина списания IS the event comment — обязательна (D-03). */}
      <div className="space-y-2">
        <Label htmlFor="dispose-comment">Причина списания</Label>
        <Textarea
          id="dispose-comment"
          name="comment"
          required
          maxLength={500}
          rows={3}
          placeholder="Например: сгорела после скачка питания"
          defaultValue={state.values?.comment}
          className="px-3 text-base md:text-base"
          aria-invalid={reasonError ? true : undefined}
        />
        {reasonError ? <p className={ERROR_CLASS}>{reasonError}</p> : null}
      </div>
      <OccurredAtField
        id="dispose-occurredAt"
        echoValue={state.values?.occurredAt}
        error={state.fieldErrors?.occurredAt}
      />
      {state.error ? (
        <p className={ERROR_CLASS} role="alert">
          {state.error}
        </p>
      ) : null}
      <DialogFooter>
        {/* Mirrored negative on purpose: the irreversible action gets the
            deliberate dismissal (04-UI-SPEC dialogs table). */}
        <DialogClose render={<Button variant="secondary" />}>
          Не списывать
        </DialogClose>
        {/* The ONE red solid fill in the entire UI (D-03, color table):
            solid #D70015, white 14/600 text, slightly darker on hover. */}
        <Button
          type="submit"
          disabled={pending}
          className="bg-destructive font-semibold text-white hover:bg-destructive/90"
        >
          {pending ? 'Списываем…' : 'Списать'}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function DisposeDialog({ deviceId }: { deviceId: number }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Secondary trigger — the red fill itself lives INSIDE the dialog;
          the card row keeps its neutral discipline (04-UI-SPEC matrix). */}
      <DialogTrigger render={<Button variant="secondary" size="xl" data-device-dispose-id={deviceId} />}>
        Списать
      </DialogTrigger>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle>Списать устройство</DialogTitle>
        </DialogHeader>
        {/* Portal-mounted: WR-01 clean state per dialog session. */}
        <DisposeDialogForm deviceId={deviceId} onDone={close} />
      </DialogContent>
    </Dialog>
  )
}

// ─── Вернуть всю технику (employee card, D-07) ──────────────────────────────

function ReturnAllForm({
  employeeId,
  onDone,
}: {
  employeeId: number
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState(returnAllDevicesAction, {})
  useCloseOnOk(state, onDone)
  return (
    <>
      {state.error ? (
        <p className={ERROR_CLASS} role="alert">
          {state.error}
        </p>
      ) : null}
      <form action={formAction}>
        <input type="hidden" name="id" value={employeeId} />
        <DialogFooter>
          <DialogClose render={<Button variant="secondary" />}>Отмена</DialogClose>
          {/* Neutral solid ink — a SAFE operation (devices stay in stock);
              archive-confirm precedent, red stays reserved for «Списать». */}
          <Button
            type="submit"
            disabled={pending}
            className="bg-ink font-semibold text-white hover:bg-ink/90"
          >
            {pending ? 'Возвращаем…' : 'Вернуть всю технику'}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

export function ReturnAllDialog({
  employeeId,
  count,
}: {
  employeeId: number
  count: number
}) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="secondary" size="xl" data-return-all-id={employeeId} />}>
        Вернуть всю технику
      </DialogTrigger>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle>Вернуть всю технику?</DialogTitle>
        </DialogHeader>
        <p className="text-base text-ink">
          Вся техника — {pluralDevices(count)} — вернётся на склад; для каждой
          единицы будет записано своё событие возврата.
        </p>
        <ReturnAllForm employeeId={employeeId} onDone={close} />
      </DialogContent>
    </Dialog>
  )
}
