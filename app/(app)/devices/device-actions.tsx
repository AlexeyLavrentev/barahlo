'use client'

import type { EmployeeOption } from '@/db/queries/movements'
import { AcceptDialog, AssignDialog, TransferDialog } from './movement-dialogs'

// Status-driven custody matrix on the device card (04-UI-SPEC «Action
// buttons»): each status offers exactly its legal transitions —
//
//   in_stock → Выдать (the card's ONE accent button)
//   assigned → Принять · Передать (all secondary; D-08: «Выдать» is hidden —
//              the server guard re-validates regardless of what renders)
//   repair / disposed → no custody controls here («Из ремонта» and «Списать»
//              arrive with plan 02; the matrix extends there)
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
    return <AssignDialog deviceId={deviceId} employees={employees} />
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
      </>
    )
  }
  return null
}
