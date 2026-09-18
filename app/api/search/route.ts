import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { searchPaletteDevices } from '@/db/queries/devices'
import { searchPaletteEmployees } from '@/db/queries/employees'

// Unified ⌘K-palette search (FIND-06, phase 11, D-01): ONE GET endpoint that
// searches devices and employees simultaneously by composing the EXISTING
// list predicates (searchPaletteDevices → deviceWhere, searchPaletteEmployees
// → employeeSearchPredicate — D-02, «палитра находит то, что находит список»;
// no second search engine exists). The fold (Ё/ё, homoglyphs) lives inside
// the predicates via normalizeNumber — this route only trims and caps q at
// 100 (URL-layer rule, parseDevicesSearchParams discipline); re-folding here
// would be the drift path phase 7 forbade. For the single q a plain
// searchParams.get() suffices — the Object-schema-collapsing param shaping
// (lib/search-params-record.ts) applies to multi-value routes like the CSV
// export, not here.
//
// Security shape (mirrors the export/attachments precedents): requireSession()
// is the FIRST statement of the handler — without a session redirect('/login')
// answers 307 before any db access (V3 defense-in-depth on top of the proxy
// default-deny api/* perimeter); LIMIT 6+6 is server-side (D-01 — the client
// never truncates); Cache-Control: no-store keeps every operator's results
// out of caches. Happy-path-only: q cannot crash the parser-degrading
// predicates, an unexpected failure surfaces as Next's generic 500 (V7) —
// no internals are echoed, the JSON body is db rows only.
export async function GET(request: NextRequest) {
  await requireSession()
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 100)
  const devices = searchPaletteDevices({ q, limit: 6 })
  const employees = searchPaletteEmployees({ q, limit: 6 })
  return NextResponse.json(
    { devices, employees },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
