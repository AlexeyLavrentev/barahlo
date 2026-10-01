'use client'
/* eslint-disable @next/next/no-img-element -- photos are pre-sized at upload
   (1600px full / 400px thumb) and served from an authorized route; next/image
   would re-fetch and re-process auth'd binaries per request for nothing
   (04-RESEARCH decision). */

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { ZoomStage } from '@/components/zoom-stage'

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
  try {
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  } finally {
    // Canvas holds its own pixel copy — close even if drawImage throws
    // (code-review IN-02: ImageBitmap leak on the error path).
    bitmap.close()
  }
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
  // Lightbox alt (same one-line-literal pattern; client-only portal content —
  // UAT-checked, never smoke-pinned — RESEARCH Pitfall 10).
  const lightboxAlt = `Фото ${lightboxIndex + 1} из ${photos.length}`
  // Lightbox nav counter «{n} из {m}» (D-01) — one whole string, the grid
  // counter pattern; stays visible at M=1 («1 из 1»).
  const lightboxCounter = `${lightboxIndex + 1} из ${photos.length}`

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

      {/* Lightbox (UI-SPEC, Phase 15 D-03): widened to max-w-5xl — BOTH max-w
          classes are required, tailwind-merge keeps the base sm:max-w-sm from
          dialog.tsx otherwise (Pitfall 2). The full variant renders in
          ZoomStage (key=photo.id remount resets zoom constructively, Pattern
          4); «Удалить фото» and close are stage SIBLINGS outside the CSS
          transform (absolute z-10) — mounted and clickable at any zoom
          (SC 4). Deleted/refreshed ids close cleanly. prev/next arrows (D-01)
          flank the stage — rendered at M>1 only, the edge one disabled (not
          hidden); the counter chip stays at every M. */}
      <Dialog
        open={lightboxPhoto !== null}
        onOpenChange={(open) => {
          if (!open) setLightboxId(null)
        }}
      >
        <DialogContent
          className="max-w-5xl sm:max-w-5xl p-4"
          showCloseButton={false}
          onKeyDown={(e) => {
            // ←/→ navigate (D-01) with NO window listener (Pitfall 9): the
            // source must live inside the lightbox — when the delete-confirm
            // or the ⌘K palette is open, focus sits in THEIR portal and this
            // handler never fires, so the keys are inert behind foreign
            // modals. Zoom reset on transition is constructive: the id change
            // remounts ZoomStage via key (Pattern 4) — no reset code here.
            if (e.key === 'ArrowLeft' && lightboxIndex > 0) {
              setLightboxId(photos[lightboxIndex - 1].id)
            } else if (
              e.key === 'ArrowRight' &&
              lightboxIndex < photos.length - 1
            ) {
              setLightboxId(photos[lightboxIndex + 1].id)
            }
          }}
        >
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
              {/* Counter chip (Default 4/8): top-2 left-2, Label role
                  (text-sm text-ink-secondary) — the ONLY new visible copy. */}
              <span className="absolute top-2 left-2 z-10 flex h-11 items-center rounded-full bg-surface/90 px-4 text-sm text-ink-secondary">
                {lightboxCounter}
              </span>
              {/* Prev/next arrows (D-01): non-circular — the edge arrow is
                  disabled (Button register: opacity-50 + pointer-events-none),
                  NOT hidden (Default 12); at M=1 neither renders. Overlay
                  recipe: size-11 rounded-full bg-surface/90 + hairline ring
                  (UI-SPEC); icons 20px via size-5 (the Button [&_svg] rule
                  would pin size-4 otherwise). */}
              {photos.length > 1 ? (
                <>
                  <Button
                    variant="ghost"
                    className="absolute top-1/2 left-2 z-10 size-11 -translate-y-1/2 rounded-full bg-surface/90 text-ink ring-1 ring-foreground/10 hover:bg-surface"
                    aria-label="Предыдущее фото"
                    disabled={lightboxIndex <= 0}
                    onClick={() => setLightboxId(photos[lightboxIndex - 1].id)}
                  >
                    <ChevronLeft className="size-5" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    className="absolute top-1/2 right-2 z-10 size-11 -translate-y-1/2 rounded-full bg-surface/90 text-ink ring-1 ring-foreground/10 hover:bg-surface"
                    aria-label="Следующее фото"
                    disabled={lightboxIndex >= photos.length - 1}
                    onClick={() =>
                      setLightboxId(photos[lightboxIndex + 1].id)
                    }
                  >
                    <ChevronRight className="size-5" aria-hidden />
                  </Button>
                </>
              ) : null}
            </>
          ) : null}
          {lightboxPhoto ? (
            <ZoomStage
              key={lightboxPhoto.id}
              src={fullUrl(lightboxPhoto.id)}
              alt={lightboxAlt}
            />
          ) : null}
          {canMutate ? (
            <Button
              variant="secondary"
              className="absolute bottom-2 left-2 z-10 h-11 rounded-lg bg-surface/90 px-4 font-normal text-ink ring-1 ring-foreground/10 hover:bg-surface"
              onClick={() => {
                setDeleteError(null)
                setConfirmOpen(true)
              }}
            >
              Удалить фото
            </Button>
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
