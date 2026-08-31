import { describe, it, expect } from 'vitest'
import { config } from '@/proxy'
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server.js'

// Matcher-level perimeter check (documented assumption A10): assets fall
// outside the matcher; everything else — including /login, /login-fake,
// /api/health and / — is inside it. Publicity of /login is decided by the
// proxy handler, not the matcher.
// Note: next 16.3.3 still exports the helper under its old name
// unstable_doesMiddlewareMatch (same matcher evaluator; no
// unstable_doesProxyMatch yet) — applied as the A10 adaptation.
const matches = (path: string) =>
  unstable_doesMiddlewareMatch({ config: { matcher: config.matcher }, url: path })

describe('proxy matcher — default-deny perimeter', () => {
  it.each([
    '/_next/static/chunk.abc.js',
    '/_next/image?url=x',
    '/favicon.ico',
  ])('does NOT match asset path %s (outside perimeter)', (path) => {
    expect(matches(path)).toBe(false)
  })

  it.each(['/login', '/login-fake', '/api/health', '/'])(
    'matches %s (inside perimeter; handler decides publicity)',
    (path) => {
      expect(matches(path)).toBe(true)
    },
  )
})
