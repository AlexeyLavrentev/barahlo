import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE, verifySession } from '@/lib/session'

// Second layer of defense (ACC-02): the proxy perimeter alone is not
// sufficient for Server Actions — they POST to their owning route, so every
// protected page / mutating entry-point re-checks the session here.
export const requireSession = cache(async () => {
  const cookieStore = await cookies()
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value)
  if (!session) redirect('/login')
  return session
})
