import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import { applyMigrations } from './helpers'

// CSV proof layer (plan 05-04 Task 2, D-18/T-05-10/T-05-11): the injection
// matrix, the BOM/«;»/CRLF shape, the dual-filename headers and the
// exportDevices == union-of-listDevices-pages parity. Same harness as
// devices-queries.test.ts: DATABASE_PATH is set BEFORE the first @/db import
// (dynamic imports keep that ordering), migrations ride db.$client.
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-csv-'))
process.env.DATABASE_PATH = join(tmpDir, 'csv.db')

const { db } = await import('@/db')
applyMigrations(db.$client)
const queries = await import('@/db/queries/devices')
const { createDevice, listDevices, exportDevices } = queries
const { createEmployee } = await import('@/db/queries/employees')
const { esc, buildCsv, csvResponseHeaders } = await import('@/lib/csv')
const { addDaysUtc, displayTodayUtc } = await import('@/lib/warranty')

afterAll(() => {
  db.$client.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('esc — формула-injection matrix (T-05-10, CWE-1236, RESEARCH Pitfall 8)', () => {
  // Every cell of the export passes through esc() — there is no raw join
  // path — so a cell whose FIRST character could start a formula is dead at
  // the escaper (tab-prefix, OWASP-recommended).
  it.each([
    ['=1+1', '\t=1+1'],
    ['+SUM(A1)', '\t+SUM(A1)'],
    ['@cmd', '\t@cmd'],
    ['-2', '\t-2'],
    ['\tTAB-ведущий', '\t\tTAB-ведущий'],
    ['\rCR-ведущий', '"\t\rCR-ведущий"'],
    ['=1;2', '"\t=1;2"'],
  ])('опасное начало %j нейтрализуется', (input, expected) => {
    expect(esc(input)).toBe(expected)
  })

  it.each([
    ['a;b', '"a;b"'],
    ['a"b', '"a""b"'],
    ['a\nb', '"a\nb"'],
  ])('служебный символ внутри %j — RFC-4180 кавычки', (input, expected) => {
    expect(esc(input)).toBe(expected)
  })

  it('interior TAB is harmless — Excel evaluates only the leading character', () => {
    expect(esc('a\tb')).toBe('a\tb')
  })

  it('null renders the empty field; a plain identifier is untouched', () => {
    expect(esc(null)).toBe('')
    expect(esc('C123')).toBe('C123')
    expect(esc(16)).toBe('16')
  })
})

describe('buildCsv — BOM/«;»/CRLF shape (D-18, RESEARCH Pitfall 7)', () => {
  it('first bytes are the UTF-8 BOM', () => {
    const body = buildCsv(['А'], [])
    expect(body.charCodeAt(0)).toBe(0xfeff)
  })

  it('header joined with «;», rows separated by CRLF', () => {
    const body = buildCsv(['Тип', 'Модель'], [['Ноутбук', 'X1']])
    expect(body).toBe('\uFEFFТип;Модель\r\nНоутбук;X1')
  })

  it('a cell containing the separator stays one column (quoting holds the count)', () => {
    const body = buildCsv(['H'], [['a;b']])
    // Two lines only; the data cell is quoted, so an RFC parser reads ONE field.
    expect(body.split('\r\n')).toHaveLength(2)
    expect(body).toBe('\uFEFFH\r\n"a;b"')
  })

  it('empty rows list produces just the header line after the BOM', () => {
    expect(buildCsv(['Единственная'], [])).toBe('\uFEFFЕдинственная')
  })
})

// ─── Fixture: the full-filter parity set ────────────────────────────────────
// Matching set: 25 laptops held by empA (assigned), warranty inside the ≤30
// window, ramUpgraded 0-or-NULL, model searchable by q='делл' — with models
// numbered DOWNWARD so the canonical RU-sort ≠ id order (the parity assertion
// then proves the export sorts like the page, not merely matches its set).
// Decoys cover every exclusion dimension (type/status/dept/warranty/ram/q).
const today = displayTodayUtc()
const warnDate = addDaysUtc(today, 30)
const farDate = addDaysUtc(today, 90)
const expiredDate = addDaysUtc(today, -1)

const empA = createEmployee({ name: 'Экспорт Держатель', departmentName: 'Экспорт-Отдел А' })
const empB = createEmployee({ name: 'Экспорт Чужой', departmentName: 'Экспорт-Отдел Б' })

function seedExport(
  serial: string,
  o: Partial<{
    model: string
    typeKey: 'laptop' | 'monitor'
    ramUpgraded: 0 | 1 | null
    warrantyUntil: Date | null
    status: string
    holderId: number | null
    supplier: string | null
    notes: string | null
    inventoryNumber: string | null
  }> = {},
): number {
  const id = createDevice({
    typeKey: o.typeKey ?? 'laptop',
    model: o.model ?? 'Делл Латитюд',
    serialNumber: serial,
    inventoryNumber: o.inventoryNumber ?? null,
    purchaseDate: null,
    purchasePrice: null,
    supplier: o.supplier ?? null,
    warrantyUntil: o.warrantyUntil ?? null,
    notes: o.notes ?? null,
    ramUpgraded: o.ramUpgraded ?? null,
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

const MATCHING = 25
for (let i = 1; i <= MATCHING; i++) {
  seedExport(`EXP-${String(i).padStart(2, '0')}`, {
    model: `Делл Латитюд ${String(1000 - i)}`, // downward numbering: RU-sort ≠ id order
    status: 'assigned',
    holderId: empA.id,
    warrantyUntil: warnDate,
    ramUpgraded: i % 2 === 0 ? 0 : null,
  })
}
// Excluded by ramNoUpgrade (D-07: ramUpgraded 1 is the upgrade fact).
for (const s of ['EXP-RAM-UP-1', 'EXP-RAM-UP-2', 'EXP-RAM-UP-3']) {
  seedExport(s, {
    model: 'Делл Латитюд АПГРЕЙД',
    status: 'assigned',
    holderId: empA.id,
    warrantyUntil: warnDate,
    ramUpgraded: 1,
  })
}
// Excluded by department (D-09: another holder's dept).
for (const s of ['EXP-DEPT-1', 'EXP-DEPT-2', 'EXP-DEPT-3']) {
  seedExport(s, {
    model: 'Делл Латитюд ЧУЖОЙ',
    status: 'assigned',
    holderId: empB.id,
    warrantyUntil: warnDate,
    ramUpgraded: 0,
  })
}
// Excluded by status AND by department (in stock → no holder → D-09 drops it).
for (const s of ['EXP-STOCK-1', 'EXP-STOCK-2']) {
  seedExport(s, { model: 'Делл Латитюд СКЛАД', warrantyUntil: warnDate, ramUpgraded: 0 })
}
// Excluded by the warranty window (far future is not «истекает ≤ 30»; yesterday
// is «истекла» — the window is active-only, D-15).
for (const s of ['EXP-FAR-1', 'EXP-FAR-2']) {
  seedExport(s, {
    model: 'Делл Латитюд ДАЛЕКО',
    status: 'assigned',
    holderId: empA.id,
    warrantyUntil: farDate,
    ramUpgraded: 0,
  })
}
for (const s of ['EXP-EXP-1', 'EXP-EXP-2']) {
  seedExport(s, {
    model: 'Делл Латитюд ИСТЕКЛА',
    status: 'assigned',
    holderId: empA.id,
    warrantyUntil: expiredDate,
    ramUpgraded: 0,
  })
}
// Excluded by type (the ram term is self-limiting to laptops, T-05-06).
for (const s of ['EXP-TYPE-1', 'EXP-TYPE-2']) {
  seedExport(s, {
    typeKey: 'monitor',
    model: 'Делл Монитор',
    status: 'assigned',
    holderId: empA.id,
    warrantyUntil: warnDate,
    ramUpgraded: 0,
  })
}
// Excluded by q (search folds serial/inventory/model only — D-02).
seedExport('EXP-Q-MISS', {
  model: 'Зета Другая',
  status: 'assigned',
  holderId: empA.id,
  warrantyUntil: warnDate,
  ramUpgraded: 0,
})
// Injection-bearing rows for the end-to-end escaper assertions (CWE-1236):
// a model starting with '=', an inventory number looking negative, a supplier
// carrying the separator, notes with a newline.
seedExport('EXP-INJ-M', {
  model: '=1+1;@cmd',
  status: 'assigned',
  holderId: empA.id,
  warrantyUntil: warnDate,
  ramUpgraded: 0,
  inventoryNumber: '-42',
  supplier: 'ООО «;Поставщик»',
  notes: 'строка1\nстрока2',
})

const parityFilters = {
  q: 'делл',
  status: 'assigned' as const,
  departmentId: empA.departmentId,
  warranty: 'w30' as const,
  ramNoUpgrade: true,
}
const parityType = 'laptop' as const

describe('exportDevices — full-filter parity with listDevices (D-18 «полный результат», edge 6)', () => {
  it('with q + type + status + department + warranty + RAM all active, the export equals the union of pages IN canonical order', () => {
    const pageSize = 20
    const first = listDevices({ type: parityType, page: 1, pageSize, filters: parityFilters })
    const pageIds = first.rows.map((r) => r.id)
    for (let p = 2; p <= first.pages; p++) {
      pageIds.push(
        ...listDevices({ type: parityType, page: p, pageSize, filters: parityFilters }).rows.map(
          (r) => r.id,
        ),
      )
    }
    expect(first.total).toBe(pageIds.length)
    expect(first.pages).toBeGreaterThan(1) // the walk is a real multi-page result

    const exportRows = exportDevices({ type: parityType, filters: parityFilters })
    expect(exportRows.map((r) => r.id)).toEqual(pageIds)
  })

  it('the parity set is exactly the 25 matching devices — decoys are excluded on every dimension', () => {
    const rows = exportDevices({ type: parityType, filters: parityFilters })
    const expected = Array.from({ length: MATCHING }, (_, i) =>
      `EXP-${String(i + 1).padStart(2, '0')}`,
    ).sort()
    expect(rows.map((r) => r.serialNumber).sort()).toEqual(expected)
  })

  it('ordering matches the canonical RU-sort + id — not insertion order', () => {
    const rows = exportDevices({ type: parityType, filters: parityFilters })
    const models = rows.map((r) => r.model)
    expect(models).toEqual([...models].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0)))
    // 1000-1 … 1000-25 numbered downward ⇒ model sort is the REVERSE of id order.
    expect(rows[0].id).toBeGreaterThan(rows[rows.length - 1].id)
  })

  it('«Отдел» carries the CURRENT holder’s department; in-stock rows have none (D-09)', () => {
    const rows = exportDevices({ type: 'all', filters: {} })
    const held = rows.find((r) => r.serialNumber === 'EXP-01')
    expect(held?.departmentName).toBe('Экспорт-Отдел А')
    expect(held?.holder).toBe('Экспорт Держатель')
    const stocked = rows.find((r) => r.serialNumber === 'EXP-STOCK-1')
    expect(stocked?.departmentName).toBeNull()
    expect(stocked?.holder).toBeNull()
  })

  it('operator-entered cells survive the file build: the escaper guards real export data', () => {
    const rows = exportDevices({ type: 'all', filters: {} })
    const inj = rows.find((r) => r.serialNumber === 'EXP-INJ-M')
    expect(inj).toBeTruthy()
    const body = buildCsv(
      ['Модель', 'Поставщик', 'Заметки', 'Инвентарный номер'],
      [[inj!.model, inj!.supplier, inj!.notes, inj!.inventoryNumber]],
    )
    // Model starts with '=' AND carries «;» — tab-prefixed AND quoted.
    expect(body).toContain('"\t=1+1;@cmd"')
    // Supplier contains the «;» separator — quoted, column count intact.
    expect(body).toContain('"ООО «;Поставщик»"')
    // Notes with a newline — quoted, row stays one row.
    expect(body).toContain('"строка1\nстрока2"')
    // Negative-looking inventory number — tab-prefixed (no quoting: quoting
    // fires only on quote/separator/CR/LF, exactly like the '-2' matrix case).
    expect(body.endsWith('\t-42')).toBe(true)
  })
})

describe('csvResponseHeaders — dual filename + security headers (V5/V7, T-05-11)', () => {
  const headers = csvResponseHeaders('2026-09-04')

  it('Content-Type is the hardcoded text/csv; charset=utf-8 (never echoed from input)', () => {
    expect(headers['Content-Type']).toBe('text/csv; charset=utf-8')
  })

  it('Content-Disposition carries the ASCII fallback AND the RFC 5987 filename* Cyrillic name', () => {
    expect(headers['Content-Disposition']).toBe(
      `attachment; filename="devices-2026-09-04.csv"; filename*=UTF-8''${encodeURIComponent('устройства-2026-09-04.csv')}`,
    )
    expect(headers['Content-Disposition']).toContain(encodeURIComponent('устройства'))
  })

  it('nosniff and no-store are present (MIME confusion and caching are dead)', () => {
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Cache-Control']).toBe('no-store')
  })
})

describe('no CSV serialization dependency (T-05-SC — zero installs, plan prohibition)', () => {
  it('package.json declares no CSV library in dependencies or devDependencies', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    const offenders = Object.keys(deps).filter((name) => /csv|papaparse/i.test(name))
    expect(offenders).toEqual([])
  })

  it('lib/csv.ts and the export route import no CSV library', () => {
    for (const file of ['lib/csv.ts', 'app/api/devices/export/route.ts']) {
      const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
      expect(imports.filter((p) => /papaparse|json2csv|csv-stringify|d3-dsv/i.test(p))).toEqual([])
    }
  })
})
