// Reset the single manager account's password (D-02). CLI-only, run on the
// server, interactively. Usage: node scripts/reset-admin.mjs
// The typed password is never printed anywhere — it lives only in this prompt
// and in the resulting bcrypt hash.
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import readline from 'node:readline'
import { stdin as input, stdout as output } from 'node:process'

const db = new Database(process.env.DATABASE_PATH ?? './data/app.db')
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 5000')

const NOT_FOUND = 'Пользователь не найден — запустите create-admin'

// Guard: a fresh/empty database has no users table yet — a bare
// prepare('UPDATE users …') would throw "no such table" with a stack trace
// instead of a friendly hint.
const usersTables = db
  .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'users'")
  .get().n
if (usersTables === 0) {
  console.error(NOT_FOUND)
  process.exit(1)
}

const rl = readline.createInterface({ input, output })

// Single 'line' listener attached up front — works with both interactive
// stdin and piped input (same pattern as create-admin.mjs).
const buffered = []
const waiting = []
rl.on('line', (line) => {
  const w = waiting.shift()
  if (w) w(line)
  else buffered.push(line)
})
rl.on('close', () => {
  while (waiting.length > 0) waiting.shift()('')
})
function ask(prompt) {
  output.write(prompt)
  return new Promise((resolve) => {
    if (buffered.length > 0) resolve(buffered.shift())
    else waiting.push(resolve)
  })
}

try {
  const password = await ask('Новый пароль: ')
  if (password.length < 8) {
    console.error('Пароль: минимум 8 символов')
    process.exit(1)
  }

  const hash = await bcrypt.hash(password, 12)
  const res = db.prepare('UPDATE users SET password_hash = ? WHERE id = 1').run(hash)
  if (res.changes === 1) {
    console.log('Пароль обновлён')
  } else {
    console.error(NOT_FOUND)
    process.exit(1)
  }
} finally {
  rl.close()
  db.close()
}
