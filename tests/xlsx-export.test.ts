import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import { applyMigrations } from './helpers'

// XLSX proof layer (plan 14-02, D-01/D-02/D-03, SC 2/3/4): the typed cell
// matrix of lib/device-xlsx.ts pinned positionally — cell TYPES (numbers are
// numbers, serials/inventory are String+'@', dates are real Date cells), the
// keystone-derived bold header, the XLSX response headers, row-count parity
// with the registry and the MSK frozen-clock warranty boundaries. Same harness
// as csv-export.test.ts: DATABASE_PATH is set BEFORE the first @/db import
// (dynamic imports keep that ordering), migrations ride db.$client.
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-xlsx-'))
process.env.DATABASE_PATH = join(tmpDir, 'xlsx.db')

const { db } = await import('@/db')
applyMigrations(db.$client)
const queries = await import('@/db/queries/devices')
const { createDevice, exportDevices, totalDeviceCount } = queries
const { createEmployee } = await import('@/db/queries/employees')
const { addDaysUtc, displayTodayUtc, warrantyState } = await import(
  '@/lib/warranty'
)
const {
  deviceCsvHeader,
  WARRANTY_STATE_LABELS,
} = await import('@/lib/device-csv')
const {
  deviceXlsxSheetData,
  deviceXlsxHeaderCells,
  buildDeviceXlsx,
  xlsxResponseHeaders,
} = await import('@/lib/device-xlsx')
import type { DeviceExportRow } from '@/db/queries/devices'

afterAll(() => {
  db.$client.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

// ─── Cell helpers: the matrix mixes raw values (type inferred by the library,
// research §Cell object: string→String, number→Number, Date→Date, null→empty
// cell) with explicit cell objects — both read through one lens. ────────────
type CellObject = { value?: unknown; type?: unknown; format?: unknown }

function isCellObject(cell: unknown): cell is CellObject {
  return cell !== null && typeof cell === 'object' && !(cell instanceof Date)
}

function cellValue(cell: unknown): unknown {
  return isCellObject(cell) ? cell.value : cell
}

const TYPE_NAMES = new Map<unknown, string>([
  [String, 'String'],
  [Number, 'Number'],
  [Date, 'Date'],
  [Boolean, 'Boolean'],
])

// The effective type write-excel-file will WRITE for this cell: an explicit
// object carries its own `type`, a primitive is inferred by its JS type.
function cellType(cell: unknown): string | null {
  if (isCellObject(cell)) {
    return cell.type === undefined ? null : (TYPE_NAMES.get(cell.type) ?? String(cell.type))
  }
  if (cell === null || cell === undefined) return null
  if (cell instanceof Date) return 'Date'
  if (typeof cell === 'number') return 'Number'
  if (typeof cell === 'boolean') return 'Boolean'
  return 'String'
}

// ─── Fixtures ───────────────────────────────────────────────────────────────
const today = displayTodayUtc()

// One full DeviceExportRow for pure-matrix cases (no DB needed): every column
// null by default, overridden per case.
function rowFixture(o: Partial<DeviceExportRow> = {}): DeviceExportRow {
  return {
    id: 1,
    typeKey: 'laptop',
    model: 'Матрица Бук',
    serialNumber: 'MTX-0001',
    inventoryNumber: null,
    status: 'assigned',
    holder: null,
    departmentName: null,
    ramGb: null,
    ramUpgraded: null,
    ssdGb: null,
    screenDiagonal: null,
    panelType: null,
    portCount: null,
    peripheralKind: null,
    purchaseDate: null,
    purchasePrice: null,
    supplier: null,
    warrantyUntil: null,
    notes: null,
    ...o,
  }
}

function seedDevice(
  serial: string,
  o: Partial<{
    model: string
    typeKey: 'laptop' | 'monitor' | 'dock' | 'peripheral'
    ramUpgraded: 0 | 1 | null
    warrantyUntil: Date | null
    status: string
    holderId: number | null
    supplier: string | null
    notes: string | null
    inventoryNumber: string | null
    purchaseDate: Date | null
    purchasePrice: number | null
    ramGb: number
    ssdGb: number
    screenDiagonal: number
    panelType: string
    portCount: number
    peripheralKind: string
  }> = {},
): number {
  const id = createDevice({
    typeKey: o.typeKey ?? 'laptop',
    model: o.model ?? 'Контроль Бук',
    serialNumber: serial,
    inventoryNumber: o.inventoryNumber ?? null,
    purchaseDate: o.purchaseDate ?? null,
    purchasePrice: o.purchasePrice ?? null,
    supplier: o.supplier ?? null,
    warrantyUntil: o.warrantyUntil ?? null,
    notes: o.notes ?? null,
    ramUpgraded: o.ramUpgraded ?? null,
    ramGb: o.ramGb ?? null,
    ssdGb: o.ssdGb ?? null,
    screenDiagonal: o.screenDiagonal ?? null,
    panelType: o.panelType ?? null,
    portCount: o.portCount ?? null,
    peripheralKind: o.peripheralKind ?? null,
  })
  if (o.status) {
    // Production custody actions set holder+status together; fixtures mirror that.
    db.$client.prepare('UPDATE devices SET status = ? WHERE id = ?').run(o.status, id)
  }
  if (o.holderId) {
    db.$client.prepare('UPDATE devices SET current_employee_id = ? WHERE id = ?').run(o.holderId, id)
  }
  return id
}

// The control device: EVERY field filled — fractional diagonal 21.5, price
// 125 000, leading-zero serial (D-03), both dates, an oversized notes cell.
const CONTROL_SERIAL = '0042'
const CONTROL_PURCHASE_DATE = new Date('2026-01-05')
const CONTROL_WARRANTY_UNTIL = addDaysUtc(today, 30) // → «Истекает» (warn)
const emp = createEmployee({ name: 'XLSX Держатель', departmentName: 'XLSX-Отдел' })
seedDevice(CONTROL_SERIAL, {
  model: 'Контроль Бук Про',
  inventoryNumber: 'ИНВ-0042',
  status: 'assigned',
  holderId: emp.id,
  purchaseDate: CONTROL_PURCHASE_DATE,
  purchasePrice: 125000,
  supplier: 'ООО «Контроль»',
  warrantyUntil: CONTROL_WARRANTY_UNTIL,
  notes: 'А'.repeat(40_000), // переросток: XLSX-лимит ячейки 32 767
  ramUpgraded: 0,
  ramGb: 16,
  ssdGb: 512,
  screenDiagonal: 21.5,
  panelType: 'IPS',
  portCount: 3,
})

// The full-park matrix, computed once: fixture rows ride exportDevices in the
// same canonical order the route feeds the builder (SC 1).
const exportRows = exportDevices({ type: 'all' })
const matrix = deviceXlsxSheetData(exportRows, today) as unknown[][]
const controlRow = matrix[exportRows.findIndex((r) => r.serialNumber === CONTROL_SERIAL)]!
expect(controlRow, 'control device present in the export').toBeTruthy()

describe('deviceXlsxHeaderCells — шапка из кейстоуна (D-01/D-02/D-05, SC 2)', () => {
  const header = deviceXlsxHeaderCells()

  it('ровно 20 объектов-ячеек, каждый fontWeight bold', () => {
    expect(header).toHaveLength(20)
    for (const cell of header) {
      expect(isCellObject(cell)).toBe(true)
      expect(cell).toMatchObject({ fontWeight: 'bold' })
    }
  })

  it('последовательность меток байт-точная === deviceCsvHeader() — U+2033 ″ в диагонали дословно', () => {
    expect(header.map((c) => (c as CellObject).value)).toEqual(deviceCsvHeader())
    expect((header[10] as CellObject).value).toBe('Диагональ, ″')
  })
})

describe('deviceXlsxSheetData — форма матрицы (SC 1)', () => {
  it('по строке на устройство: rows.length строк, в каждой ровно 20 ячеек', () => {
    expect(matrix).toHaveLength(exportRows.length)
    for (const row of matrix) {
      expect(row).toHaveLength(20)
    }
  })

  it('пустой парк → пустая матрица', () => {
    expect(deviceXlsxSheetData([], today)).toEqual([])
  })
})

describe('deviceXlsxSheetData — серийник/инвентарник: String-объекты с «@» (D-03, 1-базные колонки 3/4)', () => {
  it('серийный номер: { type: String, format: "@" }, значение БД дословно — ведущий нуль жив', () => {
    const cell = controlRow[2]
    expect(isCellObject(cell)).toBe(true)
    expect(cell).toMatchObject({ value: CONTROL_SERIAL, type: String, format: '@' })
  })

  it('инвентарный номер: { type: String, format: "@" }, значение БД дословно', () => {
    const cell = controlRow[3]
    expect(isCellObject(cell)).toBe(true)
    expect(cell).toMatchObject({ value: 'ИНВ-0042', type: String, format: '@' })
  })
})

describe('deviceXlsxSheetData — числовые колонки: числа БД (D-03, колонки 8/10/13)', () => {
  it('RAM (8), SSD (10), порты (13): type Number, значение — число БД', () => {
    expect(cellType(controlRow[7])).toBe('Number')
    expect(cellValue(controlRow[7])).toBe(16)
    expect(cellType(controlRow[9])).toBe('Number')
    expect(cellValue(controlRow[9])).toBe(512)
    expect(cellType(controlRow[12])).toBe('Number')
    expect(cellValue(controlRow[12])).toBe(3)
  })
})

describe('deviceXlsxSheetData — диагональ: Number-объект с форматом 0.0 (D-03/D-05, колонка 11)', () => {
  it('дробная 21.5 — сырой REAL, объект { type: Number, format: "0.0" }; запятая CSV не переносится', () => {
    const cell = controlRow[10]
    expect(isCellObject(cell)).toBe(true)
    expect(cell).toMatchObject({ value: 21.5, type: Number, format: '0.0' })
  })
})

describe('deviceXlsxSheetData — стоимость: Number-объект с форматом #,##0 (D-03, колонка 16)', () => {
  it('125000 — число; разделитель тысяч рисует Excel из numFmt', () => {
    const cell = controlRow[15]
    expect(isCellObject(cell)).toBe(true)
    expect(cell).toMatchObject({ value: 125000, type: Number, format: '#,##0' })
  })
})

describe('deviceXlsxSheetData — даты: настоящие Date-ячейки без per-cell формата (D-02, SC 3)', () => {
  it('дата закупки (15): то же мгновение, что в БД — передаётся дословно, без реконструкции', () => {
    const cell = controlRow[14]
    expect(cell).toBeInstanceOf(Date)
    expect((cell as Date).getTime()).toBe(CONTROL_PURCHASE_DATE.getTime())
  })

  it('гарантия до (18): то же мгновение, что в БД', () => {
    const cell = controlRow[17]
    expect(cell).toBeInstanceOf(Date)
    expect((cell as Date).getTime()).toBe(CONTROL_WARRANTY_UNTIL.getTime())
  })

  it('null в БД → null-ячейка (пустая), формат дат даёт листовой dateFormat', () => {
    const [row] = deviceXlsxSheetData(
      [rowFixture({ purchaseDate: null, warrantyUntil: null })],
      today,
    ) as unknown[][]
    expect(row![14]).toBeNull()
    expect(row![17]).toBeNull()
  })
})

describe('deviceXlsxSheetData — RAM апгрейдена: тот же тернарник, что CSV (D-05, колонка 9)', () => {
  it.each([
    [1, 'да'],
    [0, 'нет'],
    [null, null],
  ])('ramUpgraded=%s → ячейка %j', (ramUpgraded, expected) => {
    const [row] = deviceXlsxSheetData([rowFixture({ ramUpgraded })], today) as unknown[][]
    expect(cellValue(row![8])).toBe(expected)
  })
})

describe('deviceXlsxSheetData — статус гарантии: словарь поверх warrantyState (WR-01, SC 4)', () => {
  it.each([
    [30, 'Истекает'],
    [61, 'Действует'],
    [-1, 'Истекла'],
  ])('wu = today + %s дней → «%s» (frozen-clock границы warranty.test.ts, MSK-дисциплина)', (days, expected) => {
    const [row] = deviceXlsxSheetData(
      [rowFixture({ warrantyUntil: addDaysUtc(today, days) })],
      today,
    ) as unknown[][]
    expect(cellValue(row![18])).toBe(expected)
  })

  it('null гарантия → «Без гарантии» — словарь поверх состояния, не пустая ячейка', () => {
    const [row] = deviceXlsxSheetData([rowFixture({ warrantyUntil: null })], today) as unknown[][]
    expect(cellValue(row![18])).toBe('Без гарантии')
  })

  it('end-to-end: метка в матрице === WARRANTY_STATE_LABELS[warrantyState(until, today)] на всех 4 состояниях', () => {
    for (const until of [addDaysUtc(today, 30), addDaysUtc(today, 61), addDaysUtc(today, -1), null]) {
      const [row] = deviceXlsxSheetData([rowFixture({ warrantyUntil: until })], today) as unknown[][]
      expect(cellValue(row![18])).toBe(WARRANTY_STATE_LABELS[warrantyState(until, today)])
    }
  })

  it('контрольное устройство в полном парке: today+30 → «Истекает» — как цвет сайта', () => {
    expect(cellValue(controlRow[18])).toBe('Истекает')
  })
})

describe('deviceXlsxSheetData — заметки: защитный слайс 32 767 (дискреция CONTEXT, колонка 20)', () => {
  it('null → null-ячейка', () => {
    const [row] = deviceXlsxSheetData([rowFixture({ notes: null })], today) as unknown[][]
    expect(row![19]).toBeNull()
  })

  it('контрольный переросток 40 000 символов → value длиной ровно 32 767', () => {
    expect(cellValue(controlRow[19])).toHaveLength(32_767)
  })
})

describe('deviceXlsxSheetData — множество типов ячеек (T-14-05/T-14-08: формульных нет, типы тихо не плывут)', () => {
  it('каждая ячейка всех строк — String/Number/Date или пустая; «Formula»/«Boolean» исключены', () => {
    for (const row of matrix) {
      for (const cell of row) {
        expect(['String', 'Number', 'Date', null]).toContain(cellType(cell))
      }
    }
  })

  it('строковая дисциплина форматов: у каждой String-ячейки с форматом формат === "@" (Pitfall 14.1)', () => {
    for (const row of matrix) {
      for (const cell of row) {
        if (isCellObject(cell) && cell.type === String && cell.format !== undefined) {
          expect(cell.format).toBe('@')
        }
      }
    }
  })
})

describe('buildDeviceXlsx — сборка книги (D-01/D-02/D-04)', () => {
  it('полный парк → Promise<Buffer>, байты 0..1 — PK (ZIP-магия OOXML)', async () => {
    const buf = await buildDeviceXlsx(exportRows, today)
    expect(buf).toBeInstanceOf(Buffer)
    expect(buf.length).toBeGreaterThan(4)
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK')
  })

  it('пустой парк → валидный файл из одной шапки', async () => {
    const buf = await buildDeviceXlsx([], today)
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK')
    expect(buf.length).toBeGreaterThan(0)
  })

  it('разреженная строка (все nullable поля null, как клон/без держателя) → книга собирается, не 500 (WR-01 ревью 14)', async () => {
    const sparse: DeviceExportRow = {
      id: 0,
      typeKey: 'laptop',
      model: 'Sparse Test',
      serialNumber: null,
      inventoryNumber: null,
      status: 'in_stock',
      holder: null,
      departmentName: null,
      ramGb: null,
      ramUpgraded: null,
      ssdGb: null,
      screenDiagonal: null,
      panelType: null,
      portCount: null,
      peripheralKind: null,
      purchaseDate: null,
      purchasePrice: null,
      supplier: null,
      warrantyUntil: null,
      notes: null,
    }
    const buf = await buildDeviceXlsx([sparse], today)
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK')
    expect(buf.length).toBeGreaterThan(0)
  })
})

describe('xlsxResponseHeaders — XLSX MIME, RFC 5987 dual filename, nosniff, no-store (D-08, SC 4)', () => {
  const headers = xlsxResponseHeaders('2026-09-30')

  it('Content-Type — жёсткий spreadsheetml MIME, без charset (ZIP-байты не текст)', () => {
    expect(headers['Content-Type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
  })

  it('Content-Disposition: ASCII fallback + filename* с encodeURIComponent-формой кириллицы', () => {
    expect(headers['Content-Disposition']).toBe(
      `attachment; filename="devices-2026-09-30.xlsx"; filename*=UTF-8''${encodeURIComponent('устройства-2026-09-30.xlsx')}`,
    )
    expect(headers['Content-Disposition']).toContain(encodeURIComponent('устройства'))
  })

  it('nosniff и no-store на месте (MIME confusion и кэш персональных данных мертвы)', () => {
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Cache-Control']).toBe('no-store')
  })
})

describe('row-count parity — файл = реестр (SC 1)', () => {
  it('без фильтров экспорт содержит весь парк: строк экспорта === totalDeviceCount()', () => {
    expect(exportDevices({ type: 'all' }).length).toBe(totalDeviceCount())
  })
})
