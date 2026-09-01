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
import { setEmployeeArchivedAction } from './actions'

// Archive confirmation (D-02, EMP-03): the only off-list path gets one
// friction-of-awareness step. Copy is verbatim from the UI-SPEC copy table;
// the employee name renders as a React text node (escaped — never markup,
// T-02-03). The primary button is deliberately NEUTRAL ink, not red and not
// the accent: archive is reversible (apple-design principle 2 — red is
// reserved for genuinely harmful, irreversible actions; UI-SPEC leaves
// #D70015 to Phase 4 «Списать»).

// WR-01: the wrapper below stays mounted (it owns the trigger and the open
// state), so `useActionState` must NOT live there — it would keep a failed
// submit's role=alert alive across close/reopen. This inner component owns
// the form + action state; the dialog portal unmounts its children once the
// close animation finishes, so every open session starts from a clean state.
function ArchiveConfirmForm({
  employeeId,
  onDone,
}: {
  employeeId: number
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState(
    setEmployeeArchivedAction,
    {},
  )

  // ok → the action has already refreshed the route: closing reveals the
  // same card with the «В архиве» badge and the «Разархивировать» button —
  // no redirect (UI-SPEC Open Question 2: we stay on the card).
  useEffect(() => {
    if (state.ok) onDone()
  }, [state, onDone])

  return (
    <>
      {state.error ? (
        <p className="text-sm text-[#D70015]" role="alert">
          {state.error}
        </p>
      ) : null}

      <form action={formAction}>
        <input type="hidden" name="id" value={employeeId} />
        <input type="hidden" name="archived" value="true" />
        <DialogFooter>
          <DialogClose render={<Button variant="secondary" />}>
            Не архивировать
          </DialogClose>
          <Button
            type="submit"
            disabled={pending}
            className="bg-ink font-semibold text-white hover:bg-ink/90"
          >
            {pending ? 'Архивирование…' : 'Архивировать'}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

export function ArchiveConfirmDialog({
  employeeId,
  employeeName,
}: {
  employeeId: number
  employeeName: string
}) {
  const [open, setOpen] = useState(false)
  // Stable identity so the form's ok-effect keyed on [state, onDone] fires
  // per action response, not per parent render.
  const close = useCallback(() => setOpen(false), [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="secondary" size="xl" />}>
        Архивировать
      </DialogTrigger>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle>Архивировать сотрудника?</DialogTitle>
        </DialogHeader>
        <p className="text-base text-ink">
          {employeeName} исчезнет из рабочих списков, но останется в базе
          вместе с историей. Вернуть можно в любой момент.
        </p>
        {/* Rendered inside the portal: mounts with the dialog session and
            unmounts after the close animation — WR-01 state reset. */}
        <ArchiveConfirmForm employeeId={employeeId} onDone={close} />
      </DialogContent>
    </Dialog>
  )
}
