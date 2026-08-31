import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

const createdAt = () =>
  integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    login: text('login').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('users_login_uq').on(t.login)],
)

export const departments = sqliteTable(
  'departments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('departments_name_uq').on(t.name)],
)

export const deviceTypes = sqliteTable(
  'device_types',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('device_types_key_uq').on(t.key)],
)

export const employees = sqliteTable('employees', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  departmentId: integer('department_id')
    .notNull()
    .references(() => departments.id, { onDelete: 'restrict' }),
  isActive: integer('is_active').notNull().default(1),
  createdAt: createdAt(),
})

export const devices = sqliteTable(
  'devices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    typeKey: text('type_key')
      .notNull()
      .references(() => deviceTypes.key, { onDelete: 'restrict' }),
    model: text('model').notNull(),
    serialNumber: text('serial_number').notNull(),
    // D-17: normalized (upper case, collapsed spaces, homoglyphs mapped) — written by app code
    serialNormalized: text('serial_normalized').notNull(),
    // D-16: inventory number is manual only, assigned by 1C — nullable until entered
    inventoryNumber: text('inventory_number'),
    inventoryNormalized: text('inventory_normalized'),
    status: text('status').notNull().default('in_stock'),
    currentEmployeeId: integer('current_employee_id').references(
      () => employees.id,
      { onDelete: 'restrict' },
    ),
    purchaseDate: integer('purchase_date', { mode: 'timestamp' }),
    purchasePrice: integer('purchase_price'), // rubles
    supplier: text('supplier'),
    warrantyUntil: integer('warranty_until', { mode: 'timestamp' }),
    notes: text('notes'),
    // typed nullable per-type columns
    ramGb: integer('ram_gb'),
    ramUpgraded: integer('ram_upgraded'), // 0/1
    ssdGb: integer('ssd_gb'),
    screenDiagonal: real('screen_diagonal'),
    panelType: text('panel_type'),
    portCount: integer('port_count'),
    peripheralKind: text('peripheral_kind'),
    createdAt: createdAt(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('devices_serial_norm_uq').on(t.serialNormalized), // D-17
    uniqueIndex('devices_inventory_norm_uq').on(t.inventoryNormalized), // D-17
    index('devices_type_status_idx').on(t.typeKey, t.status),
    index('devices_current_employee_idx').on(t.currentEmployeeId),
    index('devices_warranty_until_idx')
      .on(t.warrantyUntil)
      .where(sql`${t.warrantyUntil} is not null`),
    check(
      'devices_status_ck',
      sql`${t.status} in ('in_stock','assigned','repair','disposed')`,
    ),
  ],
)

// Append-only movement history — never UPDATEd or DELETEd (enforced by DB triggers
// in migration 0000 and by the absence of any UPDATE/DELETE path in app code).
export const movements = sqliteTable(
  'movements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    deviceId: integer('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    // received | assigned | transferred | returned | to_repair | from_repair | disposed
    eventType: text('event_type').notNull(),
    fromEmployeeId: integer('from_employee_id').references(() => employees.id, {
      onDelete: 'restrict',
    }),
    toEmployeeId: integer('to_employee_id').references(() => employees.id, {
      onDelete: 'restrict',
    }),
    comment: text('comment'),
    occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('movements_device_occurred_idx').on(t.deviceId, t.occurredAt)],
)

export const attachments = sqliteTable('attachments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  deviceId: integer('device_id')
    .notNull()
    .references(() => devices.id, { onDelete: 'restrict' }),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type'),
  byteSize: integer('byte_size'),
  kind: text('kind').notNull().default('photo'),
  storageKey: text('storage_key').notNull(), // path on disk, never a BLOB
  createdAt: createdAt(),
})
