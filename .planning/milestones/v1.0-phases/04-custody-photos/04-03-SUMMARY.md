---
phase: 04
plan: 03
subsystem: photos (upload pipeline, authorized serving, grid UI, list covers)
tags: [photos, sharp, exif-strip, upload, idor, containment, cap-in-tx, thumbnails, lightbox, client-resize, tdd, tracer, REG-05]
requires:
  - "04-01/04-02: карточка устройства с плейсхолдером «Фото», disposed view-only (D-03), requireSession-первой-строкой, статусная матрица"
  - "04-RESEARCH: C5 (sharp-пайплайн executed против 0.35.4, клиентский ресайз createImageBitmap+canvas, Route Handler вместо Server Action из-за bodySizeLimit 1MB), C6 (батчевые обложки), Next-16 params=Promise"
  - "Фаза 1: attachments в миграции 0000 (один storage_key, триггеров нет), data/uploads/, backup.mjs переносит uploads"
  - "CHECKPOINT APPROVED: sharp@0.35.4 (official repo lovell/sharp, no postinstall, SUS=too-new churn) — npm install выполнен первым шагом"
provides:
  - "lib/photos.ts — server-модуль без next/*-импортов: MAX_PHOTOS=8, MAX_RAW_BYTES=10MB, FULL_EDGE=1600/THUMB_EDGE=400, uploadsDir() (env UPLOADS_DIR, default ./data/uploads, лениво), thumbKeyOf() — ЕДИНСТВЕННАЯ деривация <uuid>.thumb.jpg (Pitfall 8), assertInsideUploads/resolveUploadPath (containment, {code:'PATH_ESCAPE'}), assertDeviceAcceptsPhotos (disposed → {code:'DISPOSED'}, неизвестное → {code:'DEVICE_NOT_FOUND'}), processPhoto (sharp: metadata magic-byte gate jpeg/png/webp/heif → rotate() → resize inside withoutEnlargement → jpeg q82; garbage/undecodable → {code:'BAD_IMAGE'}; EXIF/GPS/ICC стрипаются re-encode по умолчанию)"
  - "db/queries/attachments.ts — чистый модуль: countByDevice, listByDevice (created_at DESC, id DESC, kind='photo'), insertWithCapCheck (count re-check + INSERT в ОДНОЙ tx → {code:'CAP'}), getAttachment (строгая пара deviceId+attachmentId, чужая пара → undefined), deleteAttachment (пара+disposed guard в tx → DELETE строки → unlink full+thumb ПОСЛЕ коммита, любые fs-ошибки толерируются — orphan-файл безвреден; НЕ пишет в movements — D-05)"
  - "app/api/devices/[id]/photos/route.ts — POST: requireSession первой строкой → zod id → assertDeviceAcceptsPhotos(getDevice) → formData ≤10MB/file → processPhoto → mkdir+writeFile full+thumb → insertWithCapCheck; ЛЮБОЙ сбой после записи → unlink обоих; коды {NO_FILE:400, TOO_LARGE:400, BAD_IMAGE:415, CAP/DISPOSED:409, DEVICE_NOT_FOUND:404}, внутренние ошибки → console.error + 500 без деталей (V7)"
  - "app/api/attachments/[attachmentId]/route.ts — GET serve: requireSession → обязательный ?device= (пара V4) → ?variant=thumb|full → containment → readFile → Response c Content-Type 'image/jpeg' (жёстко, не эхо), Cache-Control 'private, max-age=31536000, immutable', nosniff, inline; DELETE: те же guard'ы → {code:...} маппинг (DISPOSED → 409), файлы чистит queries-слой"
  - "app/(app)/(card)/devices/[id]/photo-grid.tsx — client-остров: заголовок «Фото» + счётчик «{n} из 8», сетка grid-cols-3 sm:grid-cols-4 gap-2, тайлы aspect-square object-cover c aria-label «Фото {n} из {всего}», empty state «Фотографий пока нет» + «Добавьте до 8 фото — подойдут снимки с телефона.», add-tile (dashed, Plus 20, «Добавить», input accept=image/* multiple БЕЗ capture, pending «Загрузка…» bg-black/5), клиентский ресайз createImageBitmap+canvas ≤1600 → sequential POST per file → router.refresh(), роль=alert «Не удалось загрузить/удалить фото. Попробуйте ещё раз.», лайтбокс max-w-3xl p-4 (img max-h-[70svh], close aria-label «Закрыть»), delete-confirm «Удалить фото?»/«Фото будет удалено безвозвратно.»/«Удалить» (neutral bg-ink)/«Не удалять»; disposed → canMutate=false: без add-tile и «Удалить фото»"
  - "app/(app)/(card)/devices/[id]/page.tsx — плейсхолдер «Фото» заменён PhotoGrid (фото id+fileName как плоские props, canMutate = status!=='disposed', maxPhotos из lib/photos)"
  - "db/queries/devices.ts — listDevices: +coverAttachmentId (первое фото, DeviceListItemWithCover) одним батчевым сканом inArray по ≤20 id страницы, JS-группировка (RESEARCH C6; индекса на attachments.device_id нет и быть не может)"
  - "app/(app)/devices/page.tsx — ведущая миниатюра size-10 rounded-lg object-cover в строке списка (gap-2→gap-3), без placeholder-бокса у устройств без фото (UI-SPEC Defaults #9)"
  - "tests/attachments-queries.test.ts — 20 кейсов: thumbKeyOf/uploadsDir/containment/disposed-guard, processPhoto (5000×2000→1600×640 + thumb 400, orientation 6 → 1600×800 landscape + exif/icc/orientation отсутствуют, 800×600 без enlargement, garbage → BAD_IMAGE), cap 8-й ок/9-й CAP + per-device, listByDevice DESC, IDOR-пара, delete файла+строки/ENOENT/чужая пара/disposed, source-гейты (requireSession до любого доступа, public/ чист, остров: createImageBitmap+accept+multiple+без capture+router.refresh)"
  - "scripts/smoke-custody.mjs — расширен фото-e2e на production build: POST/GET без cookie → 307, upload (sharp-синтезированный JPEG 900×700 через FormData) → 200, thumb/full 200 (image/jpeg, private+immutable, thumb ≤400, 900×700 — без enlargement), IDOR/без ?device → 404, мусор → 415 BAD_IMAGE, 9-е фото → 409 CAP и 0 файлов на диске, upload на disposed → 409 DISPOSED, seeded DELETE на disposed → 409 DISPOSED (файлы целы), delete живого → 200 + строка и оба файла исчезли (UPLOADS_DIR в temp-каталоге)"
affects: ["фаза 5 (поиск/фильтры читают те же listDevices/обложки)", "UAT (визуальная приёмка сетки/лайтбокса/диалога удаления по 04-UI-SPEC)", "backup/deploy (data/uploads наполняется — backup.mjs уже покрывает)"]
tech-stack:
  added: ["sharp 0.35.4 (direct dependency, approved checkpoint; ^0.35.4 = >=0.35.4 <0.36.0, minor закреплён; auto-externalized Next)"]
  patterns:
    - "Доверенная граница пайплайна: клиентский ресайз — только экономия трафика; EXIF-strip/orientation/размер гарантирует серверный re-encode (sharp rotate → inside/withoutEnlargement → jpeg q82; метаданные снимаются по умолчанию)"
    - "Cap ≤8 в транзакции (count+INSERT, Pitfall 7) — параллельные POST'ы не проводят 9-е фото; клиент прячет тайл на 8/8 только как UX"
    - "IDOR строгой парой: attachmentId отвечает только вместе с ?device=<id> из URL; storage path — resolve+relative containment под UPLOADS_DIR, тампер key → 404, не 500"
    - "storageKey генерит сервер ('<deviceId>/<uuid>.jpg' относительно корня), клиент не влияет на путь (T-04-09); thumbnail — деривация суффиксом в ОДНОМ месте"
    - "Порядок записи: файлы ДО INSERT (broken-строк не бывает), любой сбой после записи → unlink обоих; обратный orphan-файл — безвредное направление"
    - "Route Handler вместо Server Action для upload (bodySizeLimit 1MB, RESEARCH Pitfall 1); requireSession первой строкой — V3 defense-in-depth над прокси-периметром"
    - "SSR-цельный копи: строки со счётчиком/лимитом собираются в одну переменную — React дробит интерполированные текст-ноды <!-- --> маркерами, smoke ассертит байт-в-байт"
key-files:
  created:
    - lib/photos.ts
    - db/queries/attachments.ts
    - "app/api/devices/[id]/photos/route.ts"
    - "app/api/attachments/[attachmentId]/route.ts"
    - "app/(app)/(card)/devices/[id]/photo-grid.tsx"
    - tests/attachments-queries.test.ts
  modified:
    - "app/(app)/(card)/devices/[id]/page.tsx"
    - db/queries/devices.ts
    - "app/(app)/devices/page.tsx"
    - scripts/smoke-custody.mjs
    - scripts/smoke-devices.mjs
    - package.json
    - package-lock.json
requirements-addressed: [REG-05]
decisions:
  - "Остров получает maxPhotos пропсом, а не импортом lib/photos.ts: модуль тянет sharp/node-builtins — статический импорт константы сломал бы клиентский бандл; значения лимитов живy в одном месте, RSC-страница передаёт их вниз"
  - "listDevices возвращает rows типа DeviceListItemWithCover (расширение DeviceListItem) — getDevice/DeviceRow не изменялись: карточке обложка не нужна, потребители listDevices совместимы (поле добавлено)"
  - "GET жёстко отдаёт Content-Type 'image/jpeg' (пайплайн пишет только JPEG) вместо эха row.mimeType из БД — защита от MIME-путаницы строго исследовательского 'row.mimeType ?? image/jpeg'"
  - "DELETE на disposed в smoke проверяется seeded-строкой (upload на disposed невозможен по определению) — это единственный способ дотянуться до D-03-vetvи deleteAttachment через HTTP end-to-end"
  - "POST обрабатывает все 'file'-записи FormData последовательно (клиент шлёт по одной); сбой в середине батча сохраняет уже записанные — cap всё равно держит устройство на ≤8"
  - "Имя guard-хелпера assertDeviceAcceptsPhotos (в плане — «DEVICE_EXTENSION guard-хелпер»): семантика та же (disposed → {code:'DISPOSED'}), имя читаемее"
  - "quality 82 (по task-действию плана) против 80 (research C5): выбран более поздний биндинг — тесты качество не ассертят"
deviations:
  - "app/(app)/devices/page.tsx ОТСУТСТВОВАЛ в files_modified плана, но must_haves-истина «Карточки устройств в списке показывают миниатюру-обложку (первое фото)» + UI-SPEC «Devices list (only change: thumbnails)» + REG-05 требуют рендер; без правки списка батчевый cover-запрос devices.ts был бы мёртвым кодом. Правка минимальна: img size-10 + gap-2→gap-3 по спеке"
  - "«401 без cookie» из плана наблюдаемо недостижим по контракту кодовой базы: прокси-периметр (и requireSession → redirect) отвечают 307 → /login ДО хендлера, как и на всех существующих маршрутах (смоуки фаз 3–4 ассертят именно 307). Забор: без cookie бинарник никогда не отдаётся (smoke ассертит 307 на POST и GET); контракту «requireSession первой строкой» это соответствует, отклонение только в номере статуса"
  - "Тестовые правки в GREEN-коммите (как в 04-02): AttachmentView дополнен deviceId (полезен потребителям), seed-ассерт storageKey фиксирован (ключ сидировался серийным счётчиком, не id строки), captureThrownAsync для async-{code}, createDevice в тесте зовётся с полным DeviceInput"
self-check:
  - "npx vitest run → 174 passed / 174 (13 файлов; базлайн 154 + 20 новых); TDD: test(04-03) RED 08e6a91 (падение на отсутствующих @/db/queries/attachments) → feat(04-03) GREEN 643ef99 (данные, 17/20) → GREEN 0c216dd (роуты+UI, 174/174)"
  - "npm run build → exit 0, TypeScript clean; route table: + /api/devices/[id]/photos и + /api/attachments/[attachmentId] (оба ƒ/dynamic)"
  - "node scripts/smoke-custody.mjs → exit 0: прежняя матрица 4 статусов + фото-e2e (307-периметр POST/GET; upload 200; thumb/full 200 c image/jpeg и private+immutable; thumb ≤400px, full 900×700; IDOR/без device 404; мусор 415 BAD_IMAGE; 9-е 409 CAP без файлов; disposed upload+delete 409 DISPOSED; delete 200, строка+2 файла исчезли)"
  - "node scripts/smoke-devices.mjs → exit 0 (needle «Здесь появятся фотографии устройства.» заменён на «Фотографий пока нет»/«Добавьте до 8 фото…»/«0 из 8»/«Добавить», без тайлов и /api/attachments/ в пустой сетке)"
  - "node scripts/smoke-employees.mjs → exit 0 (регрессии нет)"
  - "Греп-гейты: public/ не содержит uploads (0 файлов); await requireSession() присутствует и является первым оператором в обоих хендлерах (GET+DELETE ×2 и POST ×1); drizzle/ не пополнялся (миграций нет)"
  - "npx tsc --noEmit → 0 ошибок; npx eslint на всех изменённых файлах → 0 ошибок, 0 предупреждений"
status: complete
---

# Phase 04 Plan 03: Фото устройства — пайплайн sharp, авторизованная раздача, сетка и обложки Summary

REG-05 закрыт полностью: фото прикладываются с телефона и десктопа (клиентский ресайз ≤1600px → Route Handler → sharp gate+rotate+resize+JPEG re-encode со снятыми EXIF/GPS/ICC → диск data/uploads + метаданные в attachments), до 8 на устройство с in-transaction cap, раздача и удаление — только авторизованными route handlers со строгой IDOR-парой и containment, сетка 3/4-колонки с лайтбоксом и нейтральным delete-confirm на карточке, обложки-миниатюры в списке устройств. Доказано 174 тестами (20 новых, TDD RED→GREEN), сборкой (+2 маршрута), расширенным smoke-custody (фото-e2e c файловыми и БД-ассертами) и двумя smoke-регрессиями.

## What Was Built

- **Checkpoint `16f154a` (approved):** `npm install sharp@0.35.4` — первый шаг плана; прямая зависимость (^0.35.4 на 0.x закрепляет minor), auto-externalized Next, конфиг не тронут.
- **TDD RED `08e6a91`:** `tests/attachments-queries.test.ts` — 20 кейсов, падение на отсутствующих модулях: деривация thumbKeyOf, uploadsDir-default, containment (включая /etc/passwd → PATH_ESCAPE), disposed-guard; processPhoto против sharp-синтезированных входов (5000×2000 → 1600×640 + thumb 400×160; 1000×2000 c orientation 6 → 1600×800 landscape и БЕЗ exif/icc/orientation; 800×600 остаётся 800×600; garbage/пустой буфер → BAD_IMAGE); cap (8 ок, 9-й CAP, счётчик заморожен; per-device); listByDevice DESC; строгая пара; delete (строка+оба файла исчезают; ENOENT толерируется; чужая пара → ATTACHMENT_NOT_FOUND; disposed → DISPOSED и строка жива); source-гейты.
- **GREEN данные `643ef99`:** `lib/photos.ts` — серверный модуль без next/*: лимиты, ленивый uploadsDir(), thumbKeyOf (Pitfall 8), assertInsideUploads/resolveUploadPath, assertDeviceAcceptsPhotos, processPhoto (magic-byte gate по metadata().format ∈ {jpeg,png,webp,heif} → rotate() → resize inside/withoutEnlargement → jpeg q82; все ошибки → {code:'BAD_IMAGE'}). `db/queries/attachments.ts` — countByDevice/listByDevice (kind='photo', created_at DESC, id DESC)/insertWithCapCheck (count+INSERT в одной tx)/getAttachment (пара)/deleteAttachment (guard'ы в tx → DELETE → unlink full+thumb после коммита, fs-ошибки толерируются; movements не трогается — D-05).
- **GREEN роуты+UI `0c216dd`:** POST `/api/devices/[id]/photos` (requireSession первой строкой → guard устройства → ≤10MB → processPhoto → серверный storageKey `<deviceId>/<uuid>.jpg` → mkdir+write full+thumb → insertWithCapCheck; сбой после записи → unlink обоих; коды → 400/404/409/415, внутреннее — только в console.error); GET/DELETE `/api/attachments/[attachmentId]?device=` (обязательная пара, ?variant=thumb, containment, Content-Type жёстко image/jpeg, Cache-Control private+immutable, nosniff, inline; DELETE маппит DISPOSED → 409). `photo-grid.tsx` — весь UI-SPEC-контракт сетки/лайтбокса/удаления c клиентским ресайзом (createImageBitmap+canvas, БЕЗ capture) и router.refresh(); карточка — плейсхолдер заменён островом; devices.ts — батчевая обложка; список — ведущая миниатюра.
- **Smoke `800c7b7`:** smoke-custody — фото-e2e шаг 10 (периметр 307; upload/serve с реальным sharp-JPEG; кэш-заголовки; IDOR; BAD_IMAGE; CAP без файлов; DISPOSED на upload и seeded-delete; delete — строка+файлы; UPLOADS_DIR в temp-каталоге для файловых ассертов); smoke-devices — needle плейсхолдера заменён на пустую фото-сеть; в острове счётчик/копи собраны цельными строками (React SSR дробит интерполяции `<!-- -->`, smoke ассертит байт-в-байт).

## TDD Gate Compliance

- feat(sharp-pin) `16f154a` → test(04-03) RED `08e6a91` (1 файл падает: Cannot find package '@/db/queries/attachments') → feat(04-03) GREEN `643ef99` (данные: 17/20, остаются 3 source-гейта на ещё несуществующие роуты/остров) → feat(04-03) GREEN `0c216dd` (174/174) → test(smoke) `800c7b7`. Ворота соблюдены: RED предшествует GREEN, каждый GREEN делает полный набор зелёным.

## Verification Evidence

- `npx vitest run` → 174 passed / 174 (13 файлов; базлайн 154 + 20 новых).
- `npm run build` → exit 0; TypeScript clean; route table: `ƒ /api/devices/[id]/photos`, `ƒ /api/attachments/[attachmentId]` добавлены, остальные маршруты без изменений.
- `node scripts/smoke-custody.mjs` → exit 0 — прежняя custody-матрица + полный фото-периметр (см. self-check).
- `node scripts/smoke-devices.mjs` → exit 0; `node scripts/smoke-employees.mjs` → exit 0 (регрессий нет).
- `npx tsc --noEmit` → чисто; `npx eslint` на всех изменённых файлах → 0/0.
- Греп-гейты плана: uploads/ НЕ в public/ (0 совпадений); await requireSession() — первый оператор каждого экспортированного хендлера (POST×1, GET+DELETE×2); новых миграций нет.

---

*Phase: 04-custody-photos*
*Plan: 04-03*
*Completed: 2026-09-04*
