import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'

// Deliberately BEHIND the perimeter: exists as the curl target proving that
// api/* is gated like every other route (PITFALLS Pitfall 1).
export async function GET() {
  await requireSession()
  return NextResponse.json({ ok: true })
}
