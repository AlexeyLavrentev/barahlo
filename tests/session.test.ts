import { describe, it, expect } from 'vitest'
import { SignJWT } from 'jose'

// lib/session imports 'server-only' (stubbed in vitest.config) and resolves
// next/headers lazily — safe to import under the node test environment once
// AUTH_SECRET is set before the module is loaded.
process.env.AUTH_SECRET ??= 'vitest-secret-0123456789abcdef'

const { verifySession } = await import('@/lib/session')

const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)

async function sign(payload: Record<string, unknown>, expirationTime: string) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expirationTime)
    .sign(secret)
}

describe('verifySession (jose HS256)', () => {
  it('sign → verify roundtrip returns the payload with userId', async () => {
    const token = await sign({ userId: 1 }, '30d')
    const session = await verifySession(token)
    expect(session).not.toBeNull()
    expect(session).toMatchObject({ userId: 1 })
  })

  it('tampered token (one changed signature character) → null', async () => {
    const token = await sign({ userId: 1 }, '30d')
    const parts = token.split('.')
    const sig = parts[2]!
    parts[2] = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
    const tampered = parts.join('.')
    expect(tampered).not.toEqual(token)
    expect(await verifySession(tampered)).toBeNull()
  })

  it('token with exp in the past → null', async () => {
    const expired = new Date(Math.floor(Date.now() / 1000) - 10)
    const token = await new SignJWT({ userId: 1 })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(expired)
      .setExpirationTime(expired)
      .sign(secret)
    expect(await verifySession(token)).toBeNull()
  })

  it('verifySession(undefined) and verifySession("") → null without throwing', async () => {
    await expect(verifySession(undefined)).resolves.toBeNull()
    await expect(verifySession('')).resolves.toBeNull()
  })
})
