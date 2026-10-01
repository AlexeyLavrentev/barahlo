# Phase 15: Лайтбокс фото устройства - Pattern Map

**Mapped:** 2026-10-01
**Files analyzed:** 4 (1 modified, 3 new)
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/(app)/(card)/devices/[id]/photo-grid.tsx` | component (client island) | event-driven + request-response | сам файл — существующий лайтбокс Dialog внутри него (строки 230–319) | exact |
| `components/zoom-stage.tsx` (НОВЫЙ, D-04: «соседний клиентский модуль» рядом с `photo-grid.tsx`) | component (client) | event-driven (pointer/wheel/double-tap жесты) | `components/command-palette.tsx` (нативные листенеры + refs) + `photo-grid.tsx` (конвенции острова) | role-match |
| `lib/zoom.ts` (НОВЫЙ, опционально — RESEARCH настоятельно рекомендует) | utility | transform (чистая математика зума) | `lib/inventory-increment.ts` | role-match |
| `tests/zoom-math.test.ts` (НОВЫЙ, Wave 0) | test | transform (unit на чистую математику) | `tests/inventory-increment.test.ts` | exact |

**Не трогается (read-only контракты, нулевые правки):** `components/ui/dialog.tsx` (data-slot-поверхность ⌘K-пробы), `components/command-palette.tsx` (селектор пробы строка 223), `lib/photos.ts` (FULL_EDGE=1600 / THUMB_EDGE=400, строки 21–22), `app/api/attachments/[attachmentId]/route.ts` (авторизованная выдача full/thumb).

## Pattern Assignments

### `app/(app)/(card)/devices/[id]/photo-grid.tsx` (component, event-driven + request-response) — MODIFIED

**Analog:** сам файл — фаза усиливает существующий лайтбокс, не создаёт новый. Все правки идут поверх блоков ниже.

**Остров-конвенции** (lines 1–9):
```tsx
'use client'
/* eslint-disable @next/next/no-img-element -- photos are pre-sized at upload
   (1600px full / 400px thumb) and served from an authorized route; next/image
   would re-fetch and re-process auth'd binaries per request for nothing
   (04-RESEARCH decision). */

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
```
Новые `<img>` внутри этого файла наследуют file-level eslint-disable — новый директив НЕ добавлять. Импорт иконок расширяется в ту же строку lucide-react: `ChevronLeft`, `ChevronRight` (экспорты верифицированы RESEARCH).

**URL-билдеры + производная навигация** (lines 81–88, 145–146) — зум-стейдж садится на готовую конструкцию:
```tsx
const fullUrl = useCallback(
  (id: number) => `/api/attachments/${id}?device=${deviceId}&variant=full`,
  [deviceId],
)
// ...
const lightboxIndex = photos.findIndex((p) => p.id === lightboxId)
const lightboxPhoto = lightboxIndex >= 0 ? photos[lightboxIndex] : null
```
`lightboxIndex` уже существует — prev/next-стрелки (D-01) вычисляются из него: `index > 0` / `index < photos.length - 1`, инертные края без цикличности.

**Существующий лайтбокс — точка усиления** (lines 230–279):
```tsx
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
            <Button variant="secondary" onClick={/* ... */}>Удалить фото</Button>
          </div>
        ) : null}
      </>
    ) : null}
  </DialogContent>
</Dialog>
```
Правки фазы (D-03): `className` DialogContent → `max-w-5xl sm:max-w-5xl` ( Pitfall 2: tailwind-merge НЕ перебивает базовый `sm:max-w-sm` из `components/ui/dialog.tsx` строка 59 — передавать ОБА класса); `<img>` заменяется на `<ZoomStage key={photo.id} …>`; контролы (close, «Удалить фото», стрелки, счётчик) остаются сиблингами стейджа вне transform (`z-10`). Контракт держать: `showCloseButton={false}` + собственный DialogClose с `aria-label="Закрыть"`, sr-only `DialogTitle`, гейт `canMutate` (D-06).

**Русские копии — однострочные шаблонные литералы** (lines 148–151) — паттерн для нового счётчика «N из M» (discretion, CONTEXT):
```tsx
// Precomputed whole strings: React SSR splits interpolated text nodes with
// <!-- --> markers — the smoke asserts these copies byte-exact.
const counter = `${photos.length} из ${maxPhotos}`
```
Новые копии лайтбокса («N из M», aria-label стрелок) — тот же приём. НО: их пинить smoke-ом НЕЛЬЗЯ —DialogContent маунтится только при open (портал), SSR их не видит (RESEARCH Pitfall 10); проверка — UAT.

**Delete-confirm сиблинг-портал — не трогается** (lines 281–319): стекается с лайтбоксом как сиблинг. Единственная связка с фазой — Pitfall 9: guard `if (confirmOpen) return` в keydown-обработчике ←/→ (RESEARCH рекомендует: guard передаётся в ZoomStage пропсом или проверяется на уровне photo-grid).

**Fade-in/loading стейт:** `loaded` ставится в `onLoad` атрибуте `<img>` (event handler — легально для React 19), НЕ в useEffect (правило `set-state-in-effect` eslint-config-next/core-web-vitals этого репо — `eslint.config.mjs` подключает оба пресета; прецедент честного соблюдения — `components/command-palette.tsx` строки 196–207).

---

### `components/zoom-stage.tsx` (component, event-driven) — НОВЫЙ

**Analog:** `components/command-palette.tsx` — единственный клиентский компонент репо с `useEffect` + нативными `addEventListener`/`removeEventListener` и refs на внешние ресурсы.

**Нативный листенер с очисткой — каркас для non-passive wheel** (`components/command-palette.tsx` lines 211–232):
```tsx
useEffect(() => {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== 'KeyK') return
    // ...guards...
    e.preventDefault() // beats Chrome's Ctrl+K address-bar search
  }
  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}, [open])
```
ZoomStage повторяет форму: `stageRef.current.addEventListener('wheel', onWheel, { passive: false })` + обязательный `removeEventListener` в cleanup (RESEARCH Pattern 2; React `onWheel` пассивен — Pitfall 1). Аналогично keydown ←/→ для prev/next (D-01) — тоже нативный листенер по этому каркасу.

**Сброс состояния в хендлере события, не в effect** (`components/command-palette.tsx` lines 196–207):
```tsx
// Opening is the ONE reset point (D-03): query and results die with the
// previous session, so the fresh open starts from an empty input and an
// instant fetch. Resetting here (an event handler) instead of in a
// close effect keeps the React-19 set-state-in-effect rule honest.
const openPalette = () => {
  abortRef.current?.abort()
  setQ('')
  setResults(EMPTY_RESULTS)
  // ...
}
```
Прямое соответствие RESEARCH Pattern 4: сброс зума при prev/next — key-ремаут `<ZoomStage key={photo.id}>` (React монтирует свежий стейдж `scale=1, t=0`), НИКАКОГО `setState` в теле эффекта по `photo.id`.

**Refs на мутабельное жестовое состояние** (`components/command-palette.tsx` lines 190–194):
```tsx
const abortRef = useRef<AbortController | null>(null)
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```
Pointer-кэш (`Map<pointerId, {x, y}>`), pinch-базис, тайминг double-tap — в `useRef`, не в state: только `{scale, tx, ty}` и `loaded` — React state (RESEARCH Patterns 1/3/5).

**Island-структура и хендлеры:** приемы из `photo-grid.tsx` — `useCallback` для хендлеров, Props-тип с явным объектом (photo-grid строки 61–71), краткий header-комментарий с контрактом (photo-grid строки 18–27: номер фазы/решений, почему так). Файл помечается `'use client'`.

**Специфичный код (pointer/pinch/wheel математика) — БЕЗ аналога в кодbase:** репозиторий не содержит ни одного `onPointerDown`/`onWheel`/`setPointerCapture`. Сами жесты строятся по RESEARCH.md Patterns 1–5 и Pitfalls 1–9, а не по коду репо. Из аналогов берётся только структурная обвязка (выше).

---

### `lib/zoom.ts` (utility, transform) — НОВЫЙ (опционально)

**Analog:** `lib/inventory-increment.ts` — каноничный pure-хелпер репо, его шапка фиксирует конвенцию:
```ts
// «Следующий по шаблону» для инвентарного номера (REG-06, D-02). Pure named
// export over Node built-ins only — same convention as lib/ru.ts: no
// framework imports, no side effects, safe to import from RSC, client
// components and vitest alike. ONE source for BOTH consumers (D-02, RESEARCH
// Pitfall 7)...
export function nextInventoryNumber(raw: string | null | undefined): string {
```
`lib/zoom.ts` следует той же конвенции: чистые named exports (`clamp`, `zoomAtPoint`, `clampOffset` — RESEARCH Don't-Hand-Roll), ноль фреймворк-импортов, без side effects — импортируемые из клиентского компонента и vitest одновременно. Header-комментарий по образцу: ссылка на фазу/решение + границы применения (`clamp` [1,4], `zoomAtPoint` по формуле RESEARCH Pattern 1: `t' = (1 − k)·(c − center) + k·t`).

---

### `tests/zoom-math.test.ts` (test, transform) — НОВЫЙ

**Analog:** `tests/inventory-increment.test.ts` — ближайший по природе (unit на чистую математику, без DOM/базы):
```ts
import { describe, expect, it } from 'vitest'
import { nextInventoryNumber } from '@/lib/inventory-increment'

// D-02 matrix (REG-06, SC 3): «следующий по шаблону» с сохранением нулевого
// паддинга; нераспознанный шаблон или пустой оригинал → '' — молча, ничего
// не дописывается. ...
describe('nextInventoryNumber', () => {
  it('increments the tail and keeps zero padding', () => {
    expect(nextInventoryNumber('AB-001')).toBe('AB-002')
```
Форма: импорт через alias `@/lib/zoom`, `describe`/`it` с decision-комментариями-пинками (SC-номера), таблично-матричные expect-блоки. Среда — `environment: 'node'` (`vitest.config.ts`, alias `@` — уже настроен). Запуск: `npx vitest run tests/zoom-math.test.ts`. Компонентного раннера в репо НЕТ (решение фазы 2) — JSX/жесты тестами не покрывать (RESEARCH Wave 0 Gaps).

## Shared Patterns

### Клиентский остров + router.refresh после мутаций
**Source:** `app/(app)/(card)/devices/[id]/photo-grid.tsx` lines 95–143
**Apply to:** `photo-grid.tsx` (уже есть), не трогается
```tsx
if (stored > 0) router.refresh() // full success and partial alike
// ...
setConfirmOpen(false)
setLightboxId(null)
router.refresh()
```
Delete-флоу (D-06) не переписывается: после refresh грида лайтбокс закрывается сам (lightboxId=null) — ZoomStage размонтируется, сброс зума происходит конструктивно.

### Нативный event listener в useEffect с обязательной очисткой
**Source:** `components/command-palette.tsx` lines 211–232
**Apply to:** `components/zoom-stage.tsx` (wheel — non-passive; keydown ←/→ — passive)
```tsx
useEffect(() => {
  const handler = (e: ...) => { /* guards, e.preventDefault() */ }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [deps])
```
Стейдж маунтится/анмаунтится вместе с порталом диалога — жизненный цикл эффектов чистый (RESEARCH Primary recommendation).

### Никакого setState в теле эффекта (React 19 правило репо)
**Source:** `components/command-palette.tsx` lines 196–207 (комментарий-прецедент); `eslint.config.mjs` (пресеты `eslint-config-next/core-web-vitals` + `/typescript`)
**Apply to:** `components/zoom-stage.tsx`, `photo-grid.tsx`
Сброс зума — key-ремаут `<ZoomStage key={photo.id} …/>` (RESEARCH Pattern 4); `loaded` — в `onLoad` event handler. Замена фото = новый key = свежий mount с `scale=1, t=0, loaded=false`.

### Русские копии — однострочные шаблонные литералы (байт-точность)
**Source:** `app/(app)/(card)/devices/[id]/photo-grid.tsx` lines 148–151
**Apply to:** новые копии лайтбокса (счётчик «N из M», aria-label стрелок)
```tsx
const counter = `${photos.length} из ${maxPhotos}`
```
Проверка копий — UAT (Playwright MCP-паттерн фаз 7/10), НЕ smoke: лайтбокс-интерьер client-only, в SSR HTML не попадает (RESEARCH Pitfall 10). `scripts/smoke-custody.mjs` остаётся регрессией грида/роутов.

### cn() + tailwind-merge: конфликт max-w между модификаторами
**Source:** `components/ui/dialog.tsx` line 59 (базовый `sm:max-w-sm`), `lib/utils.ts` (cn = clsx + tailwind-merge)
**Apply to:** правка className DialogContent в `photo-grid.tsx`
`cn("…sm:max-w-sm", "max-w-5xl")` оставляет `sm:max-w-sm` — tailwind-merge резолвит конфликт только внутри одного модификатора (RESEARCH Pitfall 2, верифицировано локальным запуском). Передавать оба: `max-w-5xl sm:max-w-5xl`.

### Кнопки/иконки: Button-варианты + aria-label, DialogClose render-паттерн
**Source:** `app/(app)/(card)/devices/[id]/photo-grid.tsx` lines 243–254; `components/ui/dialog.tsx` lines 65–80
**Apply to:** стрелки prev/next в `photo-grid.tsx`
```tsx
<DialogClose render={<Button variant="ghost" size="icon-sm" className="absolute … z-10" aria-label="Закрыть" />}>
  <X aria-hidden />
</DialogClose>
```
Иконки — lucide-react (X уже используется; ChevronLeft/ChevronRight — верифицированные экспорты). Именованные aria-label на русском («Предыдущее фото», «Следующее фото») по паттерну `aria-label="Закрыть"` и грид-игле `Фото N из M`.

### Контракты, которые нельзя сломать (read-only)
**Source:** `components/command-palette.tsx` line 223; `components/ui/dialog.tsx` line 55; `lib/photos.ts` lines 21–22
**Apply to:** все правки фазы
```tsx
'[data-slot="dialog-content"][data-open]:not([data-command-palette])'
```
Лайтбокс рендерится ТОЛЬКО через обёртки `components/ui/dialog.tsx` (`DialogContent` несёт `data-slot="dialog-content"`; `data-open` эмитит Base UI) — иначе умирает ⌘K-проба (SC 4, Pitfall 11). DELETE-роут, canMutate-гейт, photo-пайплайн — без изменений (D-05/D-06).

## No Analog Found

Полных аналогов нет, но классифицированные файлы покрыты комбинацией аналогов + RESEARCH. Жестовая специфика, для которой в кодbase НЕТ ни строчки (планировщику брать из RESEARCH.md Patterns 1–5, а не из кода):

| Аспект | Роль | Data Flow | Reason |
|--------|------|-----------|--------|
| Pointer-кэш drag/pinch, double-tap детекция, wheel zoom-to-cursor | внутри `components/zoom-stage.tsx` | event-driven | В репо ноль `onPointerDown`/`onWheel`/`setPointerCapture` — жесты отсутствуют; канон — RESEARCH Patterns 1–5 (MDN Pointer Events + Jake Archibald) |
| Математика `zoomAtPoint`/`clampOffset`/`clamp` | `lib/zoom.ts` | transform | В `lib/` нет геометрических хелперов; формула `t' = (1 − k)·(c − center) + k·t` — RESEARCH Pattern 1; конвенция файла — `lib/inventory-increment.ts` |

## Metadata

**Analog search scope:** `app/`, `app/(app)`, `components/`, `components/ui/`, `lib/`, `tests/`
**Files scanned:** ~45 (grep по useEffect/addEventListener/onPointer/keydown/pointer; чтение: photo-grid.tsx, dialog.tsx, command-palette.tsx, lib/utils.ts, lib/inventory-increment.ts, tests/inventory-increment.test.ts, vitest.config.ts, eslint.config.mjs)
**Pattern extraction date:** 2026-10-01
