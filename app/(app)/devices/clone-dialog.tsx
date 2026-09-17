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
import { nextInventoryNumber } from '@/lib/inventory-increment'
import { pluralDevices } from '@/lib/ru'
import { cloneDeviceAction, type CloneFormState } from './actions'

// Клон-диалог карточки (REG-06, D-01) — третий installation диалогового
// семейства movement-dialogs, механика байт-в-байт (WR-01 split: обёртка
// владеет триггером и open-state и ОСТАЁТСЯ смонтированной, useActionState
// живёт во внутренней форме — портал размонтирует её при закрытии, каждая
// сессия начинается с чистого состояния). Отличия от movement-диалогов:
// onDone(created: number) прокидывает count наверх (Default 12), а линия
// успеха «Создано {pluralDevices(n)}» принадлежит обёртке — тихий ink, без
// тоста и без зелёного/accent (UI-SPEC Defaults 8/9); никакого живого
// превью последовательности — сервер пересчитывает серию авторитетно
// (Pitfall 7).
//
// inventoryNumber — RAW значение оригинала (никогда normalized, Pitfall 4):
// подсказка = nextInventoryNumber(raw), та же pure-функция, что сворачивает
// серверную серию (D-02 — один источник).

const CONTROL_CLASS = 'h-10 px-3 text-base md:text-base'
const ERROR_CLASS = 'text-sm text-[#D70015]'
const HINT_CLASS = 'text-sm text-ink-secondary'

// Stable ok-effect shared by every dialog form (movement-dialogs recipe); the
// clone's onDone carries the created count up to the wrapper's success line.
function useCloseOnOk(state: CloneFormState, onDone: (created: number) => void) {
  useEffect(() => {
    if (state.ok) onDone(state.created ?? 0)
  }, [state, onDone])
}

// Shared footer: dismiss (secondary) + pending-aware primary (right) —
// the movement-dialogs DialogActions verbatim.
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

function CloneDialogForm({
  deviceId,
  suggested,
  onDone,
}: {
  deviceId: number
  suggested: string
  onDone: (created: number) => void
}) {
  const [state, formAction, pending] = useActionState(cloneDeviceAction, {})
  useCloseOnOk(state, onDone)
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="deviceId" value={deviceId} />
      {/* Transparency hint (UI-SPEC copy table): D-04/D-05 made visible. */}
      <p className={HINT_CLASS}>
        Копии появятся на складе: с закупкой и характеристиками оригинала,
        без серийника, заметок, фото и истории.
      </p>
      <div className="space-y-2">
        <Label htmlFor="clone-count">Количество</Label>
        <Input
          id="clone-count"
          name="count"
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          step={1}
          autoComplete="off"
          defaultValue={state.values?.count ?? '1'}
          className={`${CONTROL_CLASS} w-24`}
          aria-invalid={state.fieldErrors?.count ? true : undefined}
        />
        {state.fieldErrors?.count ? (
          <p className={ERROR_CLASS}>{state.fieldErrors.count}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="clone-inventoryNumber">Инвентарный номер</Label>
        <Input
          id="clone-inventoryNumber"
          name="inventoryNumber"
          type="text"
          autoComplete="off"
          maxLength={80}
          placeholder="Из 1С, если присвоен"
          defaultValue={state.values?.inventoryNumber ?? suggested}
          className={`${CONTROL_CLASS} font-mono`}
          aria-invalid={state.fieldErrors?.inventoryNumber ? true : undefined}
        />
        <p className={HINT_CLASS}>
          Первый номер серии — остальные по порядку.
        </p>
        {state.fieldErrors?.inventoryNumber ? (
          <p className={ERROR_CLASS}>{state.fieldErrors.inventoryNumber}</p>
        ) : null}
      </div>
      {state.error ? (
        <p className={ERROR_CLASS} role="alert">
          {state.error}
        </p>
      ) : null}
      <DialogActions
        pendingCopy="Создаём копии…"
        label="Дублировать"
        pending={pending}
      />
    </form>
  )
}

export function CloneDialog({
  deviceId,
  inventoryNumber,
}: {
  deviceId: number
  inventoryNumber: string | null
}) {
  const [open, setOpen] = useState(false)
  // The success line (D-07): stays on the original's card after close,
  // survives refresh() (the island persists), cleared on next dialog open.
  const [created, setCreated] = useState<number | null>(null)
  const handleDone = useCallback((n: number) => {
    setCreated(n)
    setOpen(false)
  }, [])
  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next)
    if (next) setCreated(null)
  }, [])
  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        {/* Secondary — the card's ONE accent stays the custody transition
            (04-UI-SPEC accent discipline; UI-SPEC Default 2). */}
        <DialogTrigger
          render={<Button variant="secondary" size="xl" data-device-clone-id={deviceId} />}
        >
          Дублировать
        </DialogTrigger>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle>Дублировать устройство</DialogTitle>
          </DialogHeader>
          {/* Portal-mounted: WR-01 clean state per dialog session. */}
          <CloneDialogForm
            deviceId={deviceId}
            suggested={nextInventoryNumber(inventoryNumber)}
            onDone={handleDone}
          />
        </DialogContent>
      </Dialog>
      {/* w-full forces the line onto its own wrapped row below the buttons
          (the wrapper lives inside the flex action row). */}
      {created !== null ? (
        <p className="mt-2 w-full text-sm text-ink" data-clone-created={created}>
          Создано {pluralDevices(created)}
        </p>
      ) : null}
    </>
  )
}
