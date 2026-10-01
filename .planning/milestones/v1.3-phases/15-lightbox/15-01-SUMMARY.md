---
phase: 15-lightbox
plan: 01
subsystem: client-island
tags: [lightbox, zoom, wheel, css-transform, tdd, vitest, base-ui-dialog, photo-grid]

# Dependency graph
requires:
  - phase: 04-custody-photos (REG-05)
    provides: лайтбокс Base UI Dialog в photo-grid.tsx (lightboxId/lightboxIndex/fullUrl/canMutate), authorized route app/api/attachments (?variant=full), file-level eslint-disable no-img-element
  - phase: 11-palette
    provides: прецедент нативного addEventListener/removeEventListener в useEffect (command-palette.tsx) и правило React 19 set-state-in-effect (сброс событием/key-ремаутом, не в effect)
provides:
  - lib/zoom.ts — pure-модуль математики зума: clamp, zoomAtPoint, clampOffset, normalizeWheelDelta, wheelScale, doubleClickTargetScale + константы MIN_SCALE/MAX_SCALE/WHEEL_STEP/DOUBLE_CLICK_SCALE/WHEEL_LINE_HEIGHT_PX/DBL_TAP_WINDOW_MS/DRAG_THRESHOLD_PX (замороженный источник для Wave 2)
  - components/zoom-stage.tsx — клиентский ZoomStage({src, alt}): стейдж h-[70svh] overflow-hidden bg-black/5 [touch-action:none], fade-in по onLoad, нативный non-passive wheel к курсору
  - tests/zoom-math.test.ts — vitest-матрица (15 тестов) чистой математики зума
  - Усиленный лайтбокс photo-grid.tsx: DialogContent max-w-5xl sm:max-w-5xl, ZoomStage key={photo.id}, оверлей-контролы вне трансформации
  - Полный suite 530/530 (515 + 15), lint 0 ошибок, build зелёный
affects: [15-lightbox (plan 15-02 — pointer-жесты drag/pinch/dblclick, стрелки/счётчик/клавиатура), verify-work (UAT end-of-phase)]

# Tech tracking
tech-stack:
  added: [] # ноль новых зависимостей (D-04; acceptance-гейт git diff -- package.json/package-lock.json пуст)
  patterns: [native non-passive wheel listener (React 19 passive-on-root), zoom-to-cursor формула t'=(1−k)·p+k·t (origin center), key-ремаут как конструктивный сброс без setState-in-effect, fade-in через onLoad event handler]

key-files:
  created:
    - lib/zoom.ts
    - components/zoom-stage.tsx
    - tests/zoom-math.test.ts
  modified:
    - app/(app)/(card)/devices/[id]/photo-grid.tsx

key-decisions:
  - "ZoomStage — соседний клиентский модуль (не раздувание photo-grid): маунтится с порталом, чистый жизненный цикл useEffect для нативного wheel-листенера; math — только через lib/zoom.ts (один источник для клиента и vitest)"
  - "Wheel-зум в одном функциональном setState: wheelScale (clamp [1,4] ДО пересчёта translate — Pitfall 8) → zoomAtPoint (курсор-якорь) → clampOffset (ось без избытка → 0 — пан на 1x невозможен); listener вешается только на stageRef — колесо над оверлей-контролами инертно (Default 5)"
  - "Сброс зума — key-ремаут <ZoomStage key={lightboxPhoto.id}> (Pattern 4), ноль setState в телах эффектов — правило React 19 eslint репо соблюдено; transform без transition (мгновенный зум, reduced-motion-допустимый), fade-in — opacity 200ms по onLoad"
  - "requirements-completed пуст: PHOTO-01 завершается планом 15-02 (dblclick/pinch/drag/навигация — оставшиеся SC 2/3) — галка REQUIREMENTS.md ставится по завершении волны, не частичным планом"

requirements-completed: []

coverage:
  - id: T1
    description: "SC 1: усиленный Base UI Dialog — DialogContent несёт ОБА класса max-w-5xl sm:max-w-5xl (Pitfall 2), ZoomStage h-[70svh] rounded-lg overflow-hidden внутри; ESC/скролл-лок/focus-trap остаются Base UI (ничего своего)"
    requirement: PHOTO-01
    verification:
      - kind: cli
        ref: "grep -c 'max-w-5xl sm:max-w-5xl' photo-grid.tsx = 1; tsc/lint/build зелёные"
        status: pass
    human_judgment: true
    rationale: "Визуальная ширина панели и закрытие по ESC со снятым скролл-локом — UAT end-of-phase (портал не SSR-ится, smoke не пинит)"
  - id: T2
    description: "SC 2 (колесо): нативный addEventListener('wheel', …, {passive:false}) на stageRef в useEffect с cleanup; preventDefault в нативном хендлере; пересчёт только через lib/zoom.ts"
    requirement: PHOTO-01
    verification:
      - kind: cli
        ref: "grep -c 'passive: false' components/zoom-stage.tsx = 1; tsc/lint/vitest зелёные"
        status: pass
    human_judgment: true
    rationale: "Ощущение зума (курсор-якорь, отсутствие скролла страницы, отсутствие Intervention в консоли, инертность над контролами) — UAT end-of-phase"
  - id: T3
    description: "SC 2/3 математика пиннута: zoomAtPoint (identity/сдвиг/составной), clampOffset (обе оси), normalizeWheelDelta (3 deltaMode), wheelScale (границы [1,4]), doubleClickTargetScale (1↔2.5), константы"
    requirement: PHOTO-01
    verification:
      - kind: unit
        ref: "tests/zoom-math.test.ts — 15/15; полный suite 530/530"
        status: pass
    human_judgment: false
  - id: T4
    description: "SC 4: «Удалить фото» (canMutate-гейт) и close — сиблинги ZoomStage, absolute z-10 вне CSS-трансформации; fade-in full-варианта по onLoad на bg-black/5; sr-only DialogTitle с fileName сохранён"
    requirement: PHOTO-01
    verification:
      - kind: cli
        ref: "source-assert: absolute bottom-2 left-2 z-10 в overlay-кнопке, гейт canMutate без изменений; vitest/build зелёные"
        status: pass
    human_judgment: true
    rationale: "Монтированность/кликабельность при зуме и fade без пустого мигания — UAT end-of-phase"
  - id: T5
    description: "Контракты не тронуты: ⌘K-проба data-slot жива (dialog.tsx/command-palette.tsx нулевой diff), роуты app/api не менялись (D-05), ноль новых зависимостей (D-04), грид тумбнейлов байт-точен"
    requirement: PHOTO-01
    verification:
      - kind: cli
        ref: "git diff --stat -- package.json package-lock.json components/ui/dialog.tsx components/command-palette.tsx lib/photos.ts app/api — пусто; vitest 530/530 (регрессия)"
        status: pass
    human_judgment: false

# Metrics
duration: 9min
completed: 2026-10-01
status: complete
---

# Phase 15 Plan 01: Лайтбокс крупно + wheel-зум Summary

**Трассер усиленного лайтбокса (DialogContent max-w-5xl + ZoomStage с fade-in) и колесо-зум к курсору на нативном non-passive листенере, поверх TDD-математики lib/zoom.ts (RED→GREEN, 15 тестов) — полный suite 530/530, lint 0 ошибок, build зелёный, ноль новых зависимостей**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-01T06:58:02Z
- **Completed:** 2026-10-01T07:07:41Z
- **Tasks:** 3
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- T1 (tracer): `components/zoom-stage.tsx` — клиентский стейдж `h-[70svh] rounded-lg overflow-hidden bg-black/5 [touch-action:none] select-none` с `<img>` на CSS-transform `translate(tx,ty) scale(s)` (origin center, БЕЗ transition — мгновенный зум, reduced-motion-допустимый), fade-in `opacity-0→100 duration-200` по onLoad (event handler — легально, правило set-state-in-effect не нарушено), guards `draggable={false}` + `[-webkit-touch-callout:none]` + `[-webkit-user-drag:none]` (Pitfall 5). `photo-grid.tsx`: DialogContent → `max-w-5xl sm:max-w-5xl` (ОБА класса — Pitfall 2: tailwind-merge переживает базовый `sm:max-w-sm`), `<img>` лайтбокса заменён на `<ZoomStage key={lightboxPhoto.id}>`, alt — precomputed `lightboxAlt` однострочным литералом, «Удалить фото» перенесена в оверлей `absolute bottom-2 left-2 z-10` с рецептом `bg-surface/90 ring-foreground/10` (гейт canMutate и onClick байт-точны), старый блочный футер удалён
- ⚡ Tracer-гейт (autonomous): автоматическая часть verify повторена на закоммиченном срезе end-to-end (tsc + vitest 515/515 + build + grep) — зелёная, экспансия разрешена; human-check перенесён на UAT end-of-phase (human_verify_mode)
- T2 (TDD RED→GREEN): `tests/zoom-math.test.ts` — матрица behavior-спеки (clamp-границы, zoomAtPoint identity/сдвиг/составной, clampOffset оси с/без избытка, normalizeWheelDelta 3 режима, wheelScale границы, doubleClickTargetScale тоггл, константы) — RED подтверждён (module not found, b1488e9), затем `lib/zoom.ts` по конвенции `lib/inventory-increment.ts` (pure named exports, ноль фреймворк-импортов, header с формулой t'=(1−k)·p+k·t) — GREEN 15/15 (da97fa1)
- T3: wheel-зум в ZoomStage — `useEffect` + `addEventListener('wheel', onWheel, { passive: false })` на stageRef с `removeEventListener` в cleanup (React 19 регистрирует wheel пассивно — Pitfall 1); `e.preventDefault()` в нативном хендлере; пересчёт одним функциональным setState через `wheelScale` → `zoomAtPoint` → `clampOffset` (clamp scale ДО translate — Pitfall 8; deltaMode нормализован — Pitfall 7; ось без избытка → 0 — пан на 1x невозможен); listener только на стейдже — колесо над close/«Удалить фото» инертно (Default 5)

## Task Commits

1. **Task 1: tracer — усиленный Dialog max-w-5xl + ZoomStage с fade-in** - `5b951ee` (feat)
2. **Task 2: RED — failing zoom-math pin** - `b1488e9` (test)
3. **Task 2: GREEN — pure zoom math lib/zoom.ts** - `da97fa1` (feat)
4. **Task 3: wheel-зум к позиции курсора (нативный non-passive)** - `5300799` (feat)

_TDD Gate Compliance: RED-гейт `test(15-01)` b1488e9 → GREEN-гейт `feat(15-01)` da97fa1 — обе калитки в истории; REFACTOR не потребовался (сигнатуры родились удобными для компонента, suite зелёный)._

## Files Created/Modified

- `components/zoom-stage.tsx` (NEW, 88 строк) — ZoomStage({src, alt}): модель {scale, tx, ty} одним useState, loaded для fade-in, нативный wheel; file-level eslint-disable no-img-element с rationale авторизованного роута (04-RESEARCH)
- `lib/zoom.ts` (NEW, 79 строк) — pure-модуль: 6 функций + 7 констант, ZoomState-тип; импортируется и клиентом, и vitest
- `tests/zoom-math.test.ts` (NEW, 135 строк, 15 тестов) — vitest-матрица, alias @/lib/zoom, environment: node
- `app/(app)/(card)/devices/[id]/photo-grid.tsx` (MODIFIED) — импорт ZoomStage, lightboxAlt, усиленный DialogContent, оверлей-кнопка удаления; экспорт-поверхность PhotoGrid({deviceId, photos, canMutate, maxPhotos}) не изменилась

## Decisions Made

- ZoomStage вынесен в `components/` (D-04 «соседний клиентский модуль», RESEARCH primary recommendation): чистый жизненный цикл эффекта для нативного листенера, photo-grid не раздувается
- Оверлей-кнопка «Удалить фото» — `variant="secondary"` + overlay-классы UI-SPEC (`h-11 px-4 rounded-lg bg-surface/90 ring-1 ring-foreground/10 hover:bg-surface text-ink`): базовый register Button (active:scale, focus-visible ring) сохранён, tailwind-merge корректно перебивает bg/hover secondary
- До Task 3 сеттер зума не деструктурировался (`const [zoom] = useState`) — lint-clean трассер; Task 3 вернул полный деструктуринг

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Ожидаемое значение wheelScale(2, −100) в плане — арифметическая описка**
- **Found during:** Task 2 (RED, перенос behavior-матрицы в тест)
- **Issue:** план пиннит `wheelScale(2, −100) ≈ 2.3197` («2·e^0.15»), но 2·e^0.15 = 2.3237 (расхождение 0.004 > заявленного допуска 1e-3) — формула и значение в плане противоречат друг другу
- **Fix:** тест пиннит формулу (зафиксированный контракт RESEARCH Pattern 1): `toBeCloseTo(2 * Math.exp(0.15), 6)`; комментарий в RED-коммите документирует описку
- **Files modified:** tests/zoom-math.test.ts
- **Verification:** 15/15 матрица зелёная; формула не менялась
- **Committed in:** b1488e9 (RED) + da97fa1 (GREEN)

**2. [Rule 2 - Missing] Новый файл zoom-stage.tsx не наследует file-level eslint-disable photo-grid.tsx**
- **Found during:** Task 1 (npm run lint)
- **Issue:** директива `@next/next/no-img-element` — file-level, в новом модуле `<img>` давал предупреждение; план («новые img наследуют») имел в виду только photo-grid.tsx
- **Fix:** тот же file-level disable с тем же rationale (авторизованный роут, 04-RESEARCH) добавлен в zoom-stage.tsx; контракт «директиву не дублировать» соблюдён внутри каждого файла
- **Files modified:** components/zoom-stage.tsx
- **Committed in:** 5b951ee (в составе Task 1)

---

**Total deviations:** 2 auto-fixed (Rule 1 + Rule 2), оба немедленно верифицированы. Scope creep нет.
**Auth gates:** none. **Дропнутых UI-considerations нет** (11 covered + 2 backstop — как в плане).

## Issues Encountered

- 6 предсуществующих lint-предупреждений (app/(app)/page.tsx, lib/use-search-param.ts, tests/dashboard-queries.test.ts, tests/devices-queries.test.ts) — вне скоупа плана, не тронуты (наследие, уже учтённое фазой 14)
- 2 backstop-truth плана (сломанный `<img>` без коллапса раскладки; читаемость оверлея на тёмном фото) — сознательно held-out до UAT end-of-phase
- Roadmap/REQUIREMENTS-записи: `gsd-tools` в этом окружении недоступен — правки STATE/ROADMAP выполнены вручную по конвенции коммитов фазы 14; PHOTO-01 сознательно НЕ отмечен (завершается 15-02)

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- План 15-02 садится на готовый каркас: ZoomStage уже несёт модель {scale, tx, ty}, refs (stageRef/imgRef) и lib/zoom-константы (DOUBLE_CLICK_SCALE, DBL_TAP_WINDOW_MS, DRAG_THRESHOLD_PX ждут потребителей); в photo-grid есть lightboxIndex для стрелок; wheel-листенер — прецедент для pointer-жестов Wave 2
- Для UAT end-of-phase остаются: визуальная ширина панели, wheel-ощущение (якорь/скролл/Intervention), fade без мигания, монтированность контролов при зуме, ⌘K при открытом лайтбоксе, ESC + скролл-лок, disposed view-only (canMutate=false)
- Полный suite 515 → 530 (+15), регрессий ноль; smoke-custody не затронут (лайтбокс-интерьер client-only — Pitfall 10)

---
*Phase: 15-lightbox*
*Completed: 2026-10-01*

## Self-Check: PASSED

- lib/zoom.ts — FOUND; components/zoom-stage.tsx — FOUND; tests/zoom-math.test.ts — FOUND; 15-01-SUMMARY.md — FOUND
- Коммиты: 5b951ee (feat tracer), b1488e9 (test RED), da97fa1 (feat GREEN), 5300799 (feat wheel) — FOUND в git log
- Suite 530/530, lint 0 ошибок, build зелёный — воспроизведено последним прогоном; package.json/dialog.tsx/command-palette.tsx — нулевой diff
