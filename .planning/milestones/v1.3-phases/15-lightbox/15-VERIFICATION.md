---
phase: 15-lightbox
verified: 2026-10-01T07:51:00Z
status: passed
score: 5/12 must-haves verified
behavior_unverified: 7
overrides_applied: 0
behavior_unverified_items:

  - truth: "ESC закрывает лайтбокс, скролл-лок корректно снимается после закрытия"
    test: "Открыть лайтбокс кликом по тумбнейлу, нажать ESC, прокрутить страницу"
    expected: "Диалог закрывается; страница прокручивается без заблокированного скролла; фокус возвращается в карточку"
    why_human: "Runtime-поведение Base UI (dismiss/scroll-lock/focus-return) — не покрыто тестами, в репо нет компонентного раннера"

  - truth: "Колесо мыши зумит к позиции курсора в [1,4], страница под диалогом не скроллит, над оверлей-контролами колесо инертно"
    test: "Открыть лайтбокс, зумить колесом к краю фото; попробовать колесо над кнопками close/«Удалить фото»/стрелками; проверить консоль"
    expected: "Курсор остаётся якорем на всём диапазоне [1,4]; страница не скроллит; над контролами зум инертен; Intervention-предупреждений в консоли нет"
    why_human: "Живое поведение события wheel + passive-listener в браузере — grep/presence это не видит"

  - truth: "Двойной клик/тап тогглит 1↔2.5 к точке тапа; pinch зумит к midpoint; drag панорамирует при scale>1; одиночный клик инертен"
    test: "Touch-эмуляция Chrome DevTools: drag при зуме, pinch двумя пальцами, даблтап, одиночный тап; мышью — даблклик и drag"
    expected: "Матрица жестов UI-SPEC выполняется; переход 2→1 палец без рывка; одиночный тап/клик ничего не делает"
    why_human: "Pointer-жесты — runtime-поведение, автоматического слоя для компонентов в репо нет (только чистая математика)"

  - truth: "Переключение фото сбрасывает зум/пан на (1x, 0, 0); pointercancel/lostpointercapture не залипают в зажатом состоянии"
    test: "Зумить, листать ←/→ и стрелками — зум сбрасывается на каждом переходе; резкий свайп от края (pointercancel), затем новый drag"
    expected: "Каждый переход рендерит свежий стейдж (1x, центр); после pointercancel следующий жест стартует чисто, «залипшего» зажатия нет"
    why_human: "State-transition/cleanup-инвариант (key-ремаут, сброс gesture-стейта) не покрыт поведенческим тестом; iOS-проверка — UAT оператора"

  - truth: "Full-вариант проявляется fade-in без пустого мигания на приглушённом фоне"
    test: "Открыть лайтбокс при медленной сети (DevTools throttling)"
    expected: "Приглушённый стейдж bg-black/5 без пустого мигания, фото плавно проявляется opacity 200ms по onLoad"
    why_human: "Визуальная плавность загрузки — runtime-поведение сети/рендера,presence-чек не видит"

  - truth: "Сломанный <img> (сеть/404) оставляет alt «Фото n из m» на приглушённом стейдже без коллапса раскладки (backstop, план 01/02 truth 8/9)"
    test: "Открыть лайтбокс, заблокировать запрос variant=full (DevTools network block), наблюдать стейдж"
    expected: "Alt-текст виден на приглушённом стейдже (failed → opacity-100, фикс WR-01 в af347c8), раскладка не коллапсирует, нового error-copy нет"
    why_human: "Backstop-истина ({ verification: backstop }): runtime-поведение браузера при ошибке загрузки img"

  - truth: "Оверлей-контролы bg-surface/90 + ring-foreground/10 читаемы на самом тёмном фото стока (backstop, план 01/02 truth 9/10)"
    test: "Открыть лайтбокс на самом тёмном фото, оценить читаемость close/стрелок/счётчика/«Удалить фото»"
    expected: "Все оверлей-контролы читаемы на тёмном фоне (контраст ink на белом 90%)"
    why_human: "Backstop-истина ({ verification: backstop }): held-out визуальная UAT-оценка"
human_verification:

  - test: "Полная UAT-матрица фазы 15 (human_verify_mode): клик по тумбнейлу → широкая панель ~max-w-5xl, ESC + скролл-лок, wheel-зум к курсору, drag/pinch/даблтап (touch-эмуляция), pointercancel-гвад (реальный iPhone), переходы prev/next со сбросом зума, края disabled, M=1 — стрелок нет/чип «1 из 1», ⌘K и клавиши ←/→ при открытом delete-confirm, ⌘K-палитра при открытом лайтбоксе, «Удалить фото» кликабельна при любом зуме, disposed-устройство — view-only, fade-in без мигания, сломанный img → alt, читаемость оверлея на тёмном фото"
    expected: "Все строки матрицы выполняются; консоль без Intervention; страница под диалогом не скроллит"
    why_human: "7 истин PRESENT_BEHAVIOR_UNVERIFIED: runtime-жесты, фокус-семантика, визуал — автоматический слой репо ограничен чистой математикой зума (планы это явно маршрутизировали в UAT end-of-phase)"
---

# Phase 15: Лайтбокс фото устройства — Verification Report

**Phase Goal:** Руководитель рассматривает фото устройства крупно прямо в карточке — зум (клик/колесо/пинч), панорамирование и сброс — а существующий лайтбокс остаётся прежним по контракту: удаление фото и горячие клавиши карточки не ломаются.
**Verified:** 2026-10-01T07:51:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

Реализация присутствует, содержательна и полностью смонтирована (не заглушка): `lib/zoom.ts` (79 строк, pure), `components/zoom-stage.tsx` (347 строк, полный жестовой контракт), `app/(app)/(card)/devices/[id]/photo-grid.tsx` (усиленный лайтбокс), `tests/zoom-math.test.ts` (15 тестов). Все 7 коммитов фазы в истории, включая фикс code-review af347c8 (WR-01 onError + IN-02 bitmap.close — оба воспроизведены в исходнике). Контрактные файлы (package.json, package-lock.json, components/ui/dialog.tsx, components/command-palette.tsx, lib/photos.ts, app/api) — нулевой diff через весь диапазон фазы. Остались 7 runtime-истин, не покрытых поведенческими тестами (в репо нет компонентного раннера — планы явно маршрутизировали их в UAT end-of-phase).

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | SC1: клик открывает усиленный Base UI Dialog (~max-w-5xl оба класса, зум-стейдж внутри DialogContent), не заменён | ✓ VERIFIED | photo-grid.tsx:258 `"max-w-5xl sm:max-w-5xl p-4"` (оба класса — grep=1); ZoomStage смонтирован внутри DialogContent (строки 331–337); dialog.tsx нулевой diff — усилен, не заменён; stage h-[70svh] rounded-lg overflow-hidden bg-black/5 (zoom-stage.tsx:326) |
| 2   | SC1: ESC закрывает, скролл-лок корректно снимается | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Своих ESC-хендлеров нет (grep onEscapeKeyDown/onKeyDown-ESC — 0), modal/focus-trap/скролл-лок принадлежат нетронутому Base UI; runtime не покрыт тестом — UAT |
| 3   | SC2: колесо зумит к позиции курсора, [1,4], страница не скроллит, над контролами инертно | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Wiring VERIFIED: нативный `addEventListener('wheel', onWheel, { passive: false })` на stageRef с removeEventListener в cleanup (zoom-stage.tsx:114–146), preventDefault в нативном хендлере, clamp ДО пересчёта translate (122–130), листенер ТОЛЬКО на стейдже; runtime-ощущение — UAT |
| 4   | SC2: даблклик/тап тогглит 1↔2.5, pinch к midpoint, drag-pan при scale>1, одиночный клик инертен | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Wiring VERIFIED: 5 pointer-хендлеров, pointer-кэш Map в useRef, детекция даблтапа (300ms/5px/близость), pinch guard dist>0 c re-anchor 2→1, pan только при scale>MIN_SCALE; runtime-матрица жестов — touch-эмуляция UAT |
| 5   | Математика зума пиннута vitest (zoomAtPoint/clampOffset/wheelScale/normalizeWheelDelta/doubleClickTargetScale/clamp + 7 констант) | ✓ VERIFIED | tests/zoom-math.test.ts — 15/15 в полном прогоне `npx vitest run` 530/530 (exit 0); формулы совпадают с планом (t'=(1−k)·p+k·t, clamp до translate); lib/zoom.ts pure — ноль фреймворк-импортов |
| 6   | SC3: смена фото сбрасывает зум (1x,0,0); pointercancel/lostpointercapture не залипают | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Wiring VERIFIED: `<ZoomStage key={lightboxPhoto.id}>` — конструктивный сброс, ноль кода сброса в photo-grid; resetGesture() на onPointerCancel безусловно и на onLostPointerCapture с guard-ом pointerId-в-кэше (zoom-stage.tsx:313–316); state-transition/cleanup-инвариант не покрыт тестом — UAT + iPhone |
| 7   | SC4: «Удалить фото» смонтирована над трансформированным изображением, canMutate-гейт, удаление не сломано | ✓ VERIFIED | Кнопка — сиблинг ZoomStage absolute bottom-2 left-2 z-10 (photo-grid.tsx:338–349), гейт canMutate, onClick → существующий confirm-флоу; DELETE-роут app/api/attachments нулевой diff; тесты роутов в suite 530/530 зелёные |
| 8   | SC4: ⌘K-палитра открывается при открытом лайтбоксе (проба data-slot="dialog-content" жива) | ✓ VERIFIED | dialog.tsx:55 `data-slot="dialog-content"` + command-palette.tsx:223 селектор `'[data-slot="dialog-content"][data-open]:not([data-command-palette])'` — оба файла нулевой diff; onKeyDown пробрасывается через `{...props}` (dialog.tsx:62); рантайм-открытие — в UAT-матрице |
| 9   | SC4: full-версия без пустого мигания (fade-in 200ms по onLoad, transform без transition) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Wiring VERIFIED: opacity-0→opacity-100 duration-200 по onLoad, transition только на opacity, transform без transition (zoom-stage.tsx:337–342); визуальная плавность — UAT |
| 10  | Контракты: ноль новых зависимостей; роуты app/api и lib/photos не тронуты; грид/upload/delete-confirm байт-точны | ✓ VERIFIED | `git diff --stat 5b951ee^..HEAD -- package.json package-lock.json components/ui/dialog.tsx components/command-palette.tsx lib/photos.ts app/api` — пусто; diff photo-grid затрагивает только лайтбокс-интерьер (+resize-fix); грид/upload-плитка/delete-confirm без дифф-строк; suite 530/530 |
| 11  | Backstop: сломанный img оставляет alt «Фото n из m» на приглушённом стейдже без коллапса | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Реализовано: фикс WR-01 (af347c8) — `failed` state + onError → opacity-100 (zoom-stage.tsx:72,336,341), нового error-copy нет; backstop-истина ({ verification: backstop }) — abstain, runtime браузера — UAT |
| 12  | Backstop: оверлей-контролы bg-surface/90 читаемы на самом тёмном фото | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Рецепт применён (bg-surface/90 + ring-foreground/10 + text-ink на всех контролах); backstop-истина ({ verification: backstop }) — held-out визуальная UAT |

**Score:** 5/12 truths verified (7 present, behavior-unverified)

**Примечание к запретам (prohibitions, оба плана):** все четыре source-проверяемы и проходят — (1) wheel-листенер только на stageRef, на DialogContent/панели onWheel нет; (2) window-листенера для ArrowLeft/ArrowRight в photo-grid нет (grep addEventListener = 0), onKeyDown только на DialogContent; (3) новых видимых строк нет кроме счётчика «{n} из {m}» (дифф: только aria-label'ы, alt прежнего паттерна, чип-счётчик); (4) циклической навигации нет — края disabled (photo-grid.tsx:311,320), wrap-логики нет; красный/accent фазой не расходуются.

### Deferred Items

Нет — фаза 15 последняя в вехе v1.3 (roadmap.analyze: фазы 14, 15), поздних фаз для фильтрации нет.

### Required Artifacts

| Artifact | Expected    | Status | Details |
| -------- | ----------- | ------ | ------- |
| `lib/zoom.ts` | Pure-модуль математики зума, 6 функций + 7 констант, ноль фреймворк-импортов | ✓ VERIFIED | 79 строк; все экспорты на месте; импортируется zoom-stage и vitest |
| `tests/zoom-math.test.ts` | vitest-матрица чистой математики | ✓ VERIFIED | 15 тестов, 15/15 зелёные; алиас @/lib/zoom |
| `components/zoom-stage.tsx` | Клиентский ZoomStage({src, alt}): полный жестовой контракт + wheel + fade-in | ✓ VERIFIED | 347 строк, 'use client'; вся математика через @/lib/zoom; WR-01-фикс в исходнике |
| `app/(app)/(card)/devices/[id]/photo-grid.tsx` | Усиленный Dialog + ZoomStage + оверлей-контролы + навигация | ✓ VERIFIED | Оба max-w класса, key-ремоут, стрелки/чип/onKeyDown, canMutate-оверлей; экспорт-поверхность PhotoGrid не изменилась |

### Key Link Verification

| From | To  | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| photo-grid.tsx | components/zoom-stage.tsx | `<ZoomStage key={lightboxPhoto.id} src={fullUrl(...)} alt={lightboxAlt}>` | ✓ WIRED | Импорт (строка 17) + монтаж (332–336); key-ремоут = конструктивный сброс |
| components/zoom-stage.tsx | lib/zoom.ts | Импорт всех хелперов/констант | ✓ WIRED | 13 именованных импортов; inline-формул зума в компоненте нет (geometry-хелперы distance/offsetFromCenter — только детекция) |
| zoom-stage stageRef | native wheel listener | `addEventListener('wheel', …, { passive: false })` + cleanup | ✓ WIRED | Строки 144–145; preventDefault в нативном хендлере (118) |
| photo-grid DialogContent | setLightboxId | onKeyDown ArrowLeft/ArrowRight | ✓ WIRED | Строки 260–275; без window-листенера; guard валидного соседнего индекса |
| ZoomStage src | app/api/attachments/[attachmentId] | fullUrl → ?variant=full | ✓ WIRED | Роут реальный: getAttachment (DB) + readFile, IDOR-pair guard; нулевой diff фазой |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| ZoomStage | src / alt | fullUrl(lightboxPhoto.id) / lightboxAlt из photos[] | Да — авторизованный роут отдаёт байты (storageKey по паре device↔attachment) | ✓ FLOWING |
| photo-grid лайтбокс | lightboxPhoto / lightboxIndex | photos prop от серверной карточки | Да — существующий серверный пайплайн фазы 04, не тронут | ✓ FLOWING |

Hardcoded-empty props на call-site не обнаружены.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Полный suite (единственный полный прогон) | `npx vitest run` | 29 файлов, 530/530 passed, exit 0 | ✓ PASS |
| Математика зума | grep zoom-math в логе прогона | `✓ tests/zoom-math.test.ts (15 tests) 4ms` | ✓ PASS |
| Типы | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Линт | `npm run lint` | 0 errors (6 предсуществующих warnings вне файлов фазы) | ✓ PASS |
| Прод-бандл | `npm run build` | exit 0, маршрутная таблица собрана | ✓ PASS |
| smoke-custody | `node scripts/smoke-custody.mjs` | требует запущенный сервер :3116 | ? SKIP (верификатор не поднимает сервисы) |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| — | `find scripts -path '*/tests/probe-*.sh'` | Файл не найден; в PLAN/SUMMARY probe-скрипты не декларированы | none declared (пустой список — прогонять нечего) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| PHOTO-01 | 15-01-PLAN, 15-02-PLAN | Руководитель может рассмотреть фото устройства: крупно, зум (клик/колесо/пинч) и сброс; удаление фото и горячие клавиши карточки не ломаются | ✓ SATISFIED (runtime-часть — UAT) | SC 1–4 реализованы и смонтированы (истины 1,3,4,6,7,8,9,10); REQUIREMENTS.md: PHOTO-01 [x], трассировка Phase 15 Complete; orphaned requirements нет — обе декларации plans=[PHOTO-01] покрывают всё, что REQUIREMENTS маппит на Phase 15 |

### Code Review Findings — Cross-Check (af347c8)

| Finding | Status | Evidence |
| ------- | ------ | -------- |
| WR-01: сломанный img → вечный opacity-0 (противоречие backstop) | ✓ FIXED | zoom-stage.tsx: `failed` state (72), onError (336), `loaded || failed ? 'opacity-100' : 'opacity-0'` (341); коммит af347c8 |
| IN-02: bitmap.close пропускался на error-path | ✓ FIXED | photo-grid.tsx:51–57 try/finally вокруг drawImage; коммит af347c8 |
| IN-01: inline-дублирование offsetFromCenter в wheel-хендлере | ℹ️ NOT FIXED (Info) | zoom-stage.tsx:126–129 — inline-арифметика осталась; Info-уровень, вне must_haves |
| IN-03: нет zoom-out кейса zoomAtPoint (k<1) | ℹ️ NOT FIXED (Info) | tests/zoom-math.test.ts — кейса нет; Info-уровень (test gap), вне must_haves |
| IN-04: stale pinch-базис при >2 указателях | ℹ️ NOT FIXED (Info) | slice(0,2) без ре-анкера при смене пары; beyond-plan robustness, вне must_haves |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | Debt-маркеры (TBD/FIXME/XXX/HACK/placeholder), пустые имплементации, console.log-only — в 4 файлах фазы не найдены | — | Чисто |
| zoom-stage.tsx | 126–129 | Дублирование формулы offsetFromCenter (review IN-01) | ℹ️ Info | Risk of drift; вне must_haves |
| (вне фазы) app/(app)/page.tsx и др. | — | 6 предсуществующих lint-warnings | ℹ️ Info | Наследие фаз 5/7/14, не тронуто |

### Human Verification Required

### 1. UAT end-of-phase — полная матрица (human_verify_mode)

**Test:** См. human_verification в frontmatter — открытие/ESC/скролл-лок; wheel-зум к курсору ([1,4], без скролла страницы, инертность над контролами, нет Intervention); жесты touch-эмуляцией (drag/pinch/даблтап/одиночный тап инертен/2→1 без рывка); сбросы (смена фото, pointercancel — включая реальный iPhone); навигация (стрелки/клавиши, края disabled, M=1, guard при confirm/⌘K); ⌘K при открытом лайтбоксе; «Удалить фото» при любом зуме; disposed view-only; fade-in; сломанный img → alt; читаемость оверлея на тёмном фото.
**Expected:** Все строки матрицы выполняются.
**Why human:** 7 истин PRESENT_BEHAVIOR_UNVERIFIED — репо не имеет компонентного тест-раннера, автоматический слой покрывает только чистую математику; жесты/фокус/визуал — runtime. Это сознательное решение планов (flagged assumption PHOTO-01 surfaced в обоих PLAN).

### Gaps Summary

Гэпов нет: ни одна must-have истина не FAILED, артефакты не MISSING/STUB, ключевые связи WIRED, данные FLOWING, контракты (зависимости/роуты/⌘K-проба/грид) не тронуты, оба фикса code-review в исходнике. Статус human_needed исключительно из-за 7 runtime-истин (из них 2 backstop), которые планы явно держали для UAT end-of-phase — код присутствует и смонтирован, но ни один тест не упражняет переходы (жесты, ESC/скролл-лок, сбросы, fade). Автоматические гейты все зелёные: vitest 530/530, tsc 0, lint 0 errors, build зелёный.

---

_Verified: 2026-10-01T07:51:00Z_
_Verifier: Claude (gsd-verifier)_
