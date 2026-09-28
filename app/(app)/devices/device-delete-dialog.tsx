'use client'

import { useActionState, useState } from 'react'
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
import { pluralMovementRecords } from '@/lib/ru'
import { deleteDeviceAction } from '@/app/(app)/devices/actions'

// Device-delete confirm (phase 13, DEL-01..02, D-02) — the third red-solid
// installation (after «Списать» and the timeline's «Удалить запись»): copy is
// byte-exact from 13-UI-SPEC Copywriting Contract; the identity block renders
// in NEUTRAL ink — red is only the consequence button and the quiet zone
// trigger scoping it, never the content.

// Quiet zone trigger (D-01): 14/400 destructive red at rest — a standalone
// danger zone at the card bottom, not an action inside a record (that is why
// it is red at rest, unlike the neutral timeline row triggers). ≥44px hit
// area grown via ::after inset — the timeline ROW_ACTION_CLASS recipe, never
// visible padding (13-UI-SPEC Spacing).
const ZONE_TRIGGER_CLASS =
  'relative text-sm text-destructive transition-[color,transform] duration-100 ease-out hover:text-destructive/80 active:scale-[0.97] after:absolute after:content-[""] after:-inset-x-2 after:-inset-y-3'

// WR-01: the wrapper below stays mounted (it owns the trigger and the open
// state), so `useActionState` must NOT live there — it would keep a failed
// submit's role=alert alive across close/reopen. This inner component owns
// the form + action state; the dialog portal unmounts its children once the
// close animation finishes, so every open session starts from a clean state.
// There is no ok-effect: success ends in redirect('/devices') — the island
// never sees an ok-state, the dialog unmounts with the page.
function DeviceDeleteForm({ deviceId }: { deviceId: number }) {
  const [state, formAction, pending] = useActionState(deleteDeviceAction, {})

  return (
    <>
      {state.error ? (
        <p className="text-sm text-[#D70015]" role="alert">
          {state.error}
        </p>
      ) : null}
      <form action={formAction}>
        <input type="hidden" name="deviceId" value={deviceId} />
        <DialogFooter>
          {/* Mirrored negative on purpose (dispose precedent). */}
          <DialogClose render={<Button variant="secondary" />}>
            Не удалять
          </DialogClose>
          {/* The third red solid fill in the UI (13-UI-SPEC color table):
              the most irreversible destruction of the family. */}
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

// Flat server-serialized snapshot (vercel server-serialization): strings and
// numbers only — no Date objects, no query rows (the dialogDeviceOf
// discipline of the card page). Counts ride as plain numbers — page.tsx
// passes the .length of the already-computed listTimeline/listByDevice.
export function DeviceDeleteDialog({
  deviceId,
  model,
  serialNumber,
  inventoryNumber,
  historyCount,
  photoCount,
}: {
  deviceId: number
  model: string
  serialNumber: string | null
  inventoryNumber: string | null
  historyCount: number
  photoCount: number
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button type="button" data-device-delete className={ZONE_TRIGGER_CLASS} />
        }
      >
        Удалить устройство
      </DialogTrigger>
      <DialogContent className="max-w-md p-6 *:min-w-0">
        <DialogHeader>
          <DialogTitle>Удалить устройство?</DialogTitle>
        </DialogHeader>
        {/* Identity block — neutral ink (red marks the consequence, not the
            content). Long model/serial/inventory wrap inside max-w-md
            (break-words + *:min-w-0) without pushing the footer. */}
        <div>
          <p className="break-words text-sm font-semibold text-ink">
            {model}
          </p>
          <div className="space-y-1">
            <p className="text-sm text-ink-secondary">
              Серийный номер:{' '}
              {serialNumber === null ? (
                <span className="text-ink-secondary">—</span>
              ) : (
                <span className="break-words font-mono text-sm text-ink">
                  {serialNumber}
                </span>
              )}
            </p>
            <p className="text-sm text-ink-secondary">
              Инвентарный номер:{' '}
              {inventoryNumber === null ? (
                <span className="text-ink-secondary">—</span>
              ) : (
                <span className="break-words font-mono text-sm text-ink">
                  {inventoryNumber}
                </span>
              )}
            </p>
          </div>
        </div>
        {/* Counters hint (D-02): the complete consequence statement; «фото»
            is indeclinable — pluralMovementRecords forms only the records
            word. The 0/0 clone baby sees the same sentence. */}
        <p className="mt-3 text-sm text-ink-secondary">
          {pluralMovementRecords(historyCount)} истории и {photoCount} фото
          будут удалены безвозвратно.
        </p>
        {/* Rendered inside the portal: mounts with the dialog session and
            unmounts after the close animation — WR-01 state reset. */}
        <DeviceDeleteForm deviceId={deviceId} />
      </DialogContent>
    </Dialog>
  )
}
