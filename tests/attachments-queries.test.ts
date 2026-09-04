import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import { applyMigrations } from './helpers'

// db/queries/attachments.ts and lib/photos.ts are bound to the module-level
// db from @/db and read UPLOADS_DIR lazily at call time. Point DATABASE_PATH
// at a temp database and UPLOADS_DIR at a temp directory BEFORE the first
// @/db import (same bootstrap as movements-queries.test.ts).
const tmpDir = mkdtempSync(join(tmpdir(), 'barahlo-attachments-'))
process.env.DATABASE_PATH = join(tmpDir, 'attachments.db')
process.env.UPLOADS_DIR = join(tmpDir, 'uploads')

const { db } = await import('@/db')
applyMigrations(db.$client)
const queries = await import('@/db/queries/attachments')
const deviceQueries = await import('@/db/queries/devices')
const photos = await import('@/lib/photos')
const sharpModule = await import('sharp')
const sharp = sharpModule.default

const {
  countByDevice,
  listByDevice,
  insertWithCapCheck,
  getAttachment,
  deleteAttachment,
} = queries
const {
  MAX_PHOTOS,
  thumbKeyOf,
  uploadsDir,
  assertInsideUploads,
  assertDeviceAcceptsPhotos,
  processPhoto,
} = photos

afterAll(() => {
  db.$client.close()
  rmSync(tmpDir, { recursive: true, force: true })
})

let serialCounter = 0

// Fresh device per test — unique serial keeps the UNIQUE index out of the way.
// Status is not creatable through createDevice (phase 4 boundary) — flip it
// with setDeviceStatus when a non-default status is needed.
function newDevice(): number {
  serialCounter += 1
  return deviceQueries.createDevice({
    typeKey: 'laptop',
    model: 'Фото Тестовая модель',
    serialNumber: `PH-${String(serialCounter).padStart(5, '0')}`,
    inventoryNumber: null,
    purchaseDate: null,
    purchasePrice: null,
    supplier: null,
    warrantyUntil: null,
    notes: null,
  })
}

function setDeviceStatus(deviceId: number, status: string): void {
  db.$client
    .prepare('UPDATE devices SET status = ? WHERE id = ?')
    .run(status, deviceId)
}

function captureThrown(fn: () => void): unknown {
  let thrown: unknown
  try {
    fn()
  } catch (e) {
    thrown = e
  }
  return thrown
}

// processPhoto is async — its { code } rejections surface on the promise, not
// synchronously; this async twin captures them the same way.
async function captureThrownAsync(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn()
  } catch (e) {
    return e
  }
  return undefined
}

// Direct SQL row insert with a fake storage key — insertWithCapCheck touches
// only the DB (files are written by the route before it), so tests can seed
// rows without any disk content.
function seedAttachment(deviceId: number, key?: string): number {
  serialCounter += 1
  return insertWithCapCheck(deviceId, {
    fileName: `seed-${serialCounter}.jpg`,
    mimeType: 'image/jpeg',
    byteSize: 1024,
    storageKey: key ?? `${deviceId}/seed-${serialCounter}.jpg`,
  })
}

// Synthetic real JPEG via sharp (RESEARCH-verified technique).
async function makeJpeg(
  width: number,
  height: number,
  orientation?: 6,
): Promise<Buffer> {
  const pipeline = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 140, b: 180 },
    },
  }).jpeg()
  const withMeta = orientation
    ? pipeline.withMetadata({ orientation })
    : pipeline
  return withMeta.toBuffer()
}

describe('lib/photos — keys, dirs, containment, guard', () => {
  it('thumbKeyOf derives <base>.thumb.jpg in ONE place (Pitfall 8)', () => {
    expect(thumbKeyOf('11/abc-uuid.jpg')).toBe('11/abc-uuid.thumb.jpg')
    expect(thumbKeyOf('3/x.jpeg')).toBe('3/x.thumb.jpg')
  })

  it('uploadsDir falls back to ./data/uploads when env is unset', () => {
    const prev = process.env.UPLOADS_DIR
    delete process.env.UPLOADS_DIR
    try {
      expect(uploadsDir()).toBe('./data/uploads')
    } finally {
      process.env.UPLOADS_DIR = prev
    }
  })

  it('assertInsideUploads accepts paths under the uploads root', () => {
    const root = uploadsDir()
    expect(() =>
      assertInsideUploads(resolve(root, '11/abc.jpg')),
    ).not.toThrow()
  })

  it('assertInsideUploads rejects traversal outside the root', () => {
    const root = uploadsDir()
    const escaped = resolve(root, '../outside.jpg')
    expect(captureThrown(() => assertInsideUploads(escaped))).toEqual({
      code: 'PATH_ESCAPE',
    })
    expect(
      captureThrown(() => assertInsideUploads('/etc/passwd')),
    ).toEqual({ code: 'PATH_ESCAPE' })
  })

  it('assertDeviceAcceptsPhotos guards D-03: disposed and missing reject', () => {
    expect(captureThrown(() => assertDeviceAcceptsPhotos(undefined))).toEqual({
      code: 'DEVICE_NOT_FOUND',
    })
    expect(
      captureThrown(() => assertDeviceAcceptsPhotos({ status: 'disposed' })),
    ).toEqual({ code: 'DISPOSED' })
    expect(() =>
      assertDeviceAcceptsPhotos({ status: 'in_stock' }),
    ).not.toThrow()
    expect(() =>
      assertDeviceAcceptsPhotos({ status: 'assigned' }),
    ).not.toThrow()
  })
})

describe('processPhoto — sharp pipeline (REG-05, D-06)', () => {
  it('resizes 5000×2000 down to ≤1600 inside and emits a 400px thumb', async () => {
    const input = await makeJpeg(5000, 2000)
    const out = await processPhoto(input)
    const meta = await sharp(out.full).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.width).toBe(1600)
    expect(meta.height).toBe(640)
    const thumbMeta = await sharp(out.thumb).metadata()
    expect(thumbMeta.width).toBe(400)
    expect(thumbMeta.height).toBe(160)
  })

  it('applies EXIF orientation to pixels and strips ALL metadata', async () => {
    // Portrait sensor read + orientation 6 → landscape pixels after rotate()
    const input = await makeJpeg(1000, 2000, 6)
    const before = await sharp(input).metadata()
    expect(before.orientation).toBe(6)
    const out = await processPhoto(input)
    const meta = await sharp(out.full).metadata()
    // autoOrient: 1000×2000 portrait becomes 1600×800 landscape
    expect(meta.width).toBe(1600)
    expect(meta.height).toBe(800)
    // EXIF/GPS/ICC are stripped by the re-encode default (D-06 privacy)
    expect(meta.exif).toBeUndefined()
    expect(meta.icc).toBeUndefined()
    expect(meta.orientation).toBeUndefined()
  })

  it('never enlarges smaller photos (withoutEnlargement)', async () => {
    const input = await makeJpeg(800, 600)
    const out = await processPhoto(input)
    const meta = await sharp(out.full).metadata()
    expect(meta.width).toBe(800)
    expect(meta.height).toBe(600)
    const thumbMeta = await sharp(out.thumb).metadata()
    expect(thumbMeta.width).toBe(400)
    expect(thumbMeta.height).toBe(300)
  })

  it('rejects garbage with BAD_IMAGE, never a sharp stack trace', async () => {
    expect(
      await captureThrownAsync(() => processPhoto(Buffer.from('not an image'))),
    ).toEqual({ code: 'BAD_IMAGE' })
    expect(
      await captureThrownAsync(() => processPhoto(Buffer.alloc(0))),
    ).toEqual({ code: 'BAD_IMAGE' })
  })
})

describe('attachments queries — cap, strict pair, delete (D-05)', () => {
  it('counts and lists per device, newest first (created_at DESC, id DESC)', () => {
    const dev = newDevice()
    const other = newDevice()
    expect(countByDevice(dev)).toBe(0)
    const first = seedAttachment(dev)
    const second = seedAttachment(dev)
    seedAttachment(other)
    expect(countByDevice(dev)).toBe(2)
    const rows = listByDevice(dev)
    expect(rows.map((r) => r.id)).toEqual([second, first])
    expect(rows.every((r) => r.deviceId === dev)).toBe(true)
  })

  it('caps a device at 8 photos inside the transaction (Pitfall 7)', () => {
    const dev = newDevice()
    for (let i = 0; i < MAX_PHOTOS; i += 1) {
      expect(() => seedAttachment(dev)).not.toThrow()
    }
    expect(countByDevice(dev)).toBe(MAX_PHOTOS)
    expect(captureThrown(() => seedAttachment(dev))).toEqual({ code: 'CAP' })
    expect(countByDevice(dev)).toBe(MAX_PHOTOS)
  })

  it('cap is per device — a second device starts from zero', () => {
    const devA = newDevice()
    const devB = newDevice()
    for (let i = 0; i < MAX_PHOTOS; i += 1) seedAttachment(devA)
    expect(() => seedAttachment(devB)).not.toThrow()
  })

  it('getAttachment enforces the IDOR pair (deviceId + attachmentId)', () => {
    const dev = newDevice()
    const stranger = newDevice()
    const id = seedAttachment(dev, `${dev}/pair-check.jpg`)
    const row = getAttachment(dev, id)
    expect(row).toBeDefined()
    expect(row!.deviceId).toBe(dev)
    expect(row!.storageKey).toBe(`${dev}/pair-check.jpg`)
    // чужая пара → undefined
    expect(getAttachment(stranger, id)).toBeUndefined()
  })

  it('deleteAttachment removes the row AND both disk files', async () => {
    const dev = newDevice()
    const key = `${dev}/uuid-del.jpg`
    const dir = resolve(uploadsDir(), String(dev))
    mkdirSync(dir, { recursive: true })
    await writeFile(resolve(dir, 'uuid-del.jpg'), Buffer.from('full-bytes'))
    await writeFile(
      resolve(dir, 'uuid-del.thumb.jpg'),
      Buffer.from('thumb-bytes'),
    )
    const id = insertWithCapCheck(dev, {
      fileName: 'del.jpg',
      mimeType: 'image/jpeg',
      byteSize: 9,
      storageKey: key,
    })
    expect(existsSync(resolve(dir, 'uuid-del.jpg'))).toBe(true)
    deleteAttachment(dev, id)
    expect(getAttachment(dev, id)).toBeUndefined()
    expect(existsSync(resolve(dir, 'uuid-del.jpg'))).toBe(false)
    expect(existsSync(resolve(dir, 'uuid-del.thumb.jpg'))).toBe(false)
  })

  it('deleteAttachment tolerates missing files (ENOENT never fails)', () => {
    const dev = newDevice()
    const id = seedAttachment(dev) // no files on disk at all
    expect(() => deleteAttachment(dev, id)).not.toThrow()
    expect(getAttachment(dev, id)).toBeUndefined()
  })

  it('deleteAttachment rejects a foreign pair (IDOR guard)', () => {
    const dev = newDevice()
    const stranger = newDevice()
    const id = seedAttachment(dev)
    expect(captureThrown(() => deleteAttachment(stranger, id))).toEqual({
      code: 'ATTACHMENT_NOT_FOUND',
    })
    expect(getAttachment(dev, id)).toBeDefined()
  })

  it('deleteAttachment refuses disposed devices (D-03 view-only)', () => {
    const dev = newDevice()
    setDeviceStatus(dev, 'disposed')
    const id = seedAttachment(dev)
    expect(captureThrown(() => deleteAttachment(dev, id))).toEqual({
      code: 'DISPOSED',
    })
    expect(getAttachment(dev, id)).toBeDefined()
  })
})

describe('source gates (plan 04-03 acceptance)', () => {
  it('every photo route handler is requireSession-first (ACC-02/V3)', () => {
    const uploadSrc = readFileSync(
      join(process.cwd(), 'app/api/devices/[id]/photos/route.ts'),
      'utf8',
    )
    const attachSrc = readFileSync(
      join(process.cwd(), 'app/api/attachments/[attachmentId]/route.ts'),
      'utf8',
    )
    for (const src of [uploadSrc, attachSrc]) {
      const guardAt = src.indexOf('await requireSession()')
      expect(guardAt).toBeGreaterThanOrEqual(0)
      // No DB, disk or body access may precede the session guard
      for (const after of ['getDevice(', 'getAttachment(', 'formData()', 'readFile(', 'deleteAttachment(']) {
        const at = src.indexOf(after)
        if (at >= 0) expect(guardAt).toBeLessThan(at)
      }
    }
  })

  it('photos are never served from public/ (ACC-02, D-06)', () => {
    expect(existsSync(join(process.cwd(), 'public', 'uploads'))).toBe(false)
    const uploadSrc = readFileSync(
      join(process.cwd(), 'app/api/devices/[id]/photos/route.ts'),
      'utf8',
    )
    const attachSrc = readFileSync(
      join(process.cwd(), 'app/api/attachments/[attachmentId]/route.ts'),
      'utf8',
    )
    for (const src of [uploadSrc, attachSrc]) {
      expect(src.includes('public/')).toBe(false)
    }
    // Upload bytes live under UPLOADS_DIR (data/uploads), not under public/
    expect(uploadsDir()).toBe(join(tmpDir, 'uploads'))
  })

  it('grid island does the client resize before POST (pipeline contract)', () => {
    const gridSrc = readFileSync(
      join(
        process.cwd(),
        'app/(app)/(card)/devices/[id]/photo-grid.tsx',
      ),
      'utf8',
    )
    expect(gridSrc).toContain('createImageBitmap')
    expect(gridSrc).toContain('accept="image/*"')
    expect(gridSrc).toContain('multiple')
    // capture attribute must NOT be set — it blocks library choice (D-06)
    expect(gridSrc.match(/capture=/g) ?? []).toEqual([])
    expect(gridSrc).toContain('router.refresh()')
  })
})
