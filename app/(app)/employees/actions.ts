'use server'

import { z } from 'zod'
import { refresh } from 'next/cache'
import { requireSession } from '@/lib/auth'
import {
  createEmployee,
  updateEmployee,
  setEmployeeArchived,
} from '@/db/queries/employees'

// Server Actions are directly POST-able — the proxy perimeter does not cover
// them — so requireSession() is the FIRST line of every action (T-02-01).
// Inputs are whitelisted through zod schemas (T-02-04): no raw FormData
// spreads into .set(). Only the generic Russian failure string leaves the
// action (V7); field-level errors come from the UI-SPEC copy table.

const SAVE_ERROR = 'Не удалось сохранить. Попробуйте ещё раз.'

const EmployeeFields = {
  name: z.string().trim().min(1).max(100),
  departmentName: z.string().trim().min(1).max(80),
}

const CreateSchema = z.object(EmployeeFields)

const UpdateSchema = z.object({
  id: z.coerce.number().int().positive(),
  ...EmployeeFields,
})

const ArchiveSchema = z.object({
  id: z.coerce.number().int().positive(),
  // Hidden input carries 'true' | 'false' — never coerce truthiness.
  archived: z.enum(['true', 'false']).transform((v) => v === 'true'),
})

export type EmployeeFormState = {
  ok?: boolean
  error?: string
  fieldErrors?: { name?: string; departmentName?: string }
}

// Map zod issues onto the UI-SPEC inline copy (14/400 #D70015 under field).
function fieldErrorsOf(error: z.ZodError): EmployeeFormState['fieldErrors'] {
  const fieldErrors: EmployeeFormState['fieldErrors'] = {}
  for (const issue of error.issues) {
    const field = issue.path[0]
    if (field === 'name') fieldErrors.name = 'Введите имя сотрудника'
    if (field === 'departmentName') fieldErrors.departmentName = 'Выберите отдел'
  }
  return fieldErrors
}

export async function createEmployeeAction(
  _prev: unknown,
  formData: FormData,
): Promise<EmployeeFormState> {
  await requireSession()
  const parsed = CreateSchema.safeParse({
    name: formData.get('name'),
    departmentName: formData.get('departmentName'),
  })
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error) }
  try {
    createEmployee(parsed.data)
  } catch {
    return { error: SAVE_ERROR }
  }
  // Without refresh() the route is NOT re-rendered in the action response
  // (Pitfall 1) — the new employee would not appear until a manual reload.
  refresh()
  return { ok: true }
}

export async function updateEmployeeAction(
  _prev: unknown,
  formData: FormData,
): Promise<EmployeeFormState> {
  await requireSession()
  const parsed = UpdateSchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    departmentName: formData.get('departmentName'),
  })
  if (!parsed.success) {
    if (parsed.error.issues.some((i) => i.path[0] === 'id')) {
      return { error: SAVE_ERROR }
    }
    return { fieldErrors: fieldErrorsOf(parsed.error) }
  }
  try {
    updateEmployee(parsed.data.id, {
      name: parsed.data.name,
      departmentName: parsed.data.departmentName,
    })
  } catch {
    return { error: SAVE_ERROR }
  }
  refresh()
  return { ok: true }
}

export async function setEmployeeArchivedAction(
  _prev: unknown,
  formData: FormData,
): Promise<EmployeeFormState> {
  await requireSession()
  const parsed = ArchiveSchema.safeParse({
    id: formData.get('id'),
    archived: formData.get('archived'),
  })
  if (!parsed.success) return { error: SAVE_ERROR }
  try {
    setEmployeeArchived(parsed.data.id, parsed.data.archived)
  } catch {
    return { error: SAVE_ERROR }
  }
  refresh()
  return { ok: true }
}
