import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import { applyMigrations } from './helpers'

// db/queries/employees.ts is bound to the module-level db from @/db, which
// opens DATABASE_PATH at import time. Point it at a temp database BEFORE the
// first @/db import (dynamic imports below keep that ordering), then apply
// the real migrations to the same connection via db.$client.
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-employees-'))
process.env.DATABASE_PATH = join(tmpDir, 'employees.db')

const { db } = await import('@/db')
applyMigrations(db.$client)
const queries = await import('@/db/queries/employees')
const {
  listEmployees,
  getEmployee,
  listDepartments,
  createEmployee,
  updateEmployee,
  setEmployeeArchived,
} = queries

afterAll(() => {
  db.$client.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('createEmployee (EMP-01, D-03, D-04)', () => {
  it('inserts into an existing department and keeps its id', () => {
    const first = createEmployee({ name: 'Анна Аннова', departmentName: 'Бухгалтерия' })
    const second = createEmployee({ name: 'Борис Борисов', departmentName: 'Бухгалтерия' })
    expect(second.departmentId).toBe(first.departmentId)
    expect(listDepartments().filter((d) => d.name === 'Бухгалтерия')).toHaveLength(1)
  })

  it('creates and links a new department for an unknown name', () => {
    const created = createEmployee({ name: 'Вера Верина', departmentName: 'ИТ' })
    const dept = listDepartments().find((d) => d.name === 'ИТ')
    expect(dept).toBeDefined()
    expect(created.departmentId).toBe(dept!.id)
  })

  it('returns the same department id when the name repeats (UNIQUE race → re-select)', () => {
    const a = createEmployee({ name: 'Глеб Глебов', departmentName: 'Продажи' })
    const b = createEmployee({ name: 'Дарья Дарьина', departmentName: 'Продажи' })
    expect(b.departmentId).toBe(a.departmentId)
    expect(listDepartments().filter((d) => d.name === 'Продажи')).toHaveLength(1)
  })

  it('allows two employees with the same name, distinguished by department and id (D-04)', () => {
    createEmployee({ name: 'Иван Иванов', departmentName: 'ИТ' })
    createEmployee({ name: 'Иван Иванов', departmentName: 'Продажи' })
    const rows = listEmployees({ filter: 'active', page: 1, pageSize: 100 }).rows.filter(
      (r) => r.name === 'Иван Иванов',
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].department).not.toBe(rows[1].department)
    expect(rows[0].id).toBeLessThan(rows[1].id) // stable id tiebreaker
  })
})

describe('updateEmployee', () => {
  it('changes name and department', () => {
    const emp = createEmployee({ name: 'Ольга Ольгина', departmentName: 'ИТ' })
    expect(updateEmployee(emp.id, { name: 'Ольга Новая', departmentName: 'HR' })).toBe(true)
    const row = getEmployee(emp.id)
    expect(row?.name).toBe('Ольга Новая')
    expect(row?.department).toBe('HR')
  })

  it('neither throws nor creates rows for an unknown id', () => {
    const deptsBefore = listDepartments().length
    expect(
      updateEmployee(424242, { name: 'Никто Ничто', departmentName: 'Призрачный отдел' }),
    ).toBe(false)
    expect(listDepartments().some((d) => d.name === 'Призрачный отдел')).toBe(false)
    expect(listDepartments().length).toBe(deptsBefore)
  })
})

describe('setEmployeeArchived (EMP-03, D-02)', () => {
  it('flips isActive both ways and the row survives (no delete path)', () => {
    const emp = createEmployee({ name: 'Пётр Петров', departmentName: 'ИТ' })
    setEmployeeArchived(emp.id, true)
    expect(getEmployee(emp.id)?.isActive).toBe(0)
    setEmployeeArchived(emp.id, false)
    expect(getEmployee(emp.id)?.isActive).toBe(1)
  })

  it('archived rows leave the active list and its count, and appear in the archive', () => {
    const a = createEmployee({ name: 'Архивный Первый', departmentName: 'Архивка' })
    createEmployee({ name: 'Активный Второй', departmentName: 'Архивка' })
    setEmployeeArchived(a.id, true)
    const active = listEmployees({ filter: 'active', page: 1, pageSize: 100 })
    expect(active.rows.some((r) => r.id === a.id)).toBe(false)
    const archive = listEmployees({ filter: 'archive', page: 1, pageSize: 100 })
    expect(archive.rows.some((r) => r.id === a.id)).toBe(true)
    expect(getEmployee(a.id)).toBeDefined() // history retained (EMP-03)
  })

  it('exposes no delete/remove capability at module level (EMP-03)', () => {
    expect(Object.keys(queries).some((k) => /delete|remove|destroy/i.test(k))).toBe(false)
  })
})

describe('getEmployee', () => {
  it('returns undefined for an unknown id', () => {
    expect(getEmployee(999999)).toBeUndefined()
  })
})

describe('listEmployees pagination (D-01)', () => {
  const PAGE_DEPT = 'Пагинация'
  let seeded = false
  function seed25() {
    if (seeded) return
    for (let i = 1; i <= 25; i++) {
      createEmployee({
        name: `Сотрудник ${String(i).padStart(2, '0')}`,
        departmentName: PAGE_DEPT,
      })
    }
    seeded = true
  }

  it('serves 20-row pages, clamps out-of-range pages, resets page 0/negative to 1', () => {
    seed25()
    const first = listEmployees({ filter: 'active', page: 1, pageSize: 20 })
    expect(first.rows).toHaveLength(20)
    const total = first.total
    const pages = Math.ceil(total / 20)
    expect(first.pages).toBe(pages)

    const second = listEmployees({ filter: 'active', page: 2, pageSize: 20 })
    expect(second.rows).toHaveLength(Math.min(20, total - 20))

    const beyond = listEmployees({ filter: 'active', page: 99, pageSize: 20 })
    expect(beyond.page).toBe(pages)
    expect(beyond.rows).toHaveLength(total - (pages - 1) * 20)

    for (const p of [0, -3]) {
      expect(listEmployees({ filter: 'active', page: p, pageSize: 20 }).page).toBe(1)
    }
  })

  it('returns all 25 seeded department rows across pages', () => {
    seed25()
    let page = 1
    let seen = 0
    for (;;) {
      const res = listEmployees({ filter: 'active', page, pageSize: 20 })
      seen += res.rows.filter((r) => r.department === PAGE_DEPT).length
      if (page >= res.pages) break
      page++
    }
    expect(seen).toBe(25)
  })
})

describe('listEmployees russian sort (Ё after Е, D-04 research Pattern 4)', () => {
  it('orders Анна < Борис < Ежов < Ёлкин despite binary UTF-8 putting Ё before А', () => {
    createEmployee({ name: 'Ёлкин Сортировкин', departmentName: 'Сортировка' })
    createEmployee({ name: 'Ежов Сортировкин', departmentName: 'Сортировка' })
    createEmployee({ name: 'Анна Сортировкина', departmentName: 'Сортировка' })
    createEmployee({ name: 'Борис Сортировкин', departmentName: 'Сортировка' })
    const names = listEmployees({ filter: 'active', page: 1, pageSize: 1000 }).rows
      .filter((r) => r.department === 'Сортировка')
      .map((r) => r.name)
    expect(names).toEqual([
      'Анна Сортировкина',
      'Борис Сортировкин',
      'Ежов Сортировкин',
      'Ёлкин Сортировкин',
    ])
  })
})
