import { isAbsolute, relative, resolve, sep } from 'node:path'
import sharp from 'sharp'

// Photo pipeline + storage-path contract (REG-05, D-05, D-06). Server module
// by usage (sharp), but NO framework imports — vitest imports it directly
// against a temp UPLOADS_DIR. All limits live here so the client island, the
// routes and the tests never drift apart.
//
// Storage layout (D-06): bytes on disk under UPLOADS_DIR, only metadata rows
// in SQLite — attachments.storageKey stores '<deviceId>/<uuid>.jpg' RELATIVE
// to the uploads root, and the thumbnail path is DERIVED by suffix
// ('<uuid>.thumb.jpg') through thumbKeyOf — the schema has a single storage
// column and no migrations are allowed (Pitfall 8: one derivation place,
// every consumer goes through this helper).

/** Max photos per device (D-05). */
export const MAX_PHOTOS = 8
/** Raw upload sanity cap per file, before sharp ever decodes (V5). */
export const MAX_RAW_BYTES = 10 * 1024 * 1024
/** Long-edge caps: full 1600px, thumb 400px (RESEARCH C5, UI-SPEC). */
export const FULL_EDGE = 1600
export const THUMB_EDGE = 400

// Uploads root: env-configurable (V14) with the same ./data convention as
// DATABASE_PATH. Read lazily — tests and the smoke point UPLOADS_DIR at a
// temp directory, and Next must not bake the value in at build time.
export function uploadsDir(): string {
  return process.env.UPLOADS_DIR ?? './data/uploads'
}

// Accepted SOURCE formats (magic-byte gate via sharp metadata — the client's
// Content-Type is never trusted, T-04-08). HEIC reports as 'heif' and passes
// the gate; on a host without libheif the decode then fails and maps to the
// same BAD_IMAGE copy as garbage (RESEARCH Pitfall 11).
const PHOTO_INPUT_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif'])

// <deviceId>/<uuid>.jpg → <deviceId>/<uuid>.thumb.jpg — the ONE thumbnail
// derivation (Pitfall 8). Extension-agnostic: keeps any base, appends
// .thumb.jpg beside the full file.
export function thumbKeyOf(storageKey: string): string {
  const dot = storageKey.lastIndexOf('.')
  const base = dot > 0 ? storageKey.slice(0, dot) : storageKey
  return `${base}.thumb.jpg`
}

// Containment guard (T-04-09): a resolved path must stay STRICTLY inside the
// uploads root — equal to the root, escaping it, or living on another root
// all reject. DB-stored storageKey values are never trusted for path
// building; every disk access goes through resolveUploadPath below.
export function assertInsideUploads(
  absolutePath: string,
  root: string = uploadsDir(),
): void {
  const rel = relative(resolve(root), resolve(absolutePath))
  if (
    rel === '' ||
    rel === '..' ||
    rel.startsWith(`..${sep}`) ||
    isAbsolute(rel)
  ) {
    throw { code: 'PATH_ESCAPE' }
  }
}

// UPLOADS_DIR + storageKey → absolute path, containment-checked. An absolute
// or traversal storageKey resolves OUTSIDE the root and throws
// { code: 'PATH_ESCAPE' } — callers treat that as a missing file (404),
// never as a 500 stack trace.
export function resolveUploadPath(storageKey: string): string {
  const absolute = resolve(uploadsDir(), storageKey)
  assertInsideUploads(absolute)
  return absolute
}

// D-03 view-only, server side (Pitfall 10): an unknown device has nothing to
// attach to; a disposed device is read-only forever — its photos render, but
// add and delete are refused. Routes and queries double-guard (T-04-11).
export function assertDeviceAcceptsPhotos(
  device: { status: string } | undefined,
): void {
  if (!device) throw { code: 'DEVICE_NOT_FOUND' }
  if (device.status === 'disposed') throw { code: 'DISPOSED' }
}

export type ProcessedPhoto = {
  full: Buffer
  thumb: Buffer
  width: number
  height: number
}

// Server trust boundary of the pipeline (RESEARCH C5, executed against sharp
// 0.35.4): magic-byte gate → rotate() (EXIF Orientation baked into the
// pixels, tag removed) → resize inside + withoutEnlargement → JPEG
// re-encode q82. The re-encode strips ALL EXIF/GPS/ICC metadata by default
// (D-06 privacy: no geo leak) — never call .withMetadata() on photo output.
// Garbage/undecodable input rethrows as { code: 'BAD_IMAGE' } — sharp stack
// traces never leave the server (V7).
export async function processPhoto(input: Buffer): Promise<ProcessedPhoto> {
  let format: string | undefined
  try {
    format = (await sharp(input).metadata()).format
  } catch {
    throw { code: 'BAD_IMAGE' }
  }
  if (!format || !PHOTO_INPUT_FORMATS.has(format)) {
    throw { code: 'BAD_IMAGE' }
  }
  try {
    const full = sharp(input)
      .rotate()
      .resize({
        width: FULL_EDGE,
        height: FULL_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82 })
    const thumb = sharp(input)
      .rotate()
      .resize({
        width: THUMB_EDGE,
        height: THUMB_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82 })
    const [fullBuf, thumbBuf] = await Promise.all([
      full.toBuffer(),
      thumb.toBuffer(),
    ])
    const meta = await sharp(fullBuf).metadata()
    return {
      full: fullBuf,
      thumb: thumbBuf,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
    }
  } catch {
    // Passed the magic-byte gate but undecodable here (HEIC on a host
    // without libheif) — same Russian copy as garbage on the client.
    throw { code: 'BAD_IMAGE' }
  }
}
