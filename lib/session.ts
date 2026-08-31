import 'server-only'
import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = 'session'
export const SESSION_TTL_DAYS = 30 // D-01: «запомнить меня» — one login per month

const encodedKey = new TextEncoder().encode(process.env.AUTH_SECRET)

export async function createSession(userId: number) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(encodedKey)

  // next/headers is imported lazily so this module also loads in vitest
  // (cookies() only exists inside a request/action scope).
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // No Secure attribute on purpose (D-04: plain HTTP in LAN — browsers
    // drop Secure cookies over http). Persistent cookie survives restarts.
    expires: expiresAt,
    path: '/',
  })
}

export async function verifySession(token?: string) {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, encodedKey, { algorithms: ['HS256'] })
    return payload as { userId: number }
  } catch {
    return null // missing / tampered / expired token — never throws
  }
}

export async function destroySession() {
  // Legal only inside a Server Action / Route Handler (cookie writes are
  // forbidden during Server Component render).
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}
