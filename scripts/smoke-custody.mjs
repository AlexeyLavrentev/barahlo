#!/usr/bin/env node
// End-to-end smoke for the custody tracer slice (04-01) + repair/dispose
// matrix (04-02) + the photo pipeline (04-03). Proves the auth perimeter AND
// the custody/photo render+route paths on a production build:
//   1. temp SQLite DB ← full migration 0000 ← probe employees + devices:
//      in_stock device (empty timeline), assigned device (one seeded
//      «Выдача» event), repair device (seeded «В ремонт» event), disposed
//      device (seeded «Списание» event with the reason), a second empty
//      employee (empty «Техника»)
//   2. `next start` on :3116 with DATABASE_PATH + AUTH_SECRET + UPLOADS_DIR
//      (inside the temp dir, so disk assertions are possible)
//   3. GET /devices/{id} WITHOUT cookie → 307, Location /login (perimeter)
//   4. mint a session cookie (same jose HS256 scheme as lib/session.ts)
//   5. in_stock card  → 200: «Выдать»+«В ремонт»+«Списать» + data-attrs; NO
//      «Принять»/«Передать»/«Из ремонта»; timeline empty state
//   6. assigned card  → 200: «Принять»/«Передать»/«В ремонт»/«Списать»;
//      «Выдать» ABSENT (D-08); timeline renders «Выдача» with holder's name
//   7. repair card    → 200: «Из ремонта» (accent) + «Списать»; no other
//      custody buttons; timeline renders the «В ремонт» event
//   8. disposed card  → 200 VIEW-ONLY: no custody buttons, no
//      «Редактировать»; «Списано» pill (bg-destructive/10); timeline shows
//      «Списание» with the reason (D-03)
//   9. employee cards → issued list (model, mono serial, «выдано», count,
//      «Вернуть всю технику») and the empty variant («Пока ничего не
//      выдано», no return-all button)
//  10. photo pipeline (04-03): POST/GET without cookie → 307 perimeter;
//      upload (sharp-synthesized JPEG via FormData) → 200; thumb/full GET
//      200 with cookie, image/jpeg + private immutable cache, real image
//      bytes (sharp re-probe: thumb ≤400px, full 900×700 no-enlargement);
//      IDOR чужая пара/без ?device → 404; garbage → 415 BAD_IMAGE; 9-е фото
//      → 409 {code:'CAP'} без файлов; upload на disposed → 409 DISPOSED;
//      DELETE на disposed-вложении → 409 DISPOSED; DELETE живого фото → 200
//      и строка/оба файла исчезли
//  11. 404 matrix on garbage device ids (unchanged (card) contract)
// Custody state transitions themselves are covered by the vitest suite
// (tests/movements-queries.test.ts: guards, atomicity, timeline order,
// disposed finality) and by UAT (interactive dialogs); the smoke pins the
// rendered matrix and routes. Any assertion failure exits 1 with a readable
// message; the server process and the temp directory are always cleaned up.

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { SignJWT } from 'jose'
import sharp from 'sharp'

const PORT = 3116
const BASE = `http://127.0.0.1:${PORT}`
const READY_TIMEOUT_MS = 30_000

function fail(message) {
  console.error(`SMOKE FAIL: ${message}`)
}

function applyMigrations(sqlite, dir) {
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.sql'))
    .map((e) => e.name)
    .sort()
  for (const name of files) {
    const sql = readFileSync(join(dir, name), 'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) {
      // Segments may open with comment lines (hand-added triggers/seeds do)
      // followed by the real statement — strip comments, keep the rest.
      const executable = statement
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim()
      if (executable) sqlite.exec(executable)
    }
  }
}

const dir = mkdtempSync(join(tmpdir(), 'barahlo-smoke-custody-'))
const dbPath = join(dir, 'smoke.db')
let server = null
// Module scope so the failure path (catch) can print it.
let serverLog = ''

try {
  // 1. Temp database: migrations + probe rows (migration seeds device_types).
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  applyMigrations(sqlite, join(process.cwd(), 'drizzle'))

  const dept = sqlite
    .prepare(
      "INSERT INTO departments (name, created_at) VALUES ('Отдел custody', unixepoch()) RETURNING id",
    )
    .get()

  const insertEmployee = sqlite.prepare(
    "INSERT INTO employees (name, department_id, is_active, created_at) VALUES (?, ?, 1, unixepoch()) RETURNING id",
  )
  // Names avoid the substrings the card asserts on («Выдать», «Принять», …).
  const holder = insertEmployee.get('Смок Хранитель', dept.id)
  const empty = insertEmployee.get('Смок Пустой', dept.id)

  const insertDevice = sqlite.prepare(
    `INSERT INTO devices (type_key, model, serial_number, serial_normalized, status, current_employee_id, created_at, updated_at)
     VALUES ('laptop', ?, ?, ?, 'in_stock', NULL, unixepoch(), unixepoch())`,
  )
  const stockId = Number(
    insertDevice.run('Смок Ноут Склад', 'SMOKE-CUST-1', 'SMOKE-CUST-1').lastInsertRowid,
  )
  const heldId = Number(
    insertDevice.run('Смок Ноут Рука', 'SMOKE-CUST-2', 'SMOKE-CUST-2').lastInsertRowid,
  )
  const repairId = Number(
    insertDevice.run('Смок Ноут Ремонт', 'SMOKE-CUST-3', 'SMOKE-CUST-3').lastInsertRowid,
  )
  const disposedId = Number(
    insertDevice.run('Смок Ноут Списан', 'SMOKE-CUST-4', 'SMOKE-CUST-4').lastInsertRowid,
  )

  // Assign the second device to the holder the way the assign action's
  // transaction would: projection + one «Выдача» event, backdated a day.
  sqlite
    .prepare(
      "UPDATE devices SET status = 'assigned', current_employee_id = ? WHERE id = ?",
    )
    .run(holder.id, heldId)
  sqlite
    .prepare(
      `INSERT INTO movements (device_id, event_type, from_employee_id, to_employee_id, comment, occurred_at, created_at)
       VALUES (?, 'assigned', NULL, ?, 'Смок акт', unixepoch() - 86400, unixepoch())`,
    )
    .run(heldId, holder.id)

  // Repair device (04-02): status repair + one seeded «В ремонт» event.
  sqlite.prepare("UPDATE devices SET status = 'repair' WHERE id = ?").run(repairId)
  sqlite
    .prepare(
      `INSERT INTO movements (device_id, event_type, from_employee_id, to_employee_id, comment, occurred_at, created_at)
       VALUES (?, 'to_repair', NULL, NULL, 'Смок в ремонт', unixepoch() - 3600, unixepoch())`,
    )
    .run(repairId)

  // Disposed device (04-02): terminal status + a «Списание» event whose
  // comment IS the обязательная причина (D-03).
  sqlite.prepare("UPDATE devices SET status = 'disposed' WHERE id = ?").run(disposedId)
  sqlite
    .prepare(
      `INSERT INTO movements (device_id, event_type, from_employee_id, to_employee_id, comment, occurred_at, created_at)
       VALUES (?, 'disposed', NULL, NULL, 'Смок причина списания', unixepoch() - 1800, unixepoch())`,
    )
    .run(disposedId)
  sqlite.close()

  const holderId = Number(holder.id)
  const emptyId = Number(empty.id)

  // 2. One-shot AUTH_SECRET (same ≥32-char rule as lib/session.ts).
  const authSecret = process.env.AUTH_SECRET || randomBytes(32).toString('base64')

  // 3. Production server on the temp database.
  if (!existsSync(join(process.cwd(), '.next'))) {
    throw new Error('.next не найден — сначала выполните npm run build')
  }
  server = spawn(
    process.execPath,
    [join('node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(PORT)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_PATH: dbPath,
        AUTH_SECRET: authSecret,
        UPLOADS_DIR: join(dir, 'uploads'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  serverLog = ''
  server.stdout.on('data', (c) => (serverLog += c))
  server.stderr.on('data', (c) => (serverLog += c))

  // 4. Wait for readiness by polling /login.
  const startedAt = Date.now()
  let ready = false
  while (Date.now() - startedAt < READY_TIMEOUT_MS) {
    try {
      const res = await fetch(`${BASE}/login`, { redirect: 'manual' })
      if (res.status === 200) {
        ready = true
        break
      }
    } catch {
      // server not accepting yet
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  if (!ready) {
    throw new Error(`сервер не поднялся за 30с\n--- лог сервера ---\n${serverLog}`)
  }

  // 5. Perimeter: no cookie → 307 to /login (device card route).
  const noCookie = await fetch(`${BASE}/devices/${stockId}`, { redirect: 'manual' })
  if (noCookie.status !== 307) {
    throw new Error(`/devices/${stockId} без cookie: ожидался 307, получен ${noCookie.status}`)
  }
  const location = noCookie.headers.get('location') || ''
  if (!location.includes('/login')) {
    throw new Error(`/devices/${stockId} без cookie: Location «${location}» не ведёт на /login`)
  }

  // 6. Mint the session cookie exactly like lib/session.ts does.
  const key = new TextEncoder().encode(authSecret)
  const token = await new SignJWT({ userId: 1 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(key)
  const cookieHeaders = { cookie: `session=${token}`, redirect: 'manual' }

  // 7. in_stock card: «Выдать» present, assigned-only buttons absent,
  //    empty-timeline copy of the UI-SPEC.
  const stockCard = await fetch(`${BASE}/devices/${stockId}`, { headers: cookieHeaders })
  if (stockCard.status !== 200) {
    throw new Error(`/devices/${stockId} с cookie: ожидался 200, получен ${stockCard.status}`)
  }
  const stockHtml = await stockCard.text()
  const stockNeedles = [
    'Смок Ноут Склад',
    'История перемещений',
    'История появится после первого действия с устройством.',
    'Выдать',
    'data-device-assign-id=',
    'В ремонт',
    'data-device-to-repair-id=',
    'Списать',
    'data-device-dispose-id=',
  ]
  for (const needle of stockNeedles) {
    if (!stockHtml.includes(needle)) {
      throw new Error(`/devices/${stockId} (in_stock): «${needle}» нет в HTML`)
    }
  }
  if (stockHtml.includes('Принять') || stockHtml.includes('Передать')) {
    throw new Error(`/devices/${stockId} (in_stock): лишние «Принять»/«Передать» в HTML`)
  }
  if (stockHtml.includes('Из ремонта') || stockHtml.includes('data-device-from-repair-id=')) {
    throw new Error(`/devices/${stockId} (in_stock): лишняя кнопка «Из ремонта» в HTML`)
  }
  // Red is spent only on the disposed view (and the closed dispose dialog):
  // a live in_stock card carries no destructive fill at all.
  if (stockHtml.includes('bg-destructive')) {
    throw new Error(`/devices/${stockId} (in_stock): красная заливка bg-destructive вне контекста списания`)
  }
  if (stockHtml.includes('Вернуть всю технику')) {
    throw new Error(`/devices/${stockId} (in_stock): кнопка «Вернуть всю технику» не на карточке сотрудника`)
  }

  // 8. assigned card (D-08): «Принять»/«Передать» present, «Выдать» ABSENT,
  //    the seeded «Выдача» event renders with the holder's name.
  const heldCard = await fetch(`${BASE}/devices/${heldId}`, { headers: cookieHeaders })
  if (heldCard.status !== 200) {
    throw new Error(`/devices/${heldId} с cookie: ожидался 200, получен ${heldCard.status}`)
  }
  const heldHtml = await heldCard.text()
  const heldNeedles = [
    'Смок Ноут Рука',
    'data-device-accept-id=',
    'data-device-transfer-id=',
    'В ремонт',
    'data-device-to-repair-id=',
    'Списать',
    'data-device-dispose-id=',
    'История перемещений',
    'Выдача',
    'Смок Хранитель',
    'Смок акт',
  ]
  for (const needle of heldNeedles) {
    if (!heldHtml.includes(needle)) {
      throw new Error(`/devices/${heldId} (assigned): «${needle}» нет в HTML`)
    }
  }
  if (heldHtml.includes('Выдать') || heldHtml.includes('data-device-assign-id=')) {
    throw new Error(`/devices/${heldId} (assigned): D-08 нарушен — «Выдать» присутствует в HTML`)
  }
  if (heldHtml.includes('Из ремонта') || heldHtml.includes('data-device-from-repair-id=')) {
    throw new Error(`/devices/${heldId} (assigned): лишняя кнопка «Из ремонта» в HTML`)
  }

  // 8b. repair card (04-02): «Из ремонта» (the ONE accent button of the
  //     status) + «Списать»; no Выдать/Принять/Передать/В ремонт buttons;
  //     the seeded «В ремонт» event renders on the timeline.
  const repairCard = await fetch(`${BASE}/devices/${repairId}`, { headers: cookieHeaders })
  if (repairCard.status !== 200) {
    throw new Error(`/devices/${repairId} с cookie: ожидался 200, получен ${repairCard.status}`)
  }
  const repairHtml = await repairCard.text()
  const repairNeedles = [
    'Смок Ноут Ремонт',
    'Из ремонта',
    'data-device-from-repair-id=',
    'Списать',
    'data-device-dispose-id=',
    'История перемещений',
    'В ремонт',
    'Смок в ремонт',
  ]
  for (const needle of repairNeedles) {
    if (!repairHtml.includes(needle)) {
      throw new Error(`/devices/${repairId} (repair): «${needle}» нет в HTML`)
    }
  }
  for (const absent of [
    'data-device-assign-id=',
    'data-device-accept-id=',
    'data-device-transfer-id=',
    'data-device-to-repair-id=',
  ]) {
    if (repairHtml.includes(absent)) {
      throw new Error(`/devices/${repairId} (repair): лишняя кнопка ${absent} в HTML`)
    }
  }

  // 8c. disposed card (04-02, D-03): VIEW-ONLY — 200 without any action
  //     buttons («Редактировать» included), «Списано» pill tinted red, the
  //     «Списание» event with its причина stays readable.
  const disposedCard = await fetch(`${BASE}/devices/${disposedId}`, { headers: cookieHeaders })
  if (disposedCard.status !== 200) {
    throw new Error(`/devices/${disposedId} с cookie: ожидался 200, получен ${disposedCard.status}`)
  }
  const disposedHtml = await disposedCard.text()
  const disposedNeedles = [
    'Смок Ноут Списан',
    'Списано',
    'bg-destructive/10',
    'История перемещений',
    'Списание',
    'Смок причина списания',
    'Закупка',
  ]
  for (const needle of disposedNeedles) {
    if (!disposedHtml.includes(needle)) {
      throw new Error(`/devices/${disposedId} (disposed): «${needle}» нет в HTML`)
    }
  }
  for (const absent of [
    'data-device-assign-id=',
    'data-device-accept-id=',
    'data-device-transfer-id=',
    'data-device-to-repair-id=',
    'data-device-from-repair-id=',
    'data-device-dispose-id=',
    'Редактировать',
    'Списать',
  ]) {
    if (disposedHtml.includes(absent)) {
      throw new Error(`/devices/${disposedId} (disposed): D-03 нарушен — «${absent}» присутствует в HTML`)
    }
  }

  // 9. Employee cards: holder sees the issued list + return-all; the empty
  //    employee sees the phase 2 copy and no return-all.
  const holderCard = await fetch(`${BASE}/employees/${holderId}`, { headers: cookieHeaders })
  if (holderCard.status !== 200) {
    throw new Error(`/employees/${holderId} с cookie: ожидался 200, получен ${holderCard.status}`)
  }
  const holderHtml = await holderCard.text()
  const holderNeedles = [
    'Смок Хранитель',
    'Техника',
    'Смок Ноут Рука',
    'SMOKE-CUST-2',
    'выдано ',
    '1 устройство',
    'Вернуть всю технику',
    'data-return-all-id=',
  ]
  for (const needle of holderNeedles) {
    if (!holderHtml.includes(needle)) {
      throw new Error(`/employees/${holderId}: «${needle}» нет в HTML`)
    }
  }

  const emptyCard = await fetch(`${BASE}/employees/${emptyId}`, { headers: cookieHeaders })
  if (emptyCard.status !== 200) {
    throw new Error(`/employees/${emptyId} с cookie: ожидался 200, получен ${emptyCard.status}`)
  }
  const emptyHtml = await emptyCard.text()
  if (!emptyHtml.includes('Пока ничего не выдано')) {
    throw new Error(`/employees/${emptyId}: «Пока ничего не выдано» нет в HTML`)
  }
  if (emptyHtml.includes('Вернуть всю технику') || emptyHtml.includes('data-return-all-id=')) {
    throw new Error(`/employees/${emptyId}: кнопка «Вернуть всю технику» видна при нуле выданного`)
  }

  // 10. Photo pipeline (04-03, D-05/D-06, T-04-08..T-04-11). UPLOADS_DIR
  //     lives inside the temp dir, so rows AND files are asserted. JPEG
  //     probes are synthesized with the same sharp the server uses.
  const uploadsRoot = join(dir, 'uploads')
  const probeJpeg = await sharp({
    create: {
      width: 900,
      height: 700,
      channels: 3,
      background: { r: 40, g: 120, b: 200 },
    },
  })
    .jpeg()
    .toBuffer()

  const attachmentUrl = (dev, att, variant) =>
    `${BASE}/api/attachments/${att}?device=${dev}${variant ? `&variant=${variant}` : ''}`
  const jpegForm = () => {
    const f = new FormData()
    f.append('file', new Blob([probeJpeg], { type: 'image/jpeg' }), 'smoke.jpg')
    return f
  }
  const uploadPhoto = (dev) =>
    fetch(`${BASE}/api/devices/${dev}/photos`, {
      method: 'POST',
      headers: cookieHeaders,
      body: jpegForm(),
    })
  const uploadFileCount = (dev) => {
    try {
      return readdirSync(join(uploadsRoot, String(dev))).length
    } catch {
      return 0
    }
  }

  // 10a. Perimeter first: NO cookie → 307 to /login, never a binary answer.
  const noCookiePost = await fetch(`${BASE}/api/devices/${stockId}/photos`, {
    method: 'POST',
    body: jpegForm(),
    redirect: 'manual',
  })
  if (noCookiePost.status !== 307) {
    throw new Error(`POST фото без cookie: ожидался 307, получен ${noCookiePost.status}`)
  }
  const noCookieGet = await fetch(attachmentUrl(stockId, 1), { redirect: 'manual' })
  if (noCookieGet.status !== 307) {
    throw new Error(`GET фото без cookie: ожидался 307, получен ${noCookieGet.status}`)
  }

  // 10b. Upload with cookie → 200 {ok, id}.
  const up1 = await uploadPhoto(stockId)
  if (up1.status !== 200) {
    throw new Error(`POST фото с cookie: ожидался 200, получен ${up1.status}`)
  }
  const att1 = Number((await up1.json()).id)
  if (!Number.isInteger(att1) || att1 <= 0) {
    throw new Error(`POST фото: в ответе нет id вхождения (${JSON.stringify(await up1.text().catch(() => ''))})`)
  }

  // 10c. Authorized serving: thumb + full are real JPEGs with the private
  //      immutable cache; the thumb is ≤400px, the full is 900×700 (no
  //      enlargement); IDOR — чужая пара и пропавший ?device отвечают 404.
  const thumbRes = await fetch(attachmentUrl(stockId, att1, 'thumb'), {
    headers: cookieHeaders,
  })
  if (thumbRes.status !== 200) {
    throw new Error(`GET thumb с cookie: ожидался 200, получен ${thumbRes.status}`)
  }
  if (thumbRes.headers.get('content-type') !== 'image/jpeg') {
    throw new Error('GET thumb: Content-Type не image/jpeg')
  }
  const cacheControl = thumbRes.headers.get('cache-control') || ''
  if (!cacheControl.includes('private') || !cacheControl.includes('immutable')) {
    throw new Error(`GET thumb: Cache-Control «${cacheControl}» не private+immutable`)
  }
  const thumbMeta = await sharp(Buffer.from(await thumbRes.arrayBuffer())).metadata()
  if (!thumbMeta.width || thumbMeta.width > 400 || !thumbMeta.height) {
    throw new Error(`GET thumb: миниатюра ${thumbMeta.width}×${thumbMeta.height} — ожидалась ≤400px`)
  }
  const fullRes = await fetch(attachmentUrl(stockId, att1, 'full'), {
    headers: cookieHeaders,
  })
  if (fullRes.status !== 200) {
    throw new Error(`GET full с cookie: ожидался 200, получен ${fullRes.status}`)
  }
  const fullMeta = await sharp(Buffer.from(await fullRes.arrayBuffer())).metadata()
  if (fullMeta.width !== 900 || fullMeta.height !== 700) {
    throw new Error(`GET full: ${fullMeta.width}×${fullMeta.height} — ожидалось 900×700 (без enlargement)`)
  }
  const idorRes = await fetch(attachmentUrl(heldId, att1), { headers: cookieHeaders })
  if (idorRes.status !== 404) {
    throw new Error(`IDOR GET (чужая пара): ожидался 404, получен ${idorRes.status}`)
  }
  const noDeviceRes = await fetch(`${BASE}/api/attachments/${att1}`, {
    headers: cookieHeaders,
  })
  if (noDeviceRes.status !== 404) {
    throw new Error(`GET без ?device: ожидался 404, получен ${noDeviceRes.status}`)
  }

  // 10d. Garbage bytes → 415 BAD_IMAGE (magic-byte gate, not a 500).
  const badForm = new FormData()
  badForm.append('file', new Blob([Buffer.from('это не изображение')], { type: 'image/jpeg' }), 'bad.jpg')
  const badRes = await fetch(`${BASE}/api/devices/${heldId}/photos`, {
    method: 'POST',
    headers: cookieHeaders,
    body: badForm,
  })
  if (badRes.status !== 415) {
    throw new Error(`POST мусора: ожидался 415, получен ${badRes.status}`)
  }
  if ((await badRes.json()).code !== 'BAD_IMAGE') {
    throw new Error('POST мусора: код не BAD_IMAGE')
  }

  // 10e. Cap (Pitfall 7): the 9th photo → 409 {code:'CAP'} and leaves NO
  //      files behind; the Russian copy rides the client, the code the wire.
  let lastAtt = att1
  for (let i = 0; i < 7; i += 1) {
    const up = await uploadPhoto(stockId)
    if (up.status !== 200) {
      throw new Error(`POST фото №${i + 2} из 8: ожидался 200, получен ${up.status}`)
    }
    lastAtt = Number((await up.json()).id)
  }
  const filesAtCap = uploadFileCount(stockId) // 8 × (full + thumb) = 16
  const ninth = await uploadPhoto(stockId)
  if (ninth.status !== 409) {
    throw new Error(`9-е фото: ожидался 409, получен ${ninth.status}`)
  }
  if ((await ninth.json()).code !== 'CAP') {
    throw new Error('9-е фото: код не CAP')
  }
  if (uploadFileCount(stockId) !== filesAtCap) {
    throw new Error('9-е фото: отклонённая загрузка оставила файлы на диске')
  }

  // 10f. Disposed refusals (D-03, T-04-11): upload → 409 DISPOSED; DELETE of
  //      an attachment that DOES belong to the disposed device → 409
  //      DISPOSED (the row is seeded directly — uploads can never create it).
  const disposedUp = await uploadPhoto(disposedId)
  if (disposedUp.status !== 409 || (await disposedUp.json()).code !== 'DISPOSED') {
    throw new Error(`POST фото на disposed: ожидался 409 DISPOSED, получен ${disposedUp.status}`)
  }
  const seededDir = join(uploadsRoot, String(disposedId))
  mkdirSync(seededDir, { recursive: true })
  writeFileSync(join(seededDir, 'disposed.jpg'), Buffer.from('fffff'))
  writeFileSync(join(seededDir, 'disposed.thumb.jpg'), Buffer.from('fffff'))
  const seedSqlite = new Database(dbPath)
  const disposedAttId = Number(
    seedSqlite
      .prepare(
        "INSERT INTO attachments (device_id, file_name, mime_type, byte_size, kind, storage_key, created_at) VALUES (?, 'disposed.jpg', 'image/jpeg', 5, 'photo', ?, unixepoch()) RETURNING id",
      )
      .get(disposedId, `${disposedId}/disposed.jpg`).id,
  )
  seedSqlite.close()
  const disposedDel = await fetch(attachmentUrl(disposedId, disposedAttId), {
    method: 'DELETE',
    headers: cookieHeaders,
  })
  if (disposedDel.status !== 409) {
    throw new Error(`DELETE фото disposed-устройства: ожидался 409, получен ${disposedDel.status}`)
  }
  if ((await disposedDel.json()).code !== 'DISPOSED') {
    throw new Error('DELETE фото disposed-устройства: код не DISPOSED')
  }
  if (!existsSync(join(seededDir, 'disposed.jpg')) || !existsSync(join(seededDir, 'disposed.thumb.jpg'))) {
    throw new Error('DELETE фото disposed-устройства: файлы удалены вопреки отказу')
  }

  // 10g. Delete of a live photo → 200, row AND both files are gone.
  const filesBeforeDelete = uploadFileCount(stockId)
  const delRes = await fetch(attachmentUrl(stockId, lastAtt), {
    method: 'DELETE',
    headers: cookieHeaders,
  })
  if (delRes.status !== 200) {
    throw new Error(`DELETE фото: ожидался 200, получен ${delRes.status}`)
  }
  const goneRes = await fetch(attachmentUrl(stockId, lastAtt, 'thumb'), {
    headers: cookieHeaders,
  })
  if (goneRes.status !== 404) {
    throw new Error(`GET удалённого thumb: ожидался 404, получен ${goneRes.status}`)
  }
  if (uploadFileCount(stockId) !== filesBeforeDelete - 2) {
    throw new Error('DELETE фото: на диске остались full/thumb файлы')
  }
  const countSqlite = new Database(dbPath)
  const stockRows = countSqlite
    .prepare('SELECT count(*) AS c FROM attachments WHERE device_id = ?')
    .get(stockId).c
  countSqlite.close()
  if (stockRows !== 7) {
    throw new Error(`DELETE фото: в БД ${stockRows} строк вместо 7`)
  }

  // 11. 404 invariant: garbage device id answers through notFound() with the
  //     Russian boundary (the (card) contract is untouched by this plan).
  const bad = await fetch(`${BASE}/devices/abc`, { headers: cookieHeaders, redirect: 'manual' })
  if (bad.status !== 404) {
    throw new Error(`/devices/abc: ожидался 404, получен ${bad.status}`)
  }

  console.log(
    'SMOKE OK: 307 → /login без cookie; in_stock: «Выдать»·«В ремонт»·«Списать» + пустой таймлайн; assigned: «Принять»·«Передать»·«В ремонт»·«Списать» + «Выдача», D-08; repair: «Из ремонта»·«Списать» + событие «В ремонт»; disposed view-only: без кнопок и «Редактировать», «Списано»-пилюля bg-destructive/10, «Списание» с причиной; карточка сотрудника: выданный список + «Вернуть всю технику»; пустая карточка без кнопки; фото: 307-периметр POST/GET, upload 200 → thumb/full 200 (image/jpeg, private+immutable, thumb ≤400, 900×700 без enlargement), IDOR/без device → 404, мусор → 415 BAD_IMAGE, 9-е фото → 409 CAP без файлов, disposed upload/delete → 409 DISPOSED, delete → 200 и строка+файлы исчезли; 404 на /devices/abc',
  )
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
  if (server && serverLog) console.error(`--- лог сервера ---\n${serverLog}`)
  process.exitCode = 1
} finally {
  if (server) {
    server.kill('SIGTERM')
    await new Promise((resolve) => {
      const t = setTimeout(() => {
        server.kill('SIGKILL')
        resolve()
      }, 3000)
      server.on('exit', () => {
        clearTimeout(t)
        resolve()
      })
    })
  }
  rmSync(dir, { recursive: true, force: true })
}
