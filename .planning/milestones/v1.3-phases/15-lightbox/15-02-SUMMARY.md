---
phase: 15-lightbox
plan: 02
subsystem: client-island
tags: [lightbox, zoom, pointer-events, gestures, pinch, drag-pan, double-tap, pointercancel, prev-next-navigation, keyboard, base-ui-dialog, photo-grid]

# Dependency graph
requires:
  - phase: 15-lightbox (plan 15-01)
    provides: lib/zoom.ts (zoomAtPoint/clampOffset/clamp + константы MIN_SCALE/MAX_SCALE/DOUBLE_CLICK_SCALE/DBL_TAP_WINDOW_MS/DRAG_THRESHOLD_PX), ZoomStage-каркас ({scale,tx,ty}, нативный non-passive wheel, fade-in по onLoad, stageRef/imgRef), photo-grid.tsx lightboxIndex/lightboxPhoto + key-ремоут <ZoomStage key={photo.id}>
provides:
  - components/zoom-stage.tsx — полный жестовой контракт (SC 2/3): drag-pan t=t0+Δ при scale>1, pinch s'=clamp(scale0·dist/dist0,[1,4]) к текущему midpoint, двойной клик/тап-тоггл 1↔2.5 к позиции тапа (одиночный клик инертен, D-02), полный сброс на pointercancel/lostpointercapture (iOS-гвад SC 3), переанкер pan при 2→1 указателе, cursor-grab/grabbing
  - app/(app)/(card)/devices/[id]/photo-grid.tsx — навигация D-01: стрелки ChevronLeft/ChevronRight по краям стейджа (крайняя disabled, при M=1 скрыты), счётчик-чип «{n} из {m}» (живёт и при M=1), клавиши ←/→ на onKeyDown DialogContent — инертны при открытом delete-confirm/⌘K
  - PHOTO-01 закрыт: SC 1–4 автоматизированной частью зелёные; жесты/фокус/визуал — UAT end-of-phase (human_verify_mode)
affects: [verify-work (UAT end-of-phase 15), v2 (MOB-01-класс)]

# Tech tracking
tech-stack:
  added: [] # ноль новых зависимостей (D-04; acceptance-гейт git diff -- package.json/package-lock.json пуст)
  patterns: [unified Pointer Events + pointer-кэш Map<pointerId,{x,y}> в useRef (MDN Pattern 3), pinch с якорем на ТЕКУЩИЙ midpoint (zoomAtPoint рекомпозится per-event), ручная double-tap детекция (300ms окно + 5px порог + близость тапов), полный gesture-reset на pointercancel И lostpointercapture с guard-ом на имплицитный release, императивный курсор el.style.cursor без экстра React-state, onKeyDown на DialogContent вместо window-листенера (фокус-семантика Base UI как guard)]

key-files:
  created: []
  modified:
    - components/zoom-stage.tsx
    - app/(app)/(card)/devices/[id]/photo-grid.tsx

key-decisions:
  - "Pinch-якорь — ТЕКУЩИЙ midpoint каждого move: zoomAtPoint(prev, nextScale, mid) рекомпозится per-event из актуального состояния; поля базиса mid0/tx0/ty0 из скетча плана стали бы мёртвым кодом, а композиция через zoomAtPoint даёт «пальцы ведут фото» (pinch+pan) и держит acceptance-критерий «математика только через lib/zoom.ts»"
  - "lostpointercapture-гвад гвардится проверкой pointerId-в-кэше: по W3C PE spec имплицитный release ПОСЛЕ каждого pointerup/pointercancel тоже файрит lostpointercapture — буквальный полный сброс там стирал бы только что записанный pending-даблтап и убивал SC 2 (Rule 1, см. Deviations)"
  - "Курсор grab/grabbing — императивно el.style.cursor в хендлерах (refs), без дополнительного React-state: контракт плана «React-state только {scale,tx,ty} и loaded» сохранён буква-в-букву; grab при scale>1 — класс по state зума"
  - "Иконки стрелок — className=\"size-5\" вместо size={20}: базовое правило Button [&_svg:not([class*='size-'])]:size-4 перебило бы lucide width/height-атрибуты (CSS сильнее атрибутов); size-5 = ровно 20px по UI-SPEC"
  - "Чип счётчика без ring-1 (в отличие от стрелок): план-акция и анатомия UI-SPEC перечисляют для чипа только bg-surface/90 px-4 text-sm text-ink-secondary; ring-1 ring-foreground/10 — рецепт стрелок/кнопок"

requirements-completed: [PHOTO-01]

coverage:
  - id: T1
    description: "SC 2 (drag/pinch/даблклик): pointer-кэш в useRef, pan t=t0+Δ только при scale>1 с clampOffset (ось без избытка → 0), pinch к midpoint с guard dist>0 и clamp [1,4], ручная double-tap детекция (300ms/5px/близость) с тогглом doubleClickTargetScale; одиночный клик инертен"
    requirement: PHOTO-01
    verification:
      - kind: cli
        ref: "grep pointercancel=3, lostpointercapture=2 в zoom-stage.tsx; tsc/lint/vitest 530/530 зелёные; математика — только импорты '@/lib/zoom'"
        status: pass
    human_judgment: true
    rationale: "Ощущение жестов (матрица UI-SPEC, бесшовный 2→1, отсутствие рывков) — touch-эмуляция/UAT end-of-phase"
  - id: T2
    description: "SC 3 (сброс): pointercancel И lostpointercapture полностью сбрасывают жестовое состояние (кэш, базис, pan-старт, pending-тап); переход prev/next сбрасывает (1x,0,0) конструктивно — key-ремоут ZoomStage по photo.id (ноль кода сброса)"
    requirement: PHOTO-01
    verification:
      - kind: cli
        ref: "source-assert: onPointerCancel=resetGesture, onLostPointerCapture=guard+reset; в photo-grid нет кода сброса зума — только key={lightboxPhoto.id}"
        status: pass
    human_judgment: true
    rationale: "iOS pointercancel-поведение — UAT оператора на реальном iPhone (A5, эмуляция покрывает Chrome-сторону)"
  - id: T3
    description: "D-01 навигация: стрелки рендерятся при M>1, крайняя disabled (Button-регистр opacity-50+pointer-events-none), при M=1 скрыты; счётчик lightboxCounter — один однострочный литерал, чип top-2 left-2; aria-label «Предыдущее фото»/«Следующее фото»"
    requirement: PHOTO-01
    verification:
      - kind: cli
        ref: "grep -c lightboxCounter=2 (объявление+рендер); tsc/lint/vitest зелёные"
        status: pass
    human_judgment: true
    rationale: "Визуал чипа/стрелок и копии — client-only портал, проверка UAT (Pitfall 10, smoke не пинит)"
  - id: T4
    description: "Guard-контракт клавиш: onKeyDown на DialogContent лайтбокса, БЕЗ window-листенера — при delete-confirm/⌘K фокус в их порталах, хендлер не файрит (Pitfall 9, Default 13); переход setLightboxId соседнего id"
    requirement: PHOTO-01
    verification:
      - kind: cli
        ref: "source-assert: onKeyDown на DialogContent; window.addEventListener для Arrow в photo-grid отсутствует; vitest 530/530 (регрессия)"
        status: pass
    human_judgment: true
    rationale: "Фокус-семантика при открытых чужих модалках — UAT end-of-phase"
  - id: T5
    description: "Контракты не тронуты: ⌘K-проба жива (dialog.tsx/command-palette.tsx нулевой diff), роуты app/api не менялись (D-05), ноль новых зависимостей (D-04), грид/upload/delete-confirm байт-точны"
    requirement: PHOTO-01
    verification:
      - kind: cli
        ref: "git diff --stat -- package.json package-lock.json components/ui/dialog.tsx components/command-palette.tsx — пусто; smoke-custody на :3116 зелёный (грид/роуты-регрессия)"
        status: pass
    human_judgment: false

# Metrics
duration: 7min
completed: 2026-10-01
status: complete
---

# Phase 15 Plan 02: Жестовой контракт зум-стейджа + prev/next-навигация Summary

**Полный жестовой контракт ZoomStage (drag-pan, pinch к midpoint, двойной клик/тап 1↔2.5, iOS pointercancel/lostpointercapture-гвад) поверх математики lib/zoom.ts + навигация D-01 (стрелки/счётчик «N из M»/клавиши ←/→ с guard-контрактом) — PHOTO-01 закрыт: suite 530/530, lint 0 ошибок, smoke-custody зелёный, ноль новых зависимостей**

## Performance

- **Duration:** 7 min
- **Started:** 2026-10-01T07:17:57Z
- **Completed:** 2026-10-01T07:24:27Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Task 1: `components/zoom-stage.tsx` — жестовое состояние в refs (pointer-кэш `Map<pointerId,{x,y}>`, pan-старт {clientX,clientY,tx0,ty0}, pinch-базис {dist0,scale0}, тап-трекинг down/lastTap); React-state по-прежнему только {scale,tx,ty}+loaded. Drag-pan `t = t0 + Δ` функциональным setState через clampOffset — только при scale>1 (ось без избытка → 0, пан на 1x невозможен). Pinch `s' = clamp(scale0·dist/dist0, 1, 4)` через lib-clamp + zoomAtPoint к ТЕКУЩЕМУ midpoint, guard dist>0 (MDN prevDiff). Двойной клик/тап: два pointerup в окне DBL_TAP_WINDOW_MS=300 с перемещением < DRAG_THRESHOLD_PX=5 и близостью тапов < 5px → тоггл doubleClickTargetScale к позиции тапа через zoomAtPoint; одиночный клик инертен (D-02); третий тап начинает свежий цикл. Полный сброс на onPointerCancel И onLostPointerCapture (SC 3); переанкер pan-старта при 2→1 указателе (Pitfall 6, бесшовный pinch→pan). setPointerCapture на pointerdown (try/catch на гонку), mouse-guard e.button!==0, курсор grab/grabbing (Default 10). Geometry-хелперы distance/offsetFromCenter — внутри модуля, математика зума — исключительно lib/zoom.ts
- Task 2: `photo-grid.tsx` — lucide-импорт расширен ChevronLeft/ChevronRight; стрелки-сиблинги ZoomStage `absolute top-1/2 left/right-2 z-10 size-11 -translate-y-1/2 rounded-full bg-surface/90 ring-1 ring-foreground/10 hover:bg-surface text-ink` (tailwind-merge резолвит size-11 против базового h-8 и rounded-full против rounded-lg — верифицировано локальным прогоном twMerge); крайняя disabled (Default 12 — инертна, не скрыта), при M=1 обе не рендерятся (Default 4); счётчик `lightboxCounter` — один однострочный шаблонный литерал, чип `absolute top-2 left-2 z-10 h-11 rounded-full bg-surface/90 px-4 text-sm text-ink-secondary` (живёт и при M=1 — «1 из 1»); клавиши ←/→ — onKeyDown на DialogContent, БЕЗ window-листенера (Pitfall 9/Default 13: при confirm/⌘K фокус в чужих порталах — инертно); сброс зума при переходе конструктивен (key-ремоут из 15-01), ноль кода сброса
- Acceptance-гейты: tsc 0 ошибок, lint 0 ошибок (6 предсуществующих предупреждений — вне скоупа), vitest 530/530, smoke-custody на :3116 зелёный, `git diff -- package.json package-lock.json components/ui/dialog.tsx components/command-palette.tsx` пуст (D-04 + ⌘K-проба жива)

## Task Commits

1. **Task 1: Pointer-жесты — drag-pan, pinch, двойной клик/тап, iOS pointercancel-гвад** - `9c53488` (feat)
2. **Task 2: Навигация prev/next — стрелки, счётчик «N из M», клавиши ←/→** - `07b79a8` (feat)

## Files Created/Modified

- `components/zoom-stage.tsx` (MODIFIED, 98 → 340 строк) — полный жестовой контракт поверх каркаса 15-01: 5 pointer-хендлеров как React-props, 5 refs жестового состояния, geometry-хелперы distance/offsetFromCenter; wheel/fade-in/заголовок-контракт сохранены
- `app/(app)/(card)/devices/[id]/photo-grid.tsx` (MODIFIED, +66/−3) — импорт ChevronLeft/Right, lightboxCounter, onKeyDown на DialogContent, стрелки + счётчик-чип (условие lightboxPhoto, стрелки дополнительно photos.length > 1); экспорт-поверхность PhotoGrid({deviceId, photos, canMutate, maxPhotos}) и грид/upload/delete-confirm не тронуты

## Decisions Made

- Pinch-якорь — текущий midpoint каждого move: zoomAtPoint(prev, nextScale, mid) рекомпозится per-event; хранение mid0/tx0/ty0 из скетча плана дало бы мёртвые поля (композиция через zoomAtPoint уже даёт «пальцы ведут фото» — стандартный pinch+pan)
- Курсор grab/grabbing — императивный el.style.cursor в хендлерах (refs): не добавляет React-state, сохраняя контракт «React-state только {scale,tx,ty} и loaded»; класс cursor-grab по state зума подхватывается после сброса inline-стиля
- Иконки стрелок — className="size-5" (ровно 20px): правило Button `[&_svg:not([class*='size-'])]:size-4` перебило бы size={20}-атрибуты lucide (CSS сильнее презентационных атрибутов); close-X (16px) не трогался
- Inter-tap близость даблтапа — DRAG_THRESHOLD_PX (5px): использованы только пиннутые константы lib/zoom; деградация мягкая (промах → тап запоминается заново, следующий тап в окне срабатывает)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Буквальный lostpointercapture-сброс убивал бы двойной тап (SC 2)**
- **Found during:** Task 1 (анализ контракта до написания кода)
- **Issue:** план требует «полный сброс на pointercancel И lostpointercapture», но по W3C PE spec lostpointercapture файритcя имплицитно ПОСЛЕ каждого pointerup/pointercancel — безусловный сброс там стирал бы только что записанный pending-даблтап (lastTapTime) после первого тапа → двойной клик/тап никогда бы не сработал
- **Fix:** lostpointercapture-путь сбрасывает всё только когда pointerId ещё в кэше (capture yanked mid-gesture до обработки up/cancel); нормальное завершение жеста принадлежит up/cancel-путям. Инвариант truth 4 («не залипает») сохранён: pointercancel сбрасывает безусловно, yanked-capture — тоже
- **Files modified:** components/zoom-stage.tsx
- **Verification:** Suite 530/530; гвад покрыт source-assert-ом (grep lostpointercapture=2)
- **Committed in:** 9c53488

**2. [Rule 3 - Blocking] TS18047 «'el' is possibly 'null'» в onPointerUp**
- **Found during:** Task 1 (npx tsc --noEmit)
- **Issue:** double-tap ветка обращалась к el.getBoundingClientRect() без nar­rowing после `if (el) el.style.cursor = ''`
- **Fix:** ранний `if (!el) return` в шапке хендлера — как в остальных pointer-хендлерах
- **Files modified:** components/zoom-stage.tsx
- **Committed in:** 9c53488 (в составе Task 1)

---

**Total deviations:** 2 auto-fixed (Rule 1 + Rule 3), оба немедленно верифицированы. Scope creep нет; запреты соблюдены (колесо только на stageRef, клавиши без window-листенера, ноль новых видимых строк кроме счётчика, красный/accent не расходованы, циклической навигации нет).
**Auth gates:** none. **Дропнутых UI-considerations нет** (11 covered + 2 backstop — как в плане).

## Issues Encountered

- 6 предсуществующих lint-предупреждений (app/(app)/page.tsx, lib/use-search-param.ts, tests/dashboard-queries.test.ts, tests/devices-queries.test.ts) — вне скоупа, не тронуты (наследие фаз 5/7/14)
- 2 backstop-truth плана (сломанный `<img>` без коллапса раскладки; читаемость оверлея bg-surface/90 на самом тёмном фото) — сознательно held-out до UAT end-of-phase
- Human-check матрица (touch-эмуляция: drag/pinch/даблтап/pointercancel-гвад; переходы сбрасывают зум; края disabled; M=1; confirm/⌘K-инертность) и iPhone-UAT (pinch/pointercancel на iOS) — переносятся на UAT end-of-phase по human_verify_mode

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 15 — последняя фаза вехи v1.3: оба плана исполнены, PHOTO-01 закрывается; для /gsd-verify-work остаются UAT-чеклист (жесты мышь/тач, ⌘K, delete, ESC+скролл-лок, iOS pointercancel, backstop-визуалы) и 2 backstop-truth
- Регрессия чистая: suite 530/530 (изменений тестовой поверхности нет — жесты client-only), smoke-custody зелёный, контракты ⌘K/data-slot и photo-роутов нетронуты
- Точка расширения на v2: тоггл-множитель/окна детекции — константы lib/zoom (tuning без ломки контракта, RESEARCH A1); синхронная подсветка тумбнейла при листании — Deferred (Default 11)

---
*Phase: 15-lightbox*
*Completed: 2026-10-01*

## Self-Check: PASSED

- components/zoom-stage.tsx — FOUND; app/(app)/(card)/devices/[id]/photo-grid.tsx — FOUND; 15-02-SUMMARY.md — FOUND
- Коммиты: 9c53488 (feat жесты), 07b79a8 (feat навигация) — FOUND в git log
- Suite 530/530, tsc 0 ошибок, lint 0 ошибок, smoke-custody зелёный — воспроизведено последними прогонами; package.json/dialog.tsx/command-palette.tsx — нулевой diff
