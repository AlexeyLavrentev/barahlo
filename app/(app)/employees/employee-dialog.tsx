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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createEmployeeAction } from './actions'

// Create-employee dialog (UI-SPEC «Create/Edit dialog»). The department
// field is a plain text Input for this tracer slice — the value is the
// department NAME and the server resolves it identically for existing and
// new departments, so in 02-03 this becomes a combobox: a pure UI swap with
// no architectural change (same contract, same field name).
export function EmployeeDialog({ label }: { label: string }) {
  const [state, formAction, pending] = useActionState(createEmployeeAction, {})
  const [open, setOpen] = useState(false)

  // The action already called refresh() — closing on the fresh state object
  // (a new identity on every action response) shows the updated list behind
  // the dialog immediately, including for a second employee in a row.
  useEffect(() => {
    if (state.ok) setOpen(false)
  }, [state])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="xl" />}>{label}</DialogTrigger>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle>Добавить сотрудника</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="employee-name">Имя</Label>
            <Input
              id="employee-name"
              name="name"
              placeholder="Иван Иванов"
              autoComplete="off"
              className="h-10 px-3 text-base md:text-base"
              aria-invalid={state.fieldErrors?.name ? true : undefined}
            />
            {state.fieldErrors?.name ? (
              <p className="text-sm text-[#D70015]">{state.fieldErrors.name}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="employee-department">Отдел</Label>
            <Input
              id="employee-department"
              name="departmentName"
              placeholder="Выберите или введите отдел"
              autoComplete="off"
              className="h-10 px-3 text-base md:text-base"
              aria-invalid={state.fieldErrors?.departmentName ? true : undefined}
            />
            {state.fieldErrors?.departmentName ? (
              <p className="text-sm text-[#D70015]">
                {state.fieldErrors.departmentName}
              </p>
            ) : null}
          </div>

          {state.error ? (
            <p className="text-sm text-[#D70015]" role="alert">
              {state.error}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose render={<Button variant="secondary" />}>
              Не сохранять
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? 'Сохранение…' : label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
