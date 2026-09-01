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
import { createEmployeeAction, updateEmployeeAction } from './actions'

// Create/EDIT employee dialog — one component, two modes (UI-SPEC «Create/Edit
// dialog»). An `employee` prop switches to edit mode: fields prefill from it,
// a hidden id rides to updateEmployeeAction, primary copy becomes «Сохранить
// изменения». The department field is a plain text Input for now — the value
// is the department NAME and the server resolves it identically for existing
// and new departments, so in 02-03 this becomes a combobox: a pure UI swap
// with no architectural change (same contract, same field name).
export function EmployeeDialog({
  label,
  employee,
}: {
  label: string
  employee?: { id: number; name: string; department: string }
}) {
  const editing = employee !== undefined
  const [state, formAction, pending] = useActionState(
    editing ? updateEmployeeAction : createEmployeeAction,
    {},
  )
  const [open, setOpen] = useState(false)

  // The action already called refresh() — closing on the fresh state object
  // (a new identity on every action response) shows the updated page behind
  // the dialog immediately.
  useEffect(() => {
    if (state.ok) setOpen(false)
  }, [state])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button size="xl" data-employee-id={employee?.id} />}
      >
        {label}
      </DialogTrigger>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Редактировать сотрудника' : 'Новый сотрудник'}
          </DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {editing ? (
            <input type="hidden" name="id" value={employee.id} />
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="employee-name">Имя</Label>
            <Input
              id="employee-name"
              name="name"
              placeholder="Иван Иванов"
              autoComplete="off"
              defaultValue={employee?.name}
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
              defaultValue={employee?.department}
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
              {pending
                ? 'Сохранение…'
                : editing
                  ? 'Сохранить изменения'
                  : label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
