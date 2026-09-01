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
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { ruCollator } from '@/lib/ru'
import type { DepartmentRow } from '@/db/queries/employees'
import { createEmployeeAction, updateEmployeeAction } from './actions'

// Create/EDIT employee dialog — one component, two modes (UI-SPEC «Create/Edit
// dialog»). An `employee` prop switches to edit mode: fields prefill from it,
// a hidden id rides to updateEmployeeAction, primary copy becomes «Сохранить
// изменения».
//
// The department field is a combobox over the `departments` prop (D-03):
// options filter as you type (empty input shows the full list — never a dead
// dropdown), the exact-match row carries the accent checkmark, and a typed
// name without an exact match pins a FIRST option «Создать „{ввод}“» that
// Enter or a click selects. Selection ONLY records the name in the hidden
// departmentName input — the server's resolveDepartmentId creates the
// department inside its transaction, and a lost UNIQUE race silently reuses
// the winning row, so no «already exists» UI state exists by design
// (RESEARCH Pattern 3).

// Case- and Ё-insensitive matching for the option list. The pinned create
// option uses byte-exact comparison instead, mirroring departments_name_uq
// and the server resolve — the UI must never promise a merge the DB won't do.
function foldRu(s: string): string {
  return s.toLowerCase().replaceAll('ё', 'е')
}

export function EmployeeDialog({
  label,
  departments,
  employee,
}: {
  label: string
  departments: DepartmentRow[]
  employee?: { id: number; name: string; department: string }
}) {
  const editing = employee !== undefined
  const [state, formAction, pending] = useActionState(
    editing ? updateEmployeeAction : createEmployeeAction,
    {},
  )
  const [open, setOpen] = useState(false)
  // The submitted name IS the trigger text: the hidden input mirrors the
  // combobox input, so what the user sees is exactly what the server resolves.
  const [inputValue, setInputValue] = useState(employee?.department ?? '')

  // The action already called refresh() — closing on the fresh state object
  // (a new identity on every action response) shows the updated page behind
  // the dialog immediately.
  useEffect(() => {
    if (state.ok) setOpen(false)
  }, [state])

  // Client-side RU ordering of the option list (UI-SPEC: Intl.Collator('ru')).
  // listDepartments() pre-sorts in SQL; the combobox re-sorts its small copy
  // so ordering never depends on the server roundtrip shape.
  const sorted = [...departments].sort((a, b) => ruCollator.compare(a.name, b.name))
  const query = inputValue.trim()
  const matches =
    query === ''
      ? sorted
      : sorted.filter((d) => foldRu(d.name).includes(foldRu(query)))
  const exact = query === '' ? undefined : sorted.find((d) => d.name === query)
  const showCreate = query !== '' && !exact

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // Reopen on the employee's current values, never stale input.
        if (next) setInputValue(employee?.department ?? '')
      }}
    >
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
              maxLength={100}
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
            <Combobox
              // Options are filtered and ordered in JSX below — disable the
              // primitive's internal filtering of rendered items.
              filter={null}
              // While typing, the first row (the pinned «Создать „X“» when
              // present) is highlighted so Enter selects it.
              autoHighlight
              inputValue={inputValue}
              onInputValueChange={setInputValue}
              value={exact ? exact.name : null}
              onValueChange={(value) => {
                if (value !== null) setInputValue(value)
              }}
            >
              <ComboboxInput
                id="employee-department"
                placeholder="Выберите или введите отдел"
                autoComplete="off"
                maxLength={80}
                aria-invalid={
                  state.fieldErrors?.departmentName ? true : undefined
                }
                className="h-10 w-full"
                inputClassName="h-full px-3 text-base md:text-base"
              />
              <ComboboxContent>
                <ComboboxList>
                  {showCreate ? (
                    <ComboboxItem value={query}>
                      Создать „{query}“
                    </ComboboxItem>
                  ) : null}
                  {matches.map((d) => (
                    <ComboboxItem key={d.id} value={d.name}>
                      {d.name}
                    </ComboboxItem>
                  ))}
                  {matches.length === 0 && !showCreate ? (
                    <p className="px-3 py-2 text-sm text-ink-secondary">
                      Начните вводить название отдела
                    </p>
                  ) : null}
                </ComboboxList>
              </ComboboxContent>
              {/* The name rides to the action as departmentName; the server
                  resolves-or-creates it race-safely in its transaction. */}
              <input type="hidden" name="departmentName" value={query} />
            </Combobox>
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
