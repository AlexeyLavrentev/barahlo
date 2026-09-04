'use client'

import type { EmployeeOption } from '@/db/queries/movements'
import {
  AcceptDialog,
  AssignDialog,
  DisposeDialog,
  RepairDialog,
  TransferDialog,
} from './movement-dialogs'

// Status-driven custody matrix on the device card (04-UI-SPEC «Action
// buttons»): each status offers exactly its legal transitions —
//
//   in_stock → Выдать (the card's ONE accent) · В ремонт · Списать
//   assigned → Принять · Передать · В ремонт · Списать (all secondary; D-08:
//              «Выдать» is hidden — the server guard re-validates regardless
//              of what renders)
//   repair   → Из ремонта (the card's ONE accent) · Списать
//   disposed → nothing renders here at all — D-03 view-only: the card page
//              hides the ENTIRE actions row (Редактировать included) and
//              this null is defense-in-depth; no transition leaves disposed.
//
// «Редактировать» stays first in the card's row — the page owns it; this
// island renders only the custody buttons. «Списать» is always LAST — the
// destructive step sits at the end of every row.
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
        <DisposeDialog deviceId={deviceId} />
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
        <DisposeDialog deviceId={deviceId} />
      </>
    )
  }
  if (status === 'repair') {
    return (
      <>
        <RepairDialog deviceId={deviceId} direction="from_repair" />
        <DisposeDialog deviceId={deviceId} />
      </>
    )
  }
  return null
}
