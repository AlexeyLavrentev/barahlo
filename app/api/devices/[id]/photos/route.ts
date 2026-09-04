import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { getDevice } from '@/db/queries/devices'
import { insertWithCapCheck } from '@/db/queries/attachments'
import {
  MAX_RAW_BYTES,
  assertDeviceAcceptsPhotos,
  processPhoto,
  resolveUploadPath,
  thumbKeyOf,
  uploadsDir,
} from '@/lib/photos'

// Photo upload (REG-05, D-05, D-06; T-04-08). A Route Handler, not a Server
// Action: actions cap bodies at 1MB and would truncate real phone photos
// (RESEARCH Pitfall 1). Route handlers are direct-POST-able like actions, so
// requireSession() stays the FIRST statement (V3; the proxy perimeter is
// layer one, this is defense-in-depth).

// The URL id is untyped user input that reaches SQL (T-03-02): positive
// integer or 404 — garbage never reaches a query.
const IdSchema = z.coerce.number().int().positive()

// HTTP mapping of the query/pipeline error codes (V7): codes leave the
// server, internals never do — the client maps every failure onto the single
// UI-SPEC copy «Не удалось загрузить фото. Попробуйте ещё раз.». The client
// sends one file per request; several files in one POST are processed in
// order and a mid-batch failure keeps the already-stored ones (the cap guard
// still bounds the device at 8).
function statusFor(error: unknown): number | null {
  switch ((error as { code?: string } | null)?.code) {
    case 'DEVICE_NOT_FOUND':
    case 'ATTACHMENT_NOT_FOUND':
      return 404
    case 'CAP':
    case 'DISPOSED':
      return 409
    case 'BAD_IMAGE':
      return 415
    case 'TOO_LARGE':
    case 'NO_FILE':
      return 400
    default:
      return null
  }
}

function jsonError(code: string, status: number) {
  return NextResponse.json({ code }, { status })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireSession()
  const { id } = await params
  const parsed = IdSchema.safeParse(id)
  if (!parsed.success) return jsonError('DEVICE_NOT_FOUND', 404)
  const deviceId = parsed.data
  try {
    // D-03 server side + existence (Pitfall 10): disposed devices accept no
    // uploads even from a crafted direct POST.
    assertDeviceAcceptsPhotos(getDevice(deviceId))

    const form = await request.formData()
    const files = form
      .getAll('file')
      .filter((entry): entry is File => entry instanceof File)
    if (files.length === 0) return jsonError('NO_FILE', 400)

    let lastId: number | null = null
    for (const file of files) {
      // Raw sanity cap BEFORE sharp ever decodes (V5/DoS, T-04-10).
      if (file.size > MAX_RAW_BYTES) throw { code: 'TOO_LARGE' }
      // Magic-byte gate → autoOrient → resize ≤1600 → JPEG re-encode with
      // EXIF/GPS/ICC stripped (the trust boundary — the client's declared
      // Content-Type is never trusted).
      const photo = await processPhoto(Buffer.from(await file.arrayBuffer()))
      // The storage path is SERVER-generated — the client never influences
      // it (T-04-09); '<deviceId>/<uuid>.jpg' relative to the uploads root.
      const storageKey = `${deviceId}/${randomUUID()}.jpg`
      await mkdir(resolve(uploadsDir(), String(deviceId)), { recursive: true })
      try {
        await writeFile(resolveUploadPath(storageKey), photo.full)
        await writeFile(
          resolveUploadPath(thumbKeyOf(storageKey)),
          photo.thumb,
        )
        // Cap re-check + INSERT in ONE transaction (Pitfall 7) — parallel
        // uploads cannot slip a 9th photo through the check-then-insert gap.
        lastId = insertWithCapCheck(deviceId, {
          fileName: file.name || 'photo.jpg',
          mimeType: 'image/jpeg',
          byteSize: photo.full.byteLength,
          storageKey,
        })
      } catch (error) {
        // ANY failure after the writes unlinks BOTH files — no broken rows
        // ever point at disk state; an orphan file would be the harmless
        // direction (RESEARCH C5 step 6).
        for (const key of [storageKey, thumbKeyOf(storageKey)]) {
          await unlink(resolveUploadPath(key)).catch(() => {})
        }
        throw error
      }
    }
    return NextResponse.json({ ok: true, id: lastId })
  } catch (error) {
    const status = statusFor(error)
    if (status !== null) {
      return jsonError((error as { code: string }).code, status)
    }
    console.error('photo upload failed:', error)
    return NextResponse.json({ code: 'INTERNAL' }, { status: 500 })
  }
}
