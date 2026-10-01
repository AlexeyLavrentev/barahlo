# Phase 15: Лайтбокс фото устройства - Research

**Researched:** 2026-10-01
**Domain:** Клиентский жестовый зум/пан поверх Base UI Dialog (React 19 Pointer Events, CSS transforms) — усиление существующего лайтбокса в `photo-grid.tsx`
**Confidence:** HIGH (стек и паттерны верифицированы по локальным исходникам; браузерные нюансы — MEDIUM, перекрёстно проверены по MDN/W3C)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Phase Boundary (PHOTO-01):** усиление существующего лайтбокса карточки устройства (Base UI Dialog в `photo-grid.tsx`) до полноценного просмотра фото — крупная панель (~max-w-5xl, зум-стейдж внутри DialogContent), зум способами из требования (колесо мыши к позиции курсора, двойной клик, pinch на тачскрине), drag-панорамирование, предсказуемый сброс, масштаб ограничен [1,4]. Контракт лайтбокса не меняется: удаление фото остаётся доступным из лайтбокса, ⌘K-палитра открывается при открытом лайтбоксе (проба `data-slot="dialog-content"` жива), ESC закрывает, скролл-лок корректно снимается. Усиление, не замена: без сторонних лайтбокс/зум-библиотек, без изменений photo-пайплайна (фаза — клиентский остров без write-path риска).

- **D-01:** prev/next-навигация внутри лайтбокса: стрелки по краям зум-стейджа + клавиши ←/→; переход сбрасывает зум и пан на (1x, 0, 0); не циклическая — на первом/последнем фото соответствующая стрелка инертна. Основание: SC 3 «переключение на другое фото сбрасывает зум» осмысленно только при переключении внутри лайтбокса.
- **D-02:** Одиночный клик инертен — зум-тоггл только двойным кликом (SC 2 «клик (двойной)»), иначе одиночный клик конфликтует с распознаванием drag-pan. Двойной клик зумит к позиции курсора (паритет с колесом из SC 2) и возвращает к 1x при повторном. Сброс зума: двойной клик при зуме, переход prev/next (D-01), закрытие диалога.
- **D-03:** DialogContent расширяется до ~max-w-5xl (SC 1); внутри — зум-стейдж (overflow-hidden) с изображением на CSS-transform (translate + scale). «Удалить фото» и close-кнопка рендерятся поверх стейджа, вне трансформации, и всегда смонтированы при canMutate (SC 4); drag-pan не начинается на контролах. Загрузка full-варианта — без пустого мигания (SC 4): изображение проявляется fade-in по onLoad на приглушённом фоне стейджа.
- **D-04:** Сторонние лайтбокс/зум-библиотеки запрещены roadmap'ом — усиление существующего Base UI Dialog, НЕ замена. Зум — ручные pointer/wheel/pinch-хендлеры внутри `photo-grid.tsx` (или соседнего клиентского модуля). **Ноль новых зависимостей фазы.**
- **D-05:** Photo-пайплайн не трогается: FULL_EDGE=1600 остаётся; роуты выдачи `app/api/attachments` не меняются.
- **D-06:** Disposed-устройство: лайтбокс с зумом работает (фото рендерятся), «Удалить фото» не показывается — существующий canMutate-гейт без изменений.

### Claude's Discretion

- Точный множитель двойного клика (~2.5x — середина диапазона; SC лочит только границы [1,4]) и шаг/инерцию колеса.
- Вид skeleton/fade (приглушённый фон в стиле карточки), touch-action CSS стейджа (none при зуме, overscroll-гвард).
- Форма pointercancel-гвада iOS (SC 3 «не залипает в зажатом состоянии») — за исполнителем.
- Счётчик «N из M» в лайтбоксе по паттерну грид-счётчика `photo-grid` (новые русские копии — однострочные шаблонные литералы, smoke-иглы байт-точные).
- Иконки стрелок — lucide-react (ChevronLeft/ChevronRight уже в дереве зависимостей).

### Deferred Ideas (OUT OF SCOPE)

- Циклическая навигация (wrap ← → по кругу) — сюрприз для пользователя, отклонена в пользу инертных краёв (D-01); вернуть по фидбеку UAT.
- Повышение FULL_EDGE / ретранскод стока для резкого 4x — серверный write-path вне клиентской фазы (D-05); кандидат на v2 (MOB-01-класс).
- Слайд-анимации перехода между фото — глянец вне требований PHOTO-01.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PHOTO-01 | Руководитель может рассмотреть фото устройства: в существующем лайтбоксе карточки фото открывается крупно, зум (клик/колесо/пинч) и сброс работают; удаление фото и горячие клавиши карточки не ломаются | Модель зума на CSS-transform + математика zoom-to-cursor (Pattern 1); pointer-жесты wheel/drag/pinch/double-tap (Patterns 2–5); Pitfalls 1–2 (два repo-специфичных дефиса: passive wheel, tailwind-merge); контракт-сохранение: `data-slot`/canMutate/ESC/скролл-лок — Base UI 1.7.0 верифицирован локально |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **AGENTS.md («This is NOT the Next.js you know»):** перед написанием кода читать релевантный гайд в `node_modules/next/dist/docs/`. Для этой фазы Next-специфичные API не трогаются вообще (чистый клиентский остров) — при любом неожиданном касании фреймворка сверяться с локальными доками.
- **GSD Workflow Enforcement:** правки только через GSD-воркфлоу (фаза исполняется через `/gsd-execute-phase`).
- **Стек зафиксирован** (PROJECT.md / STACK.md): Next 16.3.3 + React 19.2.8, Tailwind 4.3.3, shadcn/Base UI. Новые зависимости в фазе запрещены (D-04).
- **Проектные скиллы:** в `.claude/skills/` ничего нет (GSD-блок CLAUDE.md подтверждает: "No project skills found").

## Summary

Фаза — чистый клиентский остров: усиливается существующий Base UI Dialog в `app/(app)/(card)/devices/[id]/photo-grid.tsx` (сейчас: панель с `<img>` на 70svh, close-кнопка, delete-кнопка, delete-confirm сиблинг-портал). Ноль новых зависимостей (D-04). Зум реализуется одним состоянием `{scale, tx, ty}` на `<img>` с `transform: translate(tx, ty) scale(s)`; жесты — унифицированные Pointer Events (wheel через нативный non-passive листенер, drag/pinch через кэш указателей, double-tap через таймерную детекцию).

Исследование нашло **два repo-специфичных факта, которые план обязан учесть**:

1. **`max-w-5xl` сам по себе НЕ сработает (SC 1).** Верифицировано локальным запуском tailwind-merge: базовый класс `DialogContent` несёт `sm:max-w-sm`, и `cn("…sm:max-w-sm", "max-w-5xl")` оставляет `sm:max-w-sm` в силе (конфликт резолвится только внутри одного модификатора). Следствие: текущий лайтбокс с `max-w-3xl` на десктопе (≥640px) фактически рендерится шириной 24rem (384px) — латентный баг против 04-UI-SPEC «panel max-w-3xl». План должен передавать **оба** класса: `max-w-5xl sm:max-w-5xl` (второй безвреден, если каскадный порядок когда-нибудь изменится).
2. **`e.preventDefault()` внутри React `onWheel` — no-op.** Верифицировано по исходникам установленного react-dom 19.2.8: `wheel`/`touchstart`/`touchmove` регистрируются пассивно на корне. Колесо обязано вешаться нативно: `stageRef.addEventListener('wheel', handler, { passive: false })` в `useEffect` компонента, который маунтится вместе с диалогом.

Остальная специфика — стандартная для жестовых зумов: `touch-action: none` на стейдже, сброс жеста на `pointercancel`/`lostpointercapture` (iOS), инертный одиночный клик через порог перемещения (D-02), key-ремаут стейджа по `photo.id` для гарантии сброса (SC 3) без `setState`-в-effect (правило React 19 в eslint этого репо, решение фазы 11).

**Primary recommendation:** извлечь `ZoomStage` (соседний клиентский модуль рядом с `photo-grid.tsx`, D-04 это разрешает) с чистыми хелперами математики (`clamp`, `zoomAtPoint`, `clampOffset`) — математику пинить vitest-ом (node-раннер, компонентного в репо нет), интерактивность — UAT по устоявшемуся Playwright MCP-паттерну.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Зум-стейдж, жесты (wheel/drag/pinch/double-tap), навигация prev/next | Browser / Client | — | Клиентский остров (D-04); никаких серверных поверхностей |
| Панель диалога, ESC, focus-trap, скролл-лок, стекинг порталов | Browser / Client (Base UI 1.7.0) | — | `@base-ui/react` Dialog владеет всем модальным контрактом из коробки (верифицировано по исходникам пакета) |
| Выдача full/thumb байтов фото | API / Backend (существующий роут) | — | `app/api/attachments/[attachmentId]` с `?variant=full` — не меняется (D-05) |
| Удаление фото | API / Backend | Browser (кнопка над стейджем) | Существующий DELETE-роут + `router.refresh()`; canMutate-гейт и серверный DISPOSED-guard без изменений (D-06) |
| ⌘K-палитра поверх лайтбокса | Browser / Client | — | Селектор пробы `[data-slot="dialog-content"][data-open]:not([data-command-palette])` жив, пока лайтбокс рендерится тем же `DialogContent` — нулевые правки |

## Standard Stack

### Core (всё уже установлено — ноль новых зависимостей)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React Pointer Events + CSS transforms | react 19.2.8 | Единая модель жестов: `onPointerDown/Move/Up/Cancel`, `setPointerCapture`, `transform: translate() scale()` | Pointer Events покрывают мышь+тач одним API (W3C PE spec); не нужен параллельный touchstart/touchmove-код [VERIFIED: W3C PE spec / MDN] |
| @base-ui/react Dialog | 1.7.0 (установлен) | Модальный контракт: ESC, focus-trap, скролл-лок, `data-open` для ⌘K-пробы | Уже в проде; `useScrollLock(open && modal===true)` в `dialog/root/useDialogRoot.js`; `CommonPopupDataAttributes.open = "data-open"` [VERIFIED: локальные исходники node_modules/@base-ui/react] |
| lucide-react | 1.39.0 (установлен) | ChevronLeft/ChevronRight для стрелок, X для close | Экспорты ChevronLeft/ChevronRight/X/Plus верифицированы require-ом [VERIFIED: локальный node_modules] |
| Tailwind CSS | 4.3.3 | Классы стейджа; `touch-action` через arbitrary property `[touch-action:none]`; transition для fade-in | Стандарт проекта; `cn()` = clsx + tailwind-merge [VERIFIED: lib/utils.ts] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Ручные pointer/wheel/pinch-хендлеры (D-04) | react-zoom-pan-pinch, yet-another-react-lightbox | **Запрещено D-04**: сторонний лайтбокс заменяет Dialog → умирают delete-flow и ⌘K-проба `data-slot="dialog-content"`; плюс новая зависимость |
| `dblclick` нативный | Ручная double-tap детекция | Нативный `dblclick` ненадёжен на таче (MDN определяет его для «pointing device button»; на мобильных часто не файрится) — только ручная детекция по pointer-таймингам [CITED: MDN dblclick_event] |
| `transform-origin: 0 0` | `transform-origin: center` (default) | Center-origin естественен для flex-центрированного `<img>`: пан-клэмп симметричен `|t| ≤ (scaled − stage)/2`; 0 0 требует хранить «пустые» зоны. Оба корректны — выбран center |

**Installation:** ничего не устанавливается. `package.json` фазы не меняется.

## Package Legitimacy Audit

**Неприменимо:** фаза не устанавливает ни одного нового пакета (D-04 — «ноль новых зависимостей»). Gate не запускался, т.к. список устанавливаемых пуст. Все упомянутые пакеты (@base-ui/react 1.7.0, lucide-react 1.39.0, react 19.2.8) уже в `package.json`/lockfile и в проде.

## Architecture Patterns

### System Architecture Diagram

```
 Тумбнейл-грид (SSR)                      Клиентский остров photo-grid.tsx
 ┌──────────────┐   клик    ┌──────────────────────────────────────────────┐
 │ <button>     │──────────▶│ setLightboxId(photo.id)                      │
 │ thumb 400px  │           └──────────────┬───────────────────────────────┘
 └──────────────┘                          │ open
                                           ▼
                          ┌─────────────────────────────────────────┐
                          │ Base UI Dialog (portal, modal=true)     │
                          │  ESC · focus-trap · скролл-лок · data-open │
                          │  ┌───────────────────────────────────┐  │
   ⌘K (палитра) ◀──────────┤  │ DialogContent max-w-5xl sm:max-w-5xl │  │
   probe: [data-slot=      │  │  ┌─────────────────────────────┐ │  │
   dialog-content]         │  │  │ ZoomStage  key={photo.id}   │ │  │
   [data-open]             │  │  │  touch-action:none          │ │  │
                          │  │  │  <img> ← translate+scale    │ │  │
                          │  │  │  wheel(native,non-passive)  │ │  │
                          │  │  │  pointer: drag/pinch/double │ │  │
                          │  │  └─────────────────────────────┘ │  │
                          │  │  controls ВНЕ transform (z-10):  │  │
                          │  │   ✕ close · ← → nav · N из M     │  │
                          │  │   «Удалить фото» (canMutate)     │  │
                          │  └───────────────────────────────────┘  │
                          └──────────────┬──────────────────────────┘
                                         │ «Удалить»
                                         ▼
                          sibling delete-confirm Dialog (портал стекается)
                                         │ DELETE /api/attachments/:id
                                         ▼
                          router.refresh() → грид и лайтбокс закрываются
```

Первичный сценарий по стрелкам: клик по тумбнейлу → открытие портала → full-вариант грузится fade-in → жесты зума меняют `{scale, tx, ty}` → prev/next/даблклик/закрытие сбрасывают. Внешние зависимости: авторизованный роут выдачи фото (без изменений).

### Recommended Project Structure

```
app/(app)/(card)/devices/[id]/
├── page.tsx            # не меняется
└── photo-grid.tsx      # остров: грид + лайтбокс-диалог + delete-confirm
components/             # (или рядом с островом — D-04 «соседний клиентский модуль»)
└── zoom-stage.tsx      # НОВЫЙ клиентский компонент: стейдж + жесты + fade-in
lib/zoom.ts             # ОПЦИОНАЛЬНО: чистые хелперы clamp/zoomAtPoint/clampOffset
                        # — vitest-импортируемые (node-раннер, без DOM)
```

Рекомендация: разнести `ZoomStage` в отдельный модуль — он маунтится/анмаунтится вместе с порталом, и его `useEffect` для нативного wheel-листенера получает чистый жизненный цикл; `photo-grid.tsx` не раздувается. Чистая математика в `lib/zoom.ts` даёт настоящий TDD RED→GREEN (см. Validation Architecture).

### Pattern 1: Модель зума — одно состояние + zoom-to-point

**What:** `{scale, tx, ty}`; на `<img>` — `style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}`; стейдж — `overflow-hidden flex items-center justify-center`; origin — center (default).

**Математика (перекрёстно верифицирована: Jake Archibald Jun 2025 — transform применяется справа налево, `translate` до `scale` держит сдвиг в экранных пикселях):**

При `transform-origin: center` точка элемента `q` проецируется в `center + s·(q − center) + t`. Чтобы точка под курсором `c` (координаты относительно стейджа) осталась неподвижной при смене `s → s'`:

```
t' = (1 − k)·(c − center) + k·t,   где k = s' / s
```

**Wheel:** `s' = clamp(scale · exp(−ΔY · step), 1, 4)` (экспонента даёт равномерность тачпада/мыши; step ~0.0015–0.002 — discretion). **Двойной клик:** `s' = scale > 1 ? 1 : 2.5` (discretion), `c` = позиция курсора, та же формула.

**Клэмп пана:** если scaled-габарит по оси больше стейджа — `|t| ≤ (scaled − stage) / 2`; иначе `t = 0` по оси (фото центрировано). Применять ПОСЛЕ каждого изменения scale.

**When to use:** весь зум фазы. Единственная модель — сброс (SC 3) это `setState({scale:1, tx:0, ty:0})` + remount по key.

### Pattern 2: Нативный non-passive wheel-листенер

**What:** React 19 регистрирует `wheel` пассивно на корне — `preventDefault` в `onWheel` не работает [VERIFIED: react-dom 19.2.8 source, react-dom-client.development.js: passive принудительно для wheel/touchstart/touchmove].

```tsx
// ZoomStage маунтится вместе с порталом диалога — жизненный цикл эффектов чистый
useEffect(() => {
  const el = stageRef.current
  if (!el) return
  const onWheel = (e: WheelEvent) => {
    e.preventDefault() // работает только с passive:false
    // deltaMode: 1 = lines (×~16px), 2 = pages — нормализовать до пикселей
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
    applyZoom(Math.exp(-dy * ZOOM_STEP), { x: e.clientX, y: e.clientY })
  }
  el.addEventListener('wheel', onWheel, { passive: false })
  return () => el.removeEventListener('wheel', onWheel)
}, [])
```

**When to use:** единственный корректный способ перехватить колесо (SC 2) и заглушить overscroll/страничный скролл под курсором.

### Pattern 3: Drag-pan + pinch одним pointer-кэшем (MDN-канон)

**What:** `Map<pointerId, {x, y}>` в ref; `touch-action: none` на стейдже; `setPointerCapture` на pointerdown (для тача браузер делает implicit capture — обработчики продолжают получать события за пределами элемента).

```tsx
onPointerDown   → pointers.set(id, pos); если 1 палец: запомнить pan-старт (и порог 5px для клика);
                  если 2 пальца: запомнить pinch-базис (dist0, mid0, scale0, t0)
onPointerMove   → обновить кэш; 1 палец при scale>1: t = t0 + Δ; 2 пальца:
                  s' = clamp(scale0 · dist/dist0, 1, 4); зум к mid0 той же формулой Pattern 1
onPointerUp /
onPointerCancel /
onLostPointerCapture → pointers.delete(id); ОБОЙТИ ВСЁ жестовое состояние (SC 3: iOS «не залипает»);
                  при 1 оставшемся пальце — переанкерить pan-старт (бесшовный pinch→pan);
                  prevDiff/базис сбросить (MDN: guard prevDiff > 0)
```

**When to use:** drag-пан (SC 2), pinch (SC 2), iOS pointercancel-гвад (SC 3).

### Pattern 4: Сброс через key-ремаут, не через effect

**What:** `<ZoomStage key={photo.id} photo={photo} … />`. Переход prev/next меняет `photo.id` → React монтирует свежий стейдж с `scale=1, t=0, loaded=false`. Это гарантирует SC 3 (сброс зума при смене фото) и чистый fade-in каждой загрузки БЕЗ единого `setState` в теле эффекта — правило React 19 `set-state-in-effect` в eslint-config-next этого репо прямо запрещает синхронный setState в эффекте [VERIFIED: STATE.md, решение Phase 11/План 01].

**When to use:** навигация (D-01), открытый лайтбокс поверх нового фото после refresh.

### Pattern 5: Контролы вне трансформации + fade-in по onLoad

**What:** close/«Удалить фото»/стрелки/«N из M» — сиблинги стейджа (absolute, `z-10`), не дети трансформированного `<img>` — кнопки всегда смонтированы и кликабельны при любом зуме (SC 4, D-03). Drag-pan физически не начинается на контролах: они не внутри стейджа. Fade-in: `loaded` ставится в `onLoad` (event handler — легально), `<img>` с `className="transition-opacity duration-200"` + `opacity-0/100`; фон стейджа — приглушённый (в стиле карточки, discretion).

### Anti-Patterns to Avoid

- **Свой ESC-хендлер или `modal={false}`:** Base UI владеет dismiss/скролл-локом; дубль-хендлеры дают двойное закрытие и сломанный скролл-лок (SC 1). Ничего не добавлять — ESC уже работает.
- **Замена DialogContent на сторонний лайтбокс:** умирают ⌘K-проба и delete-flow (D-04).
- **`setState` в теле эффекта** (сброс зума через useEffect по photo.id): eslint React 19 этого репо — ошибка. Только key-ремаут (Pattern 4).
- **Одиночный клик как зум-тоггл:** конфликт с drag-распознаванием; D-02 лочит одиночный клик инертным.
- **Пассивный `onWheel` c preventDefault:** no-op + консольная ошибка Intervention (Pitfall 1).
- **Зум к границе через clamp ПОСЛЕ пересчёта t:** даёт рывок; сначала clamp `s'`, потом формула.
- **Циклическая навигация:** отклонена владельцем (Deferred).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ESC, focus-trap, скролл-лок, стекинг порталов, `data-open` | Собственный modal-менеджер | Base UI Dialog (уже в лайтбоксе) | Протестированная a11y-семантика; ⌘K-проба завязана на `data-slot="dialog-content"` [VERIFIED: components/command-palette.tsx:223] |
| Multi-pointer жест-менеджер «с нуля» на touch+mouse раздельно | Параллельные touchstart/touchmove-хендлеры | Единые Pointer Events + pointer-кэш (MDN) | Touch+mouse в одном коде; implicit capture на таче [CITED: MDN Pinch zoom gestures] |
| Иконки | SVG-инлайн | lucide-react ChevronLeft/ChevronRight | Уже в дереве, верифицированы экспорты [VERIFIED: node_modules] |
| Двойная детекция «клик vs drag» | Сложная state-machine | Порог перемещения ~5px + тайминг двойного тапа | Достаточно для SC 2/3; меньше состояний — меньше залипаний |
| Math-хелперы зума внутри JSX | Формулы в обработчиках инлайн | Чистые функции (`clamp`, `zoomAtPoint`, `clampOffset`) в `lib/zoom.ts` | Vitest-импортируемые без DOM — единственный автоматический TDD-слой, доступный этому репо |

**Key insight:** D-04 осознанно жертвует библиотечным зумом ради контракта Dialog (delete-flow + ⌘K-проба). Ручной код держать минимальным: вся «сложность» — три чистые функции математики; всё модальное (ESC/скролл-лок/trap) Base UI уже делает.

## Common Pitfalls

### Pitfall 1: React `onWheel` — пассивный слушатель, preventDefault — no-op
**What goes wrong:** зум-колесо скроллит страницу/кидает консольную `[Intervention] Unable to preventDefault inside passive event listener`.
**Why it happens:** React 19 принудительно регистрирует `wheel`/`touchstart`/`touchmove` как passive на корне [VERIFIED: node_modules/react-dom/cjs/react-dom-client.development.js:19262].
**How to avoid:** нативный `addEventListener('wheel', fn, { passive: false })` в `useEffect` компонента внутри портала (Pattern 2) с обязательной очисткой.
**Warning signs:** страница едет под лайтбоксом; предупреждение Intervention в консоли.

### Pitfall 2: tailwind-merge сохраняет `sm:max-w-sm` — `max-w-5xl` не срабатывает
**What goes wrong:** SC 1 «панель ~max-w-5xl» молча не выполняется на десктопе: базовый `DialogContent` несёт `sm:max-w-sm`, а `cn()` резолвит конфликты только внутри одного модификатора.
**Верификация:** локальный запуск `twMerge("<базовые классы DialogContent>", "max-w-5xl")` → `"sm:max-w-sm max-w-5xl"` (обе max-w остаются) [VERIFIED: tailwind-merge, lib/utils.ts].
**Следствие:** текущий лайтбокс `max-w-3xl` на ≥sm фактически 24rem — латентный баг против 04-UI-SPEC; фаза его чинит попутно.
**How to avoid:** передавать `className="max-w-5xl sm:max-w-5xl …"` (второй класс перебивает `sm:max-w-sm`; безвреден при любой интерпретации каскада).
**Warning signs:** панель визуально узкая на десктопе; `data-slot="dialog-content"` с двумя max-w в DOM.

### Pitfall 3: iOS pointercancel залипает жест (SC 3)
**What goes wrong:** Safari перехватывает жест (scroll-эвристика, edge-swipe, long-press) → файрит `pointercancel`, дальнейших pointer-событий не будет; обработчик, слушающий только `pointerup`, остаётся в «зажатом» состоянии.
**How to avoid:** (1) `touch-action: none` на стейдже — минимизирует захват браузером; (2) сбрасывать ВСЁ жестовое состояние на `pointercancel` И `lostpointercapture` (спека: cancel неявно снимает capture) [CITED: W3C PE spec, MDN].
**Warning signs:** после свайпа от края фото «прилипает» к пальцу/зуму; повторный drag не стартует.

### Pitfall 4: `dblclick` не файрится на таче
**What goes wrong:** двойной клик работает мышью, но не на телефоне — SC 2 формально провален на iOS.
**Why:** MDN определяет dblclick для «pointing device button»; мобильные браузеры часто его не эмитят [CITED: MDN dblclick_event; отчёты Mapbox/GDevelop].
**How to avoid:** ручная детекция: два `pointerup`/`pointerdown` с `pointerType` любым, интервал < ~300ms [ASSUMED], перемещение < порога → зум-тоггл к позиции курсора. С `touch-action: none` браузерный double-tap-zoom сам не вмешается.
**Warning signs:** двойной тап на телефоне ничего не делает или дёргает зум дважды.

### Pitfall 5: Нативный drag ghost и iOS callout
**What goes wrong:** при drag-пан тянет полупрозрачный призрак `<img>` (HTML5 drag) или iOS показывает «Сохранить изображение» на long-press.
**How to avoid:** `draggable={false}` на `<img>` + `select-none` + arbitrary property `[-webkit-touch-callout:none]` (и `[-webkit-user-drag:none]` для WebKit/Blink).
**Warning signs:** призрак за курсором; системное меню на длинном тапе.

### Pitfall 6: Переход pinch → один палец и обратно
**What goes wrong:** после отпускания одного пальца pan стартует с рывком (базис pan устарел); в начале следующего пинча ложный скачок.
**How to avoid:** при изменении числа активных указателей переанкерить базисы (новый pan-старт от текущих t/scale; сброс dist-базы пинча — MDN guard `prevDiff > 0`) [CITED: MDN Pinch zoom gestures].
**Warning signs:** рывок фото при отпускании пальца.

### Pitfall 7: `deltaMode` колеса (Firefox)
**What goes wrong:** в Firefox `deltaY` приходит в строках (deltaMode=1) — зум на колесо почти незаметен или чрезмерен.
**How to avoid:** нормализация: lines ×~16px [ASSUMED], pages × viewport height.
**Warning signs:** разное «ощущение» зума в Chrome vs Firefox.

### Pitfall 8: Порядок clamp на границах [1,4]
**What goes wrong:** clamp scale после пересчёта translate даёт скачок фото на границе; при scale=1 разрешённый pan копится.
**How to avoid:** clamp `s'` ПЕРВОЙ, затем формула zoom-to-point, затем клэмп t; при s=1 — жёстко t=(0,0) (пан не начинаем — нечему панорамировать).
**Warning signs:** фото «отлетает» к центру на 4x; панорама уезжает на 1x.

### Pitfall 9: Стрелки ←/→ поверх delete-confirm
**What goes wrong:** открыт сиблинг confirm-диалог, а window-listener ←/→ листает фото «за спиной» подтверждения.
**How to avoid:** guard в keydown-обработчике: `if (confirmOpen) return`.
**Warning signs:** при открытом «Удалить фото?» фон меняется.

### Pitfall 10: Русские копии лайтбокса не пинятся smoke-ом
**What goes wrong:** план закладывает smoke-иглы на новые строки лайтбокса — они не попадут в SSR HTML.
**Why:** `DialogContent` маунтится только при `open` (портал), а лайтбокс закрыт при SSR — в `smoke-custody.mjs` fetch видит лишь грид.
**How to avoid:** новые копии («N из M», aria-label стрелок) — однострочные шаблонные литералы по паттерну грида (discretion/CONTEXT), но проверка их — UAT (Playwright MCP), не smoke. Smoke-custody остаётся зелёным как регрессия контракта грида/роутов.

### Pitfall 11: ⌘K-проба умирает от «невинного» рефакторинга
**What goes wrong:** замена `DialogContent` wrapper-а на голый `DialogPrimitive.Popup` (или переименование data-slot) ломает селектор `[data-slot="dialog-content"][data-open]` — SC 4.
**How to avoid:** рендерить лайтбокс только через `components/ui/dialog.tsx` обёртки; `components/command-palette.tsx` — нулевые правки; `data-open` эмитится Base UI автоматически [VERIFIED: node_modules/@base-ui/react/utils/popupStateMapping.js].
**Warning signs:** ⌘K при открытом лайтбоксе не открывает палитру.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Отдельные mouse/touch-хендлеры (touchstart/touchmove + mousedown) | Единые Pointer Events + `touch-action` CSS | PE — baseline всех вечных браузеров (Safari 13+, 2019) | Один хендлер-кэш на всё (Pattern 3) |
| Zoom-библиотеки (Hammer.js и пр.) | Нативные pointer-кэш + экспоненциальный wheel | 2020-е; в связке с React 19 passive-моделью — только нативный листенер | D-04 совместим с мейнстримом: ручной код ~150 строк |
| `dblclick` на все устройства | Ручная double-tap детекция по pointer-таймингам | Давнее известное ограничение, MDN задокументировал | Pattern в Pitfall 4 |
| Radix Dialog | Base UI (shadcn default с Jul 2026) | Jul 2026 | Уже в проекте; `data-open`/скролл-лок — из коробки |

**Deprecated/outdated:** `next/image` для этих фото — осознанно отключён file-level eslint-disable в `photo-grid.tsx` (авторизованный роут перефетчит/перекодирует бинарник зря; решение 04-RESEARCH) — новые `<img>` в этом файле наследуют комментарий, новый directive не нужен.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Окно double-tap ~300 мс и порог drag ~5 px | Pattern 3, Pitfall 4 | Низкий: чисто тактильные константы, tuning без ломки контракта |
| A2 | line-height колеса ≈ 16px для deltaMode=1 | Pitfall 7 | Низкий: влияет только на Firefox-ощущение шага |
| A3 | Множитель двойного клика ~2.5x | Pattern 1 | Нулевой: явная Claude's Discretion в CONTEXT |
| A4 | `sm:max-w-sm` выигрывает на ≥sm (Tailwind v4 эмитит варианты после базовых) | Pitfall 2 | Низкий: рекомендация «передавать оба класса» корректна при любой интерпретации каскада |
| A5 | iOS 17–26 Safari файрит pointercancel/lostpointercapture так, как описано | Pitfall 3 | Средний: гвад реализуется в любом случае; риск — только в покрытии UAT (нужен реальный iPhone) |
| A6 | Touch-указатели неявно захватываются целевым элементом (implicit capture) — mouse требует явного `setPointerCapture` | Pattern 3 | Низкий: явный capture на оба типа безопасен |
| A7 | 515 тестов в vitest-сьюте зелёны на момент планирования (наследие фазы 14; живое измерение 2026-10-01: `npx vitest run` → 515 passed) | Validation Architecture | Низкий: счёт регрессии, не фазовый |

## Open Questions (RESOLVED)

1. **Навигация при одном фото (M=1)** — ✅ RESOLVED: принято «прятать» — 15-UI-SPEC.md Default 4, реализовано truth 5 в 15-02-PLAN.md.
2. **Зона действия колеса** — ✅ RESOLVED: принято «колесо только на стейдже, над контролами инертно» — 15-UI-SPEC.md Default 5, prohibition в 15-01-PLAN.md.
3. **Синхронизация выбранного фото с гридом** — ✅ RESOLVED: принято «не подсвечивать» (вне PHOTO-01) — 15-UI-SPEC.md Default 11; в планах отсутствует.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | dev/build/test | ✓ | 22.23.0 (Next 16 требует ≥20.9) | — |
| npm | scripts | ✓ | 10.9.8 | — |
| TypeScript | tsc --noEmit гейт | ✓ | 5.9.3 | — |
| vitest | регресс-сьют, математика зума | ✓ | 4.1.11 | — |
| playwright | UAT-сценарии (MCP-паттерн фаз 7/10) | ✓ | 1.62.1 (devDep) | — |
| Реальный iPhone (touch/pinch/pointercancel UAT) | SC 2/3 на iOS | ✗ (не в окружении CI) | — | Chrome DevTools touch-эмуляция + UAT оператора на своём телефоне (end-of-phase) |

**Missing dependencies with no fallback:** нет.
**Missing dependencies with fallback:** реальный iOS-девайс — pinch/pointercancel верифицируются эмуляцией и переносятся на оператора (human_verify_mode: end-of-phase).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.11 (node environment, без DOM/компонентного раннера — устоявшееся ограничение репо со фазы 2) |
| Config file | `vitest.config.ts` (alias `@`, stub `server-only`) |
| Quick run command | `npx vitest run tests/zoom-math.test.ts` (если план извлечёт `lib/zoom.ts`) |
| Full suite command | `npx vitest run` (515 тестов зелёны после фазы 14; живое измерение 2026-10-01) |
| E2E smoke | `node scripts/smoke-custody.mjs` (прод-билд на :3116 — пинит грид/роуты фото; лайтбокс-интерьер client-only, smoke-ом не пинится — Pitfall 10) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PHOTO-01 (SC 1) | Панель ~max-w-5xl, `sm:max-w-sm` перебит | unit (класс-пин через twMerge) или UAT | `npx vitest run tests/zoom-math.test.ts` / UAT | ❌ Wave 0 (опционально) |
| PHOTO-01 (SC 2) | Wheel/даблклик/pinch/drag, диапазон [1,4] | unit для чистой математики (`zoomAtPoint`, `clampOffset`, clamp границ) + UAT для жестов | `npx vitest run tests/zoom-math.test.ts` | ❌ Wave 0 |
| PHOTO-01 (SC 3) | Сброс при prev/next; pointercancel не залипает | unit (сброс = константное состояние) + UAT (реальные жесты/эмуляция) | `npx vitest run` + UAT | ❌ (unit) / UAT |
| PHOTO-01 (SC 4) | Delete-кнопка смонтирована; ⌘K-проба жива; fade-in без мигания | UAT (интерактив + портал + палитра); регресс — smoke-custody + vitest full | `node scripts/smoke-custody.mjs` | ✅ (smoke существует) |

Жесты/фокус/порталы — manual-only для авторантного раннера: компонентного раннера в репо нет (решение фазы 2), lightbox-контент не SSR-ится. Обоснование manual-only: интерактивность диалогов в этом проекте исторически верифицируется UAT через Playwright MCP (фазы 7/10; human_verify_mode: end-of-phase).

### Sampling Rate

- **Per task commit:** `npx tsc --noEmit && npx eslint` + `npx vitest run tests/zoom-math.test.ts` (если существует)
- **Per wave merge:** `npx vitest run` (полный сьют) + `node scripts/smoke-custody.mjs` при касании поверхностей фото
- **Phase gate:** полный сьют зелёный + build green + UAT-чеклист (жесты мышь/тач, ⌘K, delete, iOS pointercancel) перед `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/zoom-math.test.ts` — покрывает PHOTO-01 SC 2/3 математику (только если план извлекает `lib/zoom.ts`; настоятельно рекомендуется — единственный автоматический RED→GREEN фазы)
- [ ] Компонентный раннер/RTL — НЕ добавлять (противоречит устоявшемуся решению репо и D-04)

*(Иначе: существующая инфраструктура покрывает регрессию; новый автоматический слой только pure-математика.)*

## Security Domain

`security_enforcement: true`, ASVS Level 1 (config.json). Фаза — клиентская интерактивность поверх уже авторизованных поверхностей; новых входов, роутов и write-путей нет (D-05).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Сессия не затрагивается (фаза клиентская) |
| V3 Session Management | no | Cookie/скролл-лок не связаны; Base UI не трогает сессию |
| V4 Access Control | yes (unchanged) | DELETE-флоу: canMutate-гейт UI + серверный DISPOSED/DEVICE_NOT_FOUND guard (`assertDeviceAcceptsPhotos`) — не трогается (D-06) |
| V5 Input Validation | yes (unchanged) | Новых входов нет; URL фото строятся из числовых id (`/api/attachments/${id}?device=${deviceId}&variant=full`) — не из пользовательских строк |
| V6 Cryptography | no | Криптографии в фазе нет |

### Known Threat Patterns for React 19 + Base UI client island

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS через alt/fileName | Tampering | React экранирует текстовые узлы; не вводить `dangerouslySetInnerHTML` |
| Обход canMutate из консоли | Elevation | Клиентский гейт — UX, не граница; серверный DELETE-роут перепроверяет disposed/cap (существует, не трогается) |
| IDOR чужого device в URL | Information Disclosure | Существующий `?device=` периметр роута выдачи (smoke 307/404) — не меняется |

Новых threat-паттернов фаза не добавляет: жестовые хендлеры не читают сеть/хранилище и не влияют на авторизацию.

## Sources

### Primary (HIGH confidence)
- Локальные исходники `node_modules/@base-ui/react` 1.7.0 — `dialog/root/useDialogRoot.js` (useScrollLock при open && modal), `utils/popupStateMapping.js` (`data-open`), версия пакета
- Локальный исходник `node_modules/react-dom/cjs/react-dom-client.development.js` (строка ~19262): wheel/touchstart/touchmove — passive
- Локальный запуск tailwind-merge из `node_modules` проекта — резолв `sm:max-w-sm` vs `max-w-3xl`/`max-w-5xl`
- Код репо: `app/(app)/(card)/devices/[id]/photo-grid.tsx`, `components/ui/dialog.tsx`, `components/command-palette.tsx` (строка 223), `lib/photos.ts`, `lib/utils.ts`, `vitest.config.ts`, `scripts/smoke-custody.mjs`
- `.planning/STATE.md` — решение Phase 11/План 01 (React 19 set-state-in-effect eslint-правило)

### Secondary (MEDIUM confidence)
- [MDN — Pinch zoom gestures](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Pinch_zoom_gestures) — pointer-кэш, touch-action:none, prevDiff-guard
- [MDN — dblclick event](https://developer.mozilla.org/en-US/docs/Web/API/Element/dblclick_event) — ненадёжность на таче
- [MDN — touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action), [W3C Pointer Events spec](https://w3c.github.io/pointerevents/) — cancel/implicit capture
- [Jake Archibald — Animating zooming using CSS (Jun 2025)](https://jakearchibald.com/2025/animating-zoom-using-css/) — порядок transform (scale после translate)
- [SO 63663025](https://stackoverflow.com/questions/63663025/) — React onWheel passive (перекрёстно с локальным исходником React → апгрейд до VERIFIED)

### Tertiary (LOW confidence)
- Отчёты GDevelop/Mapbox/CesiumJS о dblclick на таче и pointercancel-залипаниях (форумы) — использованы только как ориентиры, паттерны покрыты MDN/спекой

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — ноль новых зависимостей; все версии/экспорты/поведение Base UI верифицированы в node_modules проекта
- Architecture: HIGH — композиция «Dialog + ZoomStage + контролы вне трансформации» следует существующему коду и MDN-канону
- Pitfalls: HIGH для P1/P2/P10/P11 (верифицировано в репо), MEDIUM для iOS-специфики (перекрёстно по MDN/W3C, живой девайс недоступен)

**Research date:** 2026-10-01
**Valid until:** 2026-10-31 (стабильный стек, зависимости фазы не меняются)
