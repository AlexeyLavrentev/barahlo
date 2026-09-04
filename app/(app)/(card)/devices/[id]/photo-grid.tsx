'use client'
/* eslint-disable @next/next/no-img-element -- photos are pre-sized at upload
   (1600px full / 400px thumb) and served from an authorized route; next/image
   would re-fetch and re-process auth'd binaries per request for nothing
   (04-RESEARCH decision). */

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'

// The photo section island (REG-05, D-05, D-06; 04-UI-SPEC «Photos»): 3/4-col
// grid of thumbnails, add tile (phones included — the OS sheet offers
// «Сделать фото» since accept=image/* and capture is NOT set, which would
// block library choice), lightbox with a neutral delete confirm. Uploads and
// deletes go through the authorized routes (never static files), then
// router.refresh() re-renders the server card — without it the grid stays
// stale (RESEARCH Pitfall 2).
//
// Error copy is the single UI-SPEC string for every failure shape (cap,
// format, size — the server distinguishes codes, v1 surfaces one copy).

export type PhotoAttachment = { id: number; fileName: string }

const UPLOAD_ERROR = 'Не удалось загрузить фото. Попробуйте ещё раз.'
const DELETE_ERROR = 'Не удалось удалить фото. Попробуйте ещё раз.'
const ERROR_CLASS = 'text-sm text-[#D70015]'

// Client resize ceiling — the server re-encodes to the same 1600px bound
// anyway (lib/photos FULL_EDGE); this constant only shapes the upload payload
// (RESEARCH C5: bandwidth saver, never the EXIF guarantee).
const MAX_EDGE = 1600

// RESEARCH C5 client resize, verbatim semantics: createImageBitmap bakes EXIF
// orientation into the bitmap by spec default, classic canvas (not
// OffscreenCanvas) is universally safe, output carries no EXIF. Rejection
// (HEIC on a non-WebKit browser) lands in the same UPLOAD_ERROR path.
async function resizeToJpeg(file: File, maxEdge = MAX_EDGE): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((res, rej) =>
    canvas.toBlob(
      (b) => (b ? res(b) : rej(new Error('toBlob failed'))),
      'image/jpeg',
      0.85,
    ),
  )
}

export function PhotoGrid({
  deviceId,
  photos,
  canMutate,
  maxPhotos,
}: {
  deviceId: number
  photos: PhotoAttachment[]
  canMutate: boolean
  maxPhotos: number
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [lightboxId, setLightboxId] = useState<number | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const thumbUrl = useCallback(
    (id: number) => `/api/attachments/${id}?device=${deviceId}&variant=thumb`,
    [deviceId],
  )
  const fullUrl = useCallback(
    (id: number) => `/api/attachments/${id}?device=${deviceId}&variant=full`,
    [deviceId],
  )

  // Sequential per-file upload (RESEARCH A4 — ≤8 phone photos, no
  // Promise.all burst); every failure aborts the rest with the single copy.
  // A mid-batch failure keeps the already-stored files server-side (the
  // upload route's contract), so the refresh runs whenever ≥1 file landed —
  // the grid must show the partial success, not hide it behind the error.
  const onFilesChosen = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return
      setUploading(true)
      setUploadError(null)
      let stored = 0
      try {
        for (const file of Array.from(fileList)) {
          const blob = await resizeToJpeg(file)
          const form = new FormData()
          form.append('file', blob, file.name)
          const res = await fetch(`/api/devices/${deviceId}/photos`, {
            method: 'POST',
            body: form,
          })
          if (!res.ok) throw new Error(`upload failed: ${res.status}`)
          stored += 1
        }
      } catch {
        setUploadError(UPLOAD_ERROR)
      } finally {
        setUploading(false)
        // Reset so choosing the SAME file again re-fires onChange.
        if (inputRef.current) inputRef.current.value = ''
        if (stored > 0) router.refresh() // full success and partial alike
      }
    },
    [deviceId, router],
  )

  const onDelete = useCallback(async () => {
    if (lightboxId === null || deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(
        `/api/attachments/${lightboxId}?device=${deviceId}`,
        { method: 'DELETE' },
      )
      if (!res.ok) throw new Error(`delete failed: ${res.status}`)
      setConfirmOpen(false)
      setLightboxId(null)
      router.refresh()
    } catch {
      setDeleteError(DELETE_ERROR)
    } finally {
      setDeleting(false)
    }
  }, [deviceId, lightboxId, deleting, router])

  const lightboxIndex = photos.findIndex((p) => p.id === lightboxId)
  const lightboxPhoto = lightboxIndex >= 0 ? photos[lightboxIndex] : null

  // Precomputed whole strings: React SSR splits interpolated text nodes with
  // <!-- --> markers — the smoke asserts these copies byte-exact.
  const counter = `${photos.length} из ${maxPhotos}`
  const emptyBody = `Добавьте до ${maxPhotos} фото — подойдут снимки с телефона.`

  return (
    <section className="mt-8">
      {/* Header row: «Фото» + counter right (UI-SPEC) — the counter renders
          «0 из 8» on empty cards too. */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight text-ink">Фото</h2>
        <span className="text-sm text-ink-secondary">{counter}</span>
      </div>

      {/* Grid: 3 cols, 4 from sm; tiles aspect-square object-cover (UI-SPEC
          spacing). */}
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.length === 0 ? (
          <div className="col-span-2 flex flex-col justify-center">
            <p className="text-base text-ink">Фотографий пока нет</p>
            <p className="mt-1 text-sm text-ink-secondary">{emptyBody}</p>
          </div>
        ) : (
          photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => {
                setDeleteError(null)
                setLightboxId(photo.id)
              }}
              aria-label={`Фото ${index + 1} из ${photos.length}`}
              className="aspect-square overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            >
              <img
                src={thumbUrl(photo.id)}
                alt={`Фото ${index + 1} из ${photos.length}`}
                loading="lazy"
                className="size-full object-cover"
              />
            </button>
          ))
        )}

        {/* Add tile — same footprint, dashed hairline; hidden at 8/8 and for
            disposed devices (D-03 view-only; the server re-checks the cap:
            Pitfall 7). «Загрузка…» fill while the batch is in flight. */}
        {canMutate && photos.length < maxPhotos ? (
          <label
            className={`flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-hairline text-sm text-ink-secondary transition-colors hover:bg-black/5 ${
              uploading ? 'bg-black/5' : ''
            }`}
          >
            {uploading ? (
              'Загрузка…'
            ) : (
              <>
                <Plus size={20} aria-hidden />
                Добавить
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              disabled={uploading}
              className="sr-only"
              onChange={(event) => {
                void onFilesChosen(event.target.files)
              }}
            />
          </label>
        ) : null}
      </div>

      {uploadError ? (
        <p className={ERROR_CLASS} role="alert">
          {uploadError}
        </p>
      ) : null}

      {/* Lightbox (UI-SPEC): max-w-3xl panel, image capped at 70svh; «Удалить
          фото» secondary on the left; custom close with the «Закрыть»
          aria-label (a11y fallbacks). Deleted/refreshed ids close cleanly. */}
      <Dialog
        open={lightboxPhoto !== null}
        onOpenChange={(open) => {
          if (!open) setLightboxId(null)
        }}
      >
        <DialogContent className="max-w-3xl p-4" showCloseButton={false}>
          <DialogTitle className="sr-only">
            {lightboxPhoto ? lightboxPhoto.fileName : 'Фото'}
          </DialogTitle>
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-2 right-2 z-10"
                aria-label="Закрыть"
              />
            }
          >
            <X aria-hidden />
          </DialogClose>
          {lightboxPhoto ? (
            <>
              <img
                src={fullUrl(lightboxPhoto.id)}
                alt={`Фото ${lightboxIndex + 1} из ${photos.length}`}
                loading="lazy"
                className="mx-auto max-h-[70svh] w-auto rounded-lg"
              />
              {canMutate ? (
                <div className="flex">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setDeleteError(null)
                      setConfirmOpen(true)
                    }}
                  >
                    Удалить фото
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Delete confirm — neutral ink primary; red is contractually reserved
          for «Списать» (D-03; UI-SPEC Default 11). Sibling of the lightbox so
          the portals stack cleanly. */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open) setConfirmOpen(false)
        }}
      >
        <DialogContent className="max-w-md p-6">
          <DialogTitle>Удалить фото?</DialogTitle>
          <p className="text-sm text-ink-secondary">
            Фото будет удалено безвозвратно.
          </p>
          {deleteError ? (
            <p className={ERROR_CLASS} role="alert">
              {deleteError}
            </p>
          ) : null}
          <div className="flex flex-row-reverse gap-2">
            <Button
              className="bg-ink font-semibold text-white hover:bg-ink/90"
              onClick={() => {
                void onDelete()
              }}
              disabled={deleting}
            >
              Удалить
            </Button>
            <Button
              variant="secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
            >
              Не удалять
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
