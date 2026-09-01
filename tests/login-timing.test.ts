import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import bcrypt from 'bcryptjs'
import { DUMMY_HASH } from '@/lib/dummy-hash'

// Verification gap 1 (plan 01-01 must-have): an unknown login must be
// indistinguishable from a wrong password — bcrypt.compare must run for BOTH
// paths at the same cost, so response timing cannot reveal whether the single
// real login exists.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

describe('login timing parity — unknown login (gap 1)', () => {
  it('actions.ts compares against DUMMY_HASH unconditionally — no short-circuit skipping bcrypt for unknown logins', () => {
    const source = readFileSync(join(ROOT, 'app/login/actions.ts'), 'utf8')
    // The unconditional compare mechanism must be present...
    expect(source).toContain('user?.passwordHash ?? DUMMY_HASH')
    // ...and the old short-circuit must stay gone: `user && (await bcrypt.compare...)`
    // returned in ~1ms for unknown logins while wrong passwords cost ~100ms+.
    expect(source).not.toMatch(/user\s*&&\s*\(\s*await\s+bcrypt\.compare/)
  })

  it('DUMMY_HASH is a valid bcrypt hash at cost 12 — same work class as real password hashes', () => {
    // 60-char bcrypt encoding: $2a/$2b/$2y + cost + $ + 22-char salt + 31-char hash.
    expect(DUMMY_HASH).toMatch(/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/)
  })

  it('DUMMY_HASH does not match an arbitrary attacker-chosen password — unknown login can never authenticate', () => {
    expect(bcrypt.compareSync('guessed-password-attempt', DUMMY_HASH)).toBe(false)
  })
})
