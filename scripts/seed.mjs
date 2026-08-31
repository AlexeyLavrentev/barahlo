// Dev fixtures (D-11): realistic fake data for LOCAL development only — never
// runs against production. Usage: DATABASE_PATH=./data/app.db node scripts/seed.mjs
// Refuses to run when NODE_ENV=production or when the database already has
// devices (idempotent-by-refusal: no duplicates by design).
import Database from 'better-sqlite3'
import { normalizeInventory, normalizeSerial } from '../lib/normalize.mjs'

// Guard 1 (must-run-first): seed data never reaches production (D-11).
if (process.env.NODE_ENV === 'production') {
  console.error('Seed запрещён в production')
  process.exit(1)
}

const db = new Database(process.env.DATABASE_PATH ?? './data/app.db')
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 5000')

// Guard 2: seeding an already-populated database would duplicate history.
const existingDevices = db.prepare('SELECT COUNT(*) AS c FROM devices').get().c
if (existingDevices > 0) {
  console.error('База не пуста — seed пропущен')
  process.exit(1)
}

// Deterministic PRNG (mulberry32) — repeated runs on an empty database produce
// the same fixture set. No @faker-js/faker (rejected by the research
// legitimacy gate); this generator is ~10 lines.
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20260831)
const randInt = (min, max) => min + Math.floor(rnd() * (max - min + 1))
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const chance = (p) => rnd() < p

// --- Fixture data -----------------------------------------------------------

const DEPARTMENTS = ['Бухгалтерия', 'ИТ', 'Продажи', 'Логистика', 'Производство']

// Surnames are gender-invariant forms — pairs cleanly with mixed first names.
const FIRST_NAMES = [
  'Анна', 'Дмитрий', 'Мария', 'Сергей', 'Елена', 'Алексей', 'Ольга', 'Иван',
  'Наталья', 'Павел', 'Екатерина', 'Андрей', 'Татьяна', 'Михаил', 'Ирина',
  'Николай', 'Юлия', 'Роман', 'Светлана', 'Олег',
]
const LAST_NAMES = [
  'Шевченко', 'Мельник', 'Бондаренко', 'Кравченко', 'Ткаченко',
  'Лысенко', 'Гончар', 'Мороз', 'Савченко', 'Полищук',
]

const LAPTOP_MODELS = [
  'MacBook Pro 14', 'MacBook Pro 16', 'MacBook Air 13', 'MacBook Air 15',
  'ThinkPad T14', 'ThinkPad E16', 'Aspire 5',
]
const MONITOR_MODELS = ['Dell U2723QE', 'LG 27UP850', 'Samsung S27A600']
const DOCK_MODELS = ['Dell D6000', 'Ugreen 9-в-1', 'Lenovo Thunderbolt 3']
const PERIPHERALS = [
  ['Logitech MX Master 3S', 'мышь'],
  ['Keychron K3', 'клавиатура'],
  ['Jabra Evolve2 65', 'гарнитура'],
  ['Logitech Brio 500', 'веб-камера'],
]
const SUPPLIERS = ['DNS', 'Ситилинк', 'MERLION', 'OCS', 'Марвел-Дистрибуция', 'KNS']
const NOTES = [
  'Кейс в комплекте', 'Зарядка не оригинальная', 'Была замена клавиатуры',
  'Наклейка инвентаря на корпусе', null, null, null,
]

const MIN_PURCHASE = Date.UTC(2023, 0, 1) / 1000
const MAX_PURCHASE = Date.UTC(2026, 7, 31) / 1000
const DAY = 86400
const YEAR = 365 * DAY

// Serials: unique Latin 'SN-XXXXNN' — trailing run number guarantees
// uniqueness, normalization (upper case) keeps it.
const SERIAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // без I/O — не путаются глазами
function makeSerial(runNumber) {
  const letters = Array.from({ length: 4 }, () => SERIAL_ALPHABET[randInt(0, SERIAL_ALPHABET.length - 1)]).join('')
  return `SN-${letters}${String(runNumber).padStart(2, '0')}`
}

// Inventory: 1C format «ИБ-0000NNN», manual input, sequential counter
// (~20% of devices have none yet — D-16: the number is assigned by 1C/IT).
let inventoryCounter = 101
function makeInventory() {
  const num = `ИБ-${String(inventoryCounter++).padStart(7, '0')}`
  return { number: num, normalized: normalizeInventory(num) }
}

function buildDeviceSpec(typeKey) {
  const purchaseDate = randInt(MIN_PURCHASE, MAX_PURCHASE)
  const spec = {
    typeKey,
    model: '',
    purchaseDate,
    purchasePrice: 0,
    supplier: pick(SUPPLIERS),
    warrantyUntil: purchaseDate + pick([1, 2, 3]) * YEAR,
    notes: pick(NOTES),
    ramGb: null,
    ramUpgraded: null,
    ssdGb: null,
    screenDiagonal: null,
    panelType: null,
    portCount: null,
    peripheralKind: null,
    assigned: chance(0.65),
  }
  switch (typeKey) {
    case 'laptop':
      spec.model = pick(LAPTOP_MODELS)
      spec.purchasePrice = randInt(80, 250) * 1000
      spec.ramGb = pick([8, 16, 32])
      spec.ramUpgraded = chance(0.3) ? 1 : 0
      spec.ssdGb = pick([256, 512, 1024])
      break
    case 'monitor':
      spec.model = pick(MONITOR_MODELS)
      spec.purchasePrice = randInt(25, 60) * 1000
      spec.screenDiagonal = pick([24, 27, 32])
      spec.panelType = 'IPS'
      break
    case 'dock':
      spec.model = pick(DOCK_MODELS)
      spec.purchasePrice = randInt(15, 35) * 1000
      spec.portCount = randInt(6, 12)
      break
    case 'peripheral': {
      const [model, kind] = pick(PERIPHERALS)
      spec.model = model
      spec.peripheralKind = kind
      spec.purchasePrice = randInt(5, 25) * 1000
      break
    }
  }
  return spec
}

const DEVICE_COUNTS = { laptop: 40, monitor: 15, dock: 10, peripheral: 15 }
const deviceSpecs = Object.entries(DEVICE_COUNTS).flatMap(([typeKey, count]) =>
  Array.from({ length: count }, () => buildDeviceSpec(typeKey)),
)

// --- Insert (single transaction; append-only triggers apply to seeds too) ---

const insertDepartment = db.prepare(
  'INSERT INTO departments (name, created_at) VALUES (?, unixepoch())',
)
const insertEmployee = db.prepare(
  'INSERT INTO employees (name, department_id, is_active, created_at) VALUES (?, ?, 1, unixepoch())',
)
const insertDevice = db.prepare(
  `INSERT INTO devices (
     type_key, model, serial_number, serial_normalized,
     inventory_number, inventory_normalized,
     purchase_date, purchase_price, supplier, warranty_until, notes,
     ram_gb, ram_upgraded, ssd_gb, screen_diagonal, panel_type, port_count, peripheral_kind,
     created_at, updated_at
   ) VALUES (
     @type_key, @model, @serial_number, @serial_normalized,
     @inventory_number, @inventory_normalized,
     @purchase_date, @purchase_price, @supplier, @warranty_until, @notes,
     @ram_gb, @ram_upgraded, @ssd_gb, @screen_diagonal, @panel_type, @port_count, @peripheral_kind,
     unixepoch(), unixepoch()
   )`,
)
const insertMovement = db.prepare(
  `INSERT INTO movements (device_id, event_type, from_employee_id, to_employee_id, comment, occurred_at, created_at)
   VALUES (?, ?, NULL, ?, NULL, ?, unixepoch())`,
)
const assignDevice = db.prepare(
  "UPDATE devices SET status = 'assigned', current_employee_id = ? WHERE id = ?",
)

let employeeCount = 0
let assignedCount = 0
const devicesByType = { laptop: 0, monitor: 0, dock: 0, peripheral: 0 }
const movementsByType = { received: 0, assigned: 0 }

db.transaction(() => {
  const departmentIds = DEPARTMENTS.map((name) =>
    Number(insertDepartment.run(name).lastInsertRowid),
  )

  const employeeIds = []
  for (let i = 0; i < 40; i++) {
    const name = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${
      LAST_NAMES[(i * 3 + Math.floor(i / FIRST_NAMES.length)) % LAST_NAMES.length]
    }`
    // Отдел по кругу
    const departmentId = departmentIds[i % departmentIds.length]
    employeeIds.push(Number(insertEmployee.run(name, departmentId).lastInsertRowid))
  }
  employeeCount = employeeIds.length

  for (let i = 0; i < deviceSpecs.length; i++) {
    const spec = deviceSpecs[i]
    const serial = makeSerial(i + 1)
    const inventory = chance(0.8) ? makeInventory() : null

    const result = insertDevice.run({
      type_key: spec.typeKey,
      model: spec.model,
      serial_number: serial,
      serial_normalized: normalizeSerial(serial),
      inventory_number: inventory ? inventory.number : null,
      inventory_normalized: inventory ? inventory.normalized : null,
      purchase_date: spec.purchaseDate,
      purchase_price: spec.purchasePrice,
      supplier: spec.supplier,
      warranty_until: spec.warrantyUntil,
      notes: spec.notes,
      ram_gb: spec.ramGb,
      ram_upgraded: spec.ramUpgraded,
      ssd_gb: spec.ssdGb,
      screen_diagonal: spec.screenDiagonal,
      panel_type: spec.panelType,
      port_count: spec.portCount,
      peripheral_kind: spec.peripheralKind,
    })
    const deviceId = Number(result.lastInsertRowid)

    // История: received (поступление) у каждого; assigned — у выданных.
    insertMovement.run(deviceId, 'received', null, spec.purchaseDate)
    movementsByType.received++
    if (spec.assigned) {
      const employeeId = pick(employeeIds)
      insertMovement.run(
        deviceId,
        'assigned',
        employeeId,
        spec.purchaseDate + randInt(1, 21) * DAY,
      )
      assignDevice.run(employeeId, deviceId)
      movementsByType.assigned++
      assignedCount++
    }
    devicesByType[spec.typeKey]++
  }
})()

const totalDevices = deviceSpecs.length
const totalMovements = movementsByType.received + movementsByType.assigned
console.log(
  `Seed завершён: отделов ${DEPARTMENTS.length}, сотрудников ${employeeCount}, ` +
    `устройств ${totalDevices} (ноутбуков ${devicesByType.laptop}, мониторов ${devicesByType.monitor}, ` +
    `док-станций ${devicesByType.dock}, периферии ${devicesByType.peripheral}), ` +
    `движений ${totalMovements} (received ${movementsByType.received}, assigned ${movementsByType.assigned}); ` +
    `выдано ${assignedCount}, в запасе ${totalDevices - assignedCount}`,
)

db.close()
