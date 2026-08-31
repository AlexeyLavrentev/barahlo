// proxy.ts — default-deny perimeter (Next 16 proxy, Node runtime).
import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/session'

// Exact-string public path — adjacency is deliberate: /login-fake and
// /login/step stay behind the perimeter and answer with a redirect.
const PUBLIC_PATHS = ['/login']

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)

  if (!session && !PUBLIC_PATHS.includes(path)) {
    return NextResponse.redirect(new URL('/login', req.nextUrl))
  }
  if (session && path === '/login') {
    return NextResponse.redirect(new URL('/', req.nextUrl)) // already logged in
  }
  return NextResponse.next()
}

export const config = {
  // Default-DENY: everything is gated except framework assets. Only asset
  // prefixes are excluded here — `api`, uploads and any future route stay
  // behind the perimeter; /login publicity is decided by PUBLIC_PATHS above.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
