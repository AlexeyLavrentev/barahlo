import { readFile } from 'node:fs/promises'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { deleteAttachment, getAttachment } from '@/db/queries/attachments'
import { resolveUploadPath, thumbKeyOf } from '@/lib/photos'

// Photo serving (GET) + deletion (DELETE) (REG-05, D-05, D-06; T-04-08).
// Binary bytes are NEVER static files from the public directory (D-06,
// ACC-02): every response passes the session guard and the strict
// attachmentId↔deviceId IDOR pair first. requireSession() is the FIRST
// statement of both handlers (V3 defense-in-depth on top of the proxy
// perimeter).

// URL/param ids are untyped user input (T-03-02): positive integers or 404.
const IdSchema = z.coerce.number().int().positive()

// ?device=<id> is MANDATORY on both verbs — attachmentId alone would be an
// IDOR hole: the URL must name BOTH halves of the pair (V4).
function deviceOf(request: NextRequest): number | null {
  const raw = request.nextUrl.searchParams.get('device')
  if (raw === null) return null
  const parsed = IdSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

// Same mapping contract as the upload route: known codes → statuses,
// internals → generic 500 (V7).
function statusFor(error: unknown): number | null {
  switch ((error as { code?: string } | null)?.code) {
    case 'ATTACHMENT_NOT_FOUND':
      return 404
    case 'DISPOSED':
      return 409
    default:
      return null
  }
}

function jsonError(code: string, status: number) {
  return NextResponse.json({ code }, { status })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  await requireSession()
  const { attachmentId } = await params
  const id = IdSchema.safeParse(attachmentId)
  const deviceId = deviceOf(request)
  if (!id.success || deviceId === null) {
    return jsonError('ATTACHMENT_NOT_FOUND', 404)
  }
  // Strict pair (V4): a mismatching device id never serves another device's
  // attachment — getAttachment returns undefined for any foreign pair.
  const row = getAttachment(deviceId, id.data)
  if (!row) return jsonError('ATTACHMENT_NOT_FOUND', 404)

  // ?variant=thumb serves the derived thumbnail; anything else is the full
  // photo. The key is containment-checked against UPLOADS_DIR (T-04-09) — a
  // tampered storageKey is answered as a missing file, never a 500.
  const key =
    request.nextUrl.searchParams.get('variant') === 'thumb'
      ? thumbKeyOf(row.storageKey)
      : row.storageKey
  let path: string
  try {
    path = resolveUploadPath(key)
  } catch {
    return jsonError('ATTACHMENT_NOT_FOUND', 404)
  }
  let bytes: Buffer
  try {
    bytes = await readFile(path)
  } catch {
    return jsonError('ATTACHMENT_NOT_FOUND', 404)
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      // The pipeline only ever writes JPEG — the type is hardcoded, never
      // echoed from untrusted input (MIME confusion, V5).
      'Content-Type': 'image/jpeg',
      'Content-Length': String(bytes.byteLength),
      // uuid names, content never changes; PRIVATE keeps auth'd binaries out
      // of shared caches (RESEARCH C5).
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  await requireSession()
  const { attachmentId } = await params
  const id = IdSchema.safeParse(attachmentId)
  const deviceId = deviceOf(request)
  if (!id.success || deviceId === null) {
    return jsonError('ATTACHMENT_NOT_FOUND', 404)
  }
  try {
    // Pair + disposed guards ride the queries transaction; files are
    // unlinked after commit (deleteAttachment). NOT a movement event (D-05).
    deleteAttachment(deviceId, id.data)
  } catch (error) {
    const status = statusFor(error)
    if (status !== null) {
      return jsonError((error as { code: string }).code, status)
    }
    console.error('photo delete failed:', error)
    return NextResponse.json({ code: 'INTERNAL' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
