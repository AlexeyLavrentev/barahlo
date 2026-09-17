'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
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
import { deviceStatusLabel } from '@/lib/device-schema'
import type { EmployeeOption } from '@/db/queries/movements'
import { bulkAssignDevicesAction, type BulkFormState } from './actions'
import type { DeviceBulkRow } from './device-bulk'

// Диалоги партии (MOVE-06, D-04/D-05/D-06) — четвёртая installation
// диалогового семейства movement-dialogs; механика копируется дословно
// (прецедент clone-dialog: отдельный файл, копия, не абстракция).
//
// WR-01 split: обёртка владеет open-state (открывается плавающей панелью,
// без триггера) и ОСТАЁТСЯ смонтированной; useActionState живёт во
// внутренней форме — портал размонтирует её при закрытии, каждая сессия
// начинается с чистого состояния.
//
// Отличия от одиночных movement-диалогов:
// - скрытых deviceIds-инпутов по ОДНОМУ на id — экшен собирает getAll'ом;
// - при state.blockers форма ОСТАЁТСЯ (echo нетронут, выделение на месте —
//   SC 4) и рендерит над кнопками отчёт «какая единица и почему» (SC 3);
// - при state.ok внутренняя форма рендерит ОТЧЁТ вместо полей — диалог НЕ
//   закрывается (не тост, не редирект), футер становится одним «Закрыть»,
//   а ok-эффект вызывает provider clear() — ЕДИНСТВЕННАЯ точка сброса
//   выделения (D-06, Pitfall 5).

const CONTROL_CLASS = 'h-10 px-3 text-base md:text-base'
const ERROR_CLASS = 'text-sm text-[#D70015]'
const HINT_CLASS = 'text-sm text-ink-secondary'
// Отчёт/blocker-списки (UI-SPEC): 20 строк скроллятся, шелл не растягивается.
const LIST_CLASS = 'max-h-64 space-y-2 overflow-y-auto'

// Local yyyy-mm-dd for the date prefill/max — NEVER toISOString().slice(0,10),
// that is the UTC date and drifts after midnight in any TZ east of UTC
// (movement-dialogs recipe verbatim).
function todayLocal(): string {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${mm}-${dd}`
}

// EmployeePicker over ACTIVE employees only — movement-dialogs recipe
// verbatim (Ё/ё fold, value = имя, id через hidden input, два zero-state).
// Bulk-расширение: onPick прокидывает выбранный объект наверх — имя нужно
// success-отчёту («выдано {ФИО}»), а пикер размонтируется вместе с полями
// при переключении формы в отчёт.
function EmployeePicker({
  inputId,
  label,
  employees,
  error,
  onPick,
}: {
  inputId: string
  label: string
  employees: EmployeeOption[]
  error?: string
  onPick?: (employee: EmployeeOption) => void
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
            onPick?.(picked)
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
          name="employeeId"
          value={selected ? String(selected.id) : ''}
        />
      </Combobox>
      {error ? <p className={ERROR_CLASS}>{error}</p> : null}
    </div>
  )
}

// «Дата события» — today prefill + max (movement-dialogs recipe verbatim).
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

// «Комментарий» — one-line optional input (movement-dialogs recipe verbatim).
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

// Ok-effect bulk-вариант (movement-dialogs useCloseOnOk recipe): НЕ закрывает
// диалог, а сбрасывает выделение — единственная точка clear() (D-06).
function useClearOnOk(state: BulkFormState, onOk: () => void) {
  useEffect(() => {
    if (state.ok) onOk()
  }, [state, onOk])
}

// Blocker-вью (D-03, SC 3): красное intro + объяснение preconditions + строка
// на каждую блокирующую единицу «модель · инвентарник · статус». Инвентарник
// маппится с rows-props по id (blocker несёт только id/model/status);
// отсутствующий id → one-off «Не найдено», статусы — только keystone-словарь.
function BlockerView({
  blockers,
  rows,
  explanation,
}: {
  blockers: NonNullable<BulkFormState['blockers']>
  rows: DeviceBulkRow[]
  explanation: string
}) {
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])
  return (
    <div className="space-y-2">
      <p className={ERROR_CLASS} role="alert">
        Операция не выполнена: ничего не записано.
      </p>
      <p className={HINT_CLASS}>{explanation}</p>
      <div className={LIST_CLASS} data-bulk-blockers>
        {blockers.map((blocker) => (
          <p key={blocker.id} className="text-sm text-ink">
            {blocker.model}
            {' · '}
            <span className="font-mono">
              {byId.get(blocker.id)?.inventoryNumber ?? '—'}
            </span>
            {' · '}
            {blocker.status === 'not_found'
              ? 'Не найдено'
              : deviceStatusLabel(blocker.status)}
          </p>
        ))}
      </div>
    </div>
  )
}

function BulkAssignForm({
  rows,
  employees,
  deviceIds,
  onOk,
}: {
  rows: DeviceBulkRow[]
  employees: EmployeeOption[]
  deviceIds: number[]
  onOk: () => void
}) {
  const [state, formAction, pending] = useActionState(
    bulkAssignDevicesAction,
    {},
  )
  useClearOnOk(state, onOk)
  // Имя для «выдано {ФИО}» — клиентский выбор пикера (Open Question 3);
  // сервер остаётся авторитетным по факту и типу события.
  const [assignee, setAssignee] = useState<EmployeeOption | null>(null)
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])

  // Success-вью (D-05): отчёт вместо полей, диалог открыт, футер — «Закрыть».
  if (state.ok) {
    const results = state.results ?? []
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink">Записано: {results.length}</p>
        <div className={LIST_CLASS} data-bulk-report>
          {results.map((result) => {
            const row = byId.get(result.deviceId)
            return (
              <p key={result.deviceId} className="text-sm text-ink">
                {row?.model ?? '—'}
                {' · '}
                <span className="font-mono">
                  {row?.inventoryNumber ?? '—'}
                </span>
                {' · '}
                выдано {assignee?.name ?? '—'}
              </p>
            )
          })}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="secondary" />}>
            Закрыть
          </DialogClose>
        </DialogFooter>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      {/* Скрытый инпут на КАЖДЫЙ id — экшен собирает formData.getAll('deviceIds'). */}
      {deviceIds.map((id) => (
        <input key={id} type="hidden" name="deviceIds" value={id} />
      ))}
      <p className={HINT_CLASS}>
        В партии {pluralDevices(deviceIds.length)} — один сотрудник и одна дата
        события на все.
      </p>
      <EmployeePicker
        inputId="bulk-assign-employeeId"
        label="Сотрудник"
        employees={employees}
        error={state.fieldErrors?.employeeId}
        onPick={setAssignee}
      />
      <OccurredAtField
        id="bulk-assign-occurredAt"
        echoValue={state.values?.occurredAt}
        error={state.fieldErrors?.occurredAt}
      />
      <CommentField id="bulk-assign-comment" echoValue={state.values?.comment} />
      {/* Blocker-вью: форма и выделение нетронуты (SC 4), ноль записей (D-03). */}
      {state.blockers && state.blockers.length > 0 ? (
        <BlockerView
          blockers={state.blockers}
          rows={rows}
          explanation="Выдать можно только устройства со статусом «На складе»."
        />
      ) : null}
      {state.error ? (
        <p className={ERROR_CLASS} role="alert">
          {state.error}
        </p>
      ) : null}
      <DialogFooter>
        <DialogClose render={<Button variant="secondary" />}>Отмена</DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? 'Выдача…' : 'Выдать'}
        </Button>
      </DialogFooter>
    </form>
  )
}

// Обёртка (WR-01): controlled open-state без триггера — открывается панелью
// selection-острова и остаётся смонтированной; портал размонтирует внутреннюю
// форму при закрытии → чистая сессия на каждое открытие.
export function BulkAssignDialog({
  open,
  onOpenChange,
  rows,
  employees,
  deviceIds,
  onOk,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rows: DeviceBulkRow[]
  employees: EmployeeOption[]
  deviceIds: number[]
  onOk: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle>Выдать устройства</DialogTitle>
        </DialogHeader>
        <BulkAssignForm
          rows={rows}
          employees={employees}
          deviceIds={deviceIds}
          onOk={onOk}
        />
      </DialogContent>
    </Dialog>
  )
}
