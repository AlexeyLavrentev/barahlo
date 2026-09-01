import { describe, it, expect, vi, afterEach } from 'vitest'
import { SignJWT } from 'jose'

// lib/session imports 'server-only' (stubbed in vitest.config) and resolves
// next/headers lazily — safe to import under the node test environment once
// AUTH_SECRET is set before the module is loaded. 32+ chars: the minimum the
// module enforces at first key use (CR-01).
process.env.AUTH_SECRET ??= 'vitest-secret-0123456789abcdef0123456789'

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

describe('AUTH_SECRET validation at first key use (CR-01)', () => {
  const original = process.env.AUTH_SECRET

  afterEach(() => {
    process.env.AUTH_SECRET = original
    vi.resetModules() // fresh module instance per test → fresh key cache
  })

  it('missing AUTH_SECRET → createSession rejects with a clear error (not a cryptic DataError)', async () => {
    delete process.env.AUTH_SECRET
    vi.resetModules()
    const { createSession } = await import('@/lib/session')
    await expect(createSession(1)).rejects.toThrow(/AUTH_SECRET/)
  })

  it('short AUTH_SECRET (< 32 chars) → createSession rejects — no silently forgeable tokens', async () => {
    process.env.AUTH_SECRET = 'abc'
    vi.resetModules()
    const { createSession } = await import('@/lib/session')
    await expect(createSession(1)).rejects.toThrow(/AUTH_SECRET/)
  })

  it('verifySession stays fail-closed (null) when the secret is invalid — never throws', async () => {
    process.env.AUTH_SECRET = 'abc'
    vi.resetModules()
    const { verifySession: verify } = await import('@/lib/session')
    const token = await sign({ userId: 1 }, '30d')
    await expect(verify(token)).resolves.toBeNull()
  })
})
