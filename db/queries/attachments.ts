import { and, count, desc, eq } from 'drizzle-orm'
import { unlink } from 'node:fs/promises'
import { db } from '@/db'
import { attachments, devices } from '@/db/schema'
import { MAX_PHOTOS, resolveUploadPath, thumbKeyOf } from '@/lib/photos'

// Attachment data-access (REG-05, D-05). Pure sync functions over the
// module-level db — no framework imports at all: the route handlers add
// session + zod on top, vitest imports this module directly against a temp
// database and temp UPLOADS_DIR.
//
// Every mutation double-guards the D-03 view-only rule ({ code: 'DISPOSED' })
// and enforces the strict attachmentId↔deviceId pair — a row is reachable
// ONLY through both ids from the same URL (IDOR, T-04-08/V4). Deleting a
// photo is NOT a history event (D-05: attachments are not movements).

// Row snapshot of one photo attachment. storageKey is the RELATIVE path under
// the uploads root ('<deviceId>/<uuid>.jpg') — never a BLOB, never absolute.
export type AttachmentView = {
  id: number
  deviceId: number
  fileName: string
  mimeType: string | null
  byteSize: number | null
  storageKey: string
  createdAt: Date
}

// Insert payload of the route: the server decides every column except the
// user-visible original file name.
export type AttachmentInsert = {
  fileName: string
  mimeType: string | null
  byteSize: number | null
  storageKey: string
  kind?: string
}

// Photo count of one device (the cap guard reads it inside the insert
// transaction; the card page shows «{n} из 8»).
export function countByDevice(deviceId: number): number {
  return db
    .select({ value: count() })
    .from(attachments)
    .where(
      and(eq(attachments.deviceId, deviceId), eq(attachments.kind, 'photo')),
    )
    .get()!.value
}

// Grid feed of one device — newest first (UI-SPEC: created_at DESC, новые
// первыми; id breaks same-second ties).
export function listByDevice(deviceId: number): AttachmentView[] {
  return db
    .select({
      id: attachments.id,
      deviceId: attachments.deviceId,
      fileName: attachments.fileName,
      mimeType: attachments.mimeType,
      byteSize: attachments.byteSize,
      storageKey: attachments.storageKey,
      createdAt: attachments.createdAt,
    })
    .from(attachments)
    .where(
      and(eq(attachments.deviceId, deviceId), eq(attachments.kind, 'photo')),
    )
    .orderBy(desc(attachments.createdAt), desc(attachments.id))
    .all()
}

// Cap-guarded insert (Pitfall 7): the count re-check and the INSERT ride ONE
// transaction — two parallel uploads cannot both observe «7 из 8» and land a
// 9th photo. Rejects with { code: 'CAP' } when the device already holds
// MAX_PHOTOS photos. Returns the new attachment id.
export function insertWithCapCheck(
  deviceId: number,
  row: AttachmentInsert,
): number {
  return db.transaction((tx) => {
    const used = tx
      .select({ value: count() })
      .from(attachments)
      .where(
        and(eq(attachments.deviceId, deviceId), eq(attachments.kind, 'photo')),
      )
      .get()!.value
    if (used >= MAX_PHOTOS) throw { code: 'CAP' }
    return tx
      .insert(attachments)
      .values({
        deviceId,
        fileName: row.fileName,
        mimeType: row.mimeType,
        byteSize: row.byteSize,
        kind: row.kind ?? 'photo',
        storageKey: row.storageKey,
      })
      .returning({ id: attachments.id })
      .get()!.id
  })
}

// Strict-pair read (IDOR, V4): the row answers only when deviceId AND
// attachmentId match — any other combination is undefined, never another
// device's photo.
export function getAttachment(
  deviceId: number,
  attachmentId: number,
): AttachmentView | undefined {
  return db
    .select({
      id: attachments.id,
      deviceId: attachments.deviceId,
      fileName: attachments.fileName,
      mimeType: attachments.mimeType,
      byteSize: attachments.byteSize,
      storageKey: attachments.storageKey,
      createdAt: attachments.createdAt,
    })
    .from(attachments)
    .where(
      and(
        eq(attachments.deviceId, deviceId),
        eq(attachments.id, attachmentId),
      ),
    )
    .get()
}

// Delete one photo (D-05): row DELETE + both disk files unlinked. Guards ride
// one transaction (pair + disposed — from a disposed device nothing is ever
// removed, D-03); the unlinks run AFTER the commit and tolerate every fs
// error — a live row over a missing file would break serving, the orphan
// file direction is the harmless one. Writes NOTHING to movements (D-05).
export function deleteAttachment(deviceId: number, attachmentId: number): void {
  let storageKey: string | undefined
  db.transaction((tx) => {
    const row = tx
      .select({ storageKey: attachments.storageKey })
      .from(attachments)
      .where(
        and(
          eq(attachments.deviceId, deviceId),
          eq(attachments.id, attachmentId),
        ),
      )
      .get()
    if (!row) throw { code: 'ATTACHMENT_NOT_FOUND' }
    const device = tx
      .select({ status: devices.status })
      .from(devices)
      .where(eq(devices.id, deviceId))
      .get()
    if (!device) throw { code: 'ATTACHMENT_NOT_FOUND' }
    if (device.status === 'disposed') throw { code: 'DISPOSED' }
    tx
      .delete(attachments)
      .where(
        and(
          eq(attachments.deviceId, deviceId),
          eq(attachments.id, attachmentId),
        ),
      )
      .run()
    storageKey = row.storageKey
  })
  if (storageKey === undefined) return // unreachable: throw paths exit above
  for (const key of [storageKey, thumbKeyOf(storageKey)]) {
    try {
      unlink(resolveUploadPath(key)).catch(() => {})
    } catch {
      // containment violation of a tampered key — row is already gone, the
      // file stays an unreachable orphan (harmless direction)
    }
  }
}
