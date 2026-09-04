'use client'

import type { EmployeeOption } from '@/db/queries/movements'
import {
  AcceptDialog,
  AssignDialog,
  RepairDialog,
  TransferDialog,
} from './movement-dialogs'

// Status-driven custody matrix on the device card (04-UI-SPEC «Action
// buttons»): each status offers exactly its legal transitions —
//
//   in_stock → Выдать (the card's ONE accent) · В ремонт
//   assigned → Принять · Передать · В ремонт (all secondary; D-08: «Выдать»
//              is hidden — the server guard re-validates regardless of what
//              renders)
//   repair   → Из ремонта (the card's ONE accent — the forward action of the
//              status)
//   disposed → nothing renders here at all (D-03 view-only; the card page
//              hides the whole actions row once «Списать» arrives)
//
// «Редактировать» stays first in the card's row — the page owns it; this
// island renders only the custody buttons.
export function DeviceActions({
  deviceId,
  status,
  holderName,
  employees,
}: {
  deviceId: number
  status: string
  holderName: string | null
  employees: EmployeeOption[]
}) {
  if (status === 'in_stock') {
    return (
      <>
        <AssignDialog deviceId={deviceId} employees={employees} />
        <RepairDialog deviceId={deviceId} direction="to_repair" />
      </>
    )
  }
  if (status === 'assigned') {
    return (
      <>
        <AcceptDialog deviceId={deviceId} />
        <TransferDialog
          deviceId={deviceId}
          holderName={holderName}
          employees={employees}
        />
        <RepairDialog
          deviceId={deviceId}
          direction="to_repair"
          holderName={holderName}
        />
      </>
    )
  }
  if (status === 'repair') {
    return (
      <RepairDialog deviceId={deviceId} direction="from_repair" />
    )
  }
  return null
}
