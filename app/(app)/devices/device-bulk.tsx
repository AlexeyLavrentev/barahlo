'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { EmployeeOption } from '@/db/queries/movements'
import { BulkAcceptDialog, BulkAssignDialog } from './bulk-dialogs'

// Selection-остров списка устройств (MOVE-06, D-01): первый в приложении
// context-провайдер. Владеет Set<number> выделенных id СТРОГО в пределах
// страницы; строки остаются server-rendered — провайдер принимает их
// children'ом (children-composition: контекст обновляется — children-prop
// стабилен, перерисовываются только чекбоксы-листья). Плоские serializable
// props — никаких функций через RSC-границу (query-params.ts header rule).
//
// Сброс выделения (D-01, Pitfall 2): страница монтирует провайдер с
// key={buildDevicesQuery(filters, current)} — любой переход (пагинация,
// фильтры, поиск) меняет ключ → остров размонтируется → чистый Set. Это
// нейтрализует документированное «island persists» (clone-dialog), которое
// иначе протаскивало бы стейт сквозь серверную подмену контента.
//
// В рантайме Set очищается ТОЛЬКО двумя точками: кнопка «Снять выделение»
// (не destructive, без подтверждения) и ok-эффект bulk-диалогов после
// ПОДТВЕРЖДЁННОГО успеха (D-06, Pitfall 5). Ошибки валидации и blockers
// выделение сохраняют (SC 4). Никакого клиентского дизейба по статусам
// строк — eligibility решает сервер (D-02).

export type DeviceBulkRow = {
  id: number
  model: string
  inventoryNumber: string | null
  status: string
}

type DeviceBulkContextValue = {
  selected: ReadonlySet<number>
  rows: DeviceBulkRow[]
  toggle: (id: number) => void
  toggleAll: () => void
  clear: () => void
}

const DeviceBulkContext = createContext<DeviceBulkContextValue | null>(null)

function useDeviceBulk(): DeviceBulkContextValue {
  const ctx = useContext(DeviceBulkContext)
  if (!ctx) {
    throw new Error('useDeviceBulk must be used within DeviceBulkProvider')
  }
  return ctx
}

export function DeviceBulkProvider({
  rows,
  employees,
  children,
}: {
  rows: DeviceBulkRow[]
  employees: EmployeeOption[]
  children: ReactNode
}) {
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  const [assignOpen, setAssignOpen] = useState(false)
  const [acceptOpen, setAcceptOpen] = useState(false)

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // Tri-state клик (A4): частично/всё → снять всё; пусто → вся страница.
  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)),
    )
  }, [rows])

  const clear = useCallback(() => setSelected(new Set()), [])

  const value = useMemo(
    () => ({ selected, rows, toggle, toggleAll, clear }),
    [selected, rows, toggle, toggleAll, clear],
  )

  return (
    <DeviceBulkContext.Provider value={value}>
      {children}
      {/* Спейсер страницы (UI-SPEC Default 16, клиентский эквивалент pb-24 —
          section серверный): пагинация остаётся достижимой под панелью;
          схлопывается вместе с панелью. */}
      {selected.size > 0 ? <div className="h-24" aria-hidden /> : null}
      {selected.size > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center">
          <div
            data-bulk-panel
            className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-white py-2 pr-2 pl-4 shadow-lg ring-1 ring-hairline"
          >
            <span className="text-sm text-ink" data-bulk-count={selected.size}>
              Выбрано: {selected.size}
            </span>
            {/* Одна accent-кнопка панели = forward custody transition
                (04-UI-SPEC accent discipline, UI-SPEC Default 2). */}
            <Button size="xl" onClick={() => setAssignOpen(true)}>
              Выдать
            </Button>
            <Button
              variant="secondary"
              size="xl"
              onClick={() => setAcceptOpen(true)}
            >
              Принять
            </Button>
            <button
              type="button"
              onClick={clear}
              className="text-sm text-ink-secondary transition-colors duration-150 ease-out hover:text-ink"
            >
              Снять выделение
            </button>
          </div>
        </div>
      ) : null}
      {/* Диалоги смонтированы рядом с панелью, не внутри её size>0 блока:
          после успеха clear() опустошает Set — панель исчезает ЗА открытым
          диалогом, а отчёт «Записано: N» остаётся на экране (D-05). */}
      <BulkAssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        rows={rows}
        employees={employees}
        deviceIds={[...selected]}
        onOk={clear}
      />
      <BulkAcceptDialog
        open={acceptOpen}
        onOpenChange={setAcceptOpen}
        rows={rows}
        deviceIds={[...selected]}
        onOk={clear}
      />
    </DeviceBulkContext.Provider>
  )
}

// Чекбокс-лист строки (Pitfall 1): СИБЛИНГ Link внутри <li>, никогда не
// вложен в анкор — клик не всплывает до навигации, HTML валиден. Включён
// на КАЖДОЙ строке, включая заведомо неeligible (D-01).
export function RowCheckbox({
  deviceId,
  model,
}: {
  deviceId: number
  model: string
}) {
  const { selected, toggle } = useDeviceBulk()
  return (
    <div className="flex w-11 shrink-0 items-center justify-center">
      <Checkbox
        checked={selected.has(deviceId)}
        onCheckedChange={() => toggle(deviceId)}
        aria-label={`Выбрать: ${model}`}
        data-device-select={deviceId}
      />
    </div>
  )
}

// Tri-state шапка карточки списка (RESEARCH Pattern 2, полностью controlled):
// всё → галочка, часть → минус на accent-заливке (глиф закрыт враппером,
// Pitfall 8), пусто → пустой бокс. Лейбл частью toggle.
export function HeaderTriState() {
  const { selected, rows, toggleAll } = useDeviceBulk()
  const allSelected = rows.length > 0 && selected.size === rows.length
  const someSelected = selected.size > 0 && !allSelected
  return (
    <div className="flex min-h-11 items-center gap-3 px-4">
      <label className="flex flex-1 items-center gap-3 text-sm text-ink-secondary">
        <Checkbox
          checked={allSelected}
          indeterminate={someSelected}
          onCheckedChange={toggleAll}
          aria-label="Выбрать страницу"
        />
        Выбрать страницу
      </label>
    </div>
  )
}
