import bcrypt from 'bcryptjs'

// Precomputed once at module load: a bcrypt hash (cost 12 — the same cost
// scripts/create-admin.mjs uses for real passwords) of an arbitrary constant.
// Unknown logins compare against this instead of skipping bcrypt entirely, so
// an unknown login and a wrong password cost the same and the response time
// does not reveal whether the single real login exists (plan 01-01 must-have,
// verification gap 1). Kept in its own module — not in actions.ts — so tests
// can import the real value without opening the SQLite database.
// The constant is not a credential: session creation still requires a real
// users row, and this hash never matches attacker-chosen passwords in practice.
const DUMMY_PASSWORD = 'barahlo:timing-parity:arbitrary-constant'
export const DUMMY_HASH = bcrypt.hashSync(DUMMY_PASSWORD, 12)
