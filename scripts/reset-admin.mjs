// Reset the single manager account's password (D-02). CLI-only, run on the
// server, interactively. Usage: node scripts/reset-admin.mjs
// The typed password is never printed anywhere — the prompt runs with muted
// terminal echo (readline writes are suppressed while the password is being
// typed, as with sudo); it lives only in this prompt and in the bcrypt hash.
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

// Глушитель эха (WR-03): в terminal-режиме readline рисует вводимые символы
// через output.write — на время ввода пароля эти записи отбрасываем. Shim
// наследуется от настоящего stdout (readline зовёт не только write, но и
// on('resize') и columns), подменён только write. terminal пинится явно:
// падение до raw-режима оставило бы эхо на совести ядра tty.
let echoMuted = false
const quietOutput = Object.create(output)
quietOutput.write = (chunk) => {
  if (!echoMuted) output.write(chunk)
}
const rl = readline.createInterface({ input, output: quietOutput, terminal: output.isTTY === true })

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
function ask(prompt, { silent = false } = {}) {
  output.write(prompt)
  if (silent) echoMuted = true
  const answer = new Promise((resolve) => {
    if (buffered.length > 0) resolve(buffered.shift())
    else waiting.push(resolve)
  })
  return answer.then((line) => {
    if (silent) {
      echoMuted = false
      // В raw-режиме перевод строки после Enter рисуется через (заглушённый)
      // вывод — курсор остался на строке промпта, возвращаем его на новую.
      if (input.isTTY) output.write('\n')
    }
    return line
  })
}

try {
  const password = await ask('Новый пароль: ', { silent: true })
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
