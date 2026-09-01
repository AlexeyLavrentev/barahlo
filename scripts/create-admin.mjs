// Create the single manager account (D-13). CLI-only — there is no web setup path.
// Usage: node scripts/create-admin.mjs   (prompts for login and password)
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import readline from 'node:readline'
import { stdin as input, stdout as output } from 'node:process'

const db = new Database(process.env.DATABASE_PATH ?? './data/app.db')
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 5000')

const existing = db.prepare('SELECT COUNT(*) AS c FROM users').get().c
if (existing > 0) {
  console.error('Пользователь уже существует — сброс пароля: node scripts/reset-admin.mjs')
  process.exit(1)
}

// Глушитель эха (WR-03): в terminal-режиме readline рисует вводимые символы
// через output.write — на время ввода пароля эти записи отбрасываем. Shim
// наследуется от настоящего stdout (readline зовёт не только write, но и
// on('resize') и columns), подменён только write. terminal пинится явно:
// падение до raw-режима оставило бы эхо на совести ядра tty.
let echoMuted = false
// Вставка «логин\nпароль\n» может прилететь ОДНИМ куском: тогда readline
// обрабатывает обе строки в одном sync-цикле keypress'ов ещё до того, как
// наш код после ask('Логин: ') успеет включить глушитель. Поэтому глушим
// синхронно в обработчике 'line' — сразу после доставки строки логина.
let muteAfterLoginLine = true
const quietOutput = Object.create(output)
quietOutput.write = (chunk) => {
  if (!echoMuted) output.write(chunk)
}
const rl = readline.createInterface({ input, output: quietOutput, terminal: output.isTTY === true })

// Single 'line' listener attached up front — sequential rl.question() calls
// lose buffered lines when stdin is a pipe (answers arrive back-to-back).
const buffered = []
const waiting = []
rl.on('line', (line) => {
  if (muteAfterLoginLine) {
    echoMuted = true
    muteAfterLoginLine = false
  }
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
  const login = (await ask('Логин: ')).trim()
  // Страховка на случай раздельной доставки: байты пароля между промптами
  // тоже не должны рисоваться (см. muteAfterLoginLine у обработчика 'line').
  echoMuted = true
  if (!login) {
    console.error('Логин не может быть пустым')
    process.exit(1)
  }

  const password = await ask('Пароль: ', { silent: true })
  if (password.length < 8) {
    console.error('Пароль: минимум 8 символов')
    process.exit(1)
  }

  const hash = await bcrypt.hash(password, 12)
  try {
    db.prepare('INSERT INTO users (login, password_hash, created_at) VALUES (?, ?, unixepoch())').run(
      login,
      hash,
    )
    console.log(`Пользователь «${login}» создан`)
  } catch (err) {
    if (err && String(err.message).includes('UNIQUE constraint failed: users.login')) {
      console.error('Такой логин уже занят')
      process.exit(1)
    }
    throw err
  }
} finally {
  rl.close()
  db.close()
}
