'use client'

import { useActionState, useEffect, useState } from 'react'
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
export function ArchiveConfirmDialog({
  employeeId,
  employeeName,
}: {
  employeeId: number
  employeeName: string
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState(
    setEmployeeArchivedAction,
    {},
  )

  // ok → the action has already refreshed the route: closing reveals the
  // same card with the «В архиве» badge and the «Разархивировать» button —
  // no redirect (UI-SPEC Open Question 2: we stay on the card).
  useEffect(() => {
    if (state.ok) setOpen(false)
  }, [state])

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
      </DialogContent>
    </Dialog>
  )
}
