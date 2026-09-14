---
phase: 03
plan: 02
subsystem: devices card + edit
tags: [device-registry, card, edit-dialog, zod-strict-schema, 404-invariant, no-delete-gate, russian-ui, tdd, tracer]
requires:
  - "План 03-01: lib/device-schema.ts (typeFields/buildZodSchema), db/queries/devices.ts (getDevice/updateDevice с normalized-пересчётом), device-dialog.tsx (create-режим), actions.ts (updateDeviceAction-заготовка), smoke-devices.mjs"
  - "Фаза 2: (card)-group 404-инвариант (d0ceff8), employee-dialog edit-механика (hidden id, per-open inner state), Intl ru-форматтеры"
provides:
  - "Карточка /devices/[id] — guard-first RSC в (card)-group: id через z.coerce.int().positive() → notFound(), getDevice → notFound(); группы Основное / Характеристики типа / Закупка рендерятся из typeFields (D-02 — параллельных списков нет), пустые опциональные — прочерк, серийник/инвентарник mono, статус-пилюля нейтральная, Заметки — full-width whitespace-pre-line; плейсхолдеры «История перемещений»/«Фото» (фаза 4)"
  - "(card)/devices/[id]/error.tsx — русская граница «Не удалось загрузить карточку устройства» + «Попробовать снова» (retry-проп этой версии Next); loading.tsx в (card) НЕ создан (404-инвариант)"
  - "Edit-режим диалога (тот же компонент, D-06): device-проп (плоский сериализуемый снапшот, Dates → yyyy-mm-dd), hidden id, «Тип» read-only статичным текстом, все поля своего типа предзаполнены (select/checkbox через initial), primary «Сохранить изменения», заголовок «Редактировать устройство», data-device-edit-id на триггере"
  - "deviceSaveSchema/deviceUpdateSchema в keystone (device_schema): общие границы переехали из actions в единый источник (D-02); UpdateSchema = {id} + общие + strict per-type — подменённый typeKey/status/currentEmployeeId в payload отвергается strictObject'ом; update-действие берёт typeKey только из строки БД"
  - "deviceTypeName()/deviceStatusLabel() в keystone — общие словари отображения (list-страница переведена с локальных копий)"
  - "scripts/smoke-devices.mjs расширен: карточка зонда 200 + группы + плейсхолдеры + edit-остров; /devices/99999 и /devices/abc → 404 + русская «Страница не найдена»"
affects: [фаза 4 (custody-действия поверх карточки: статус/держатель меняются только там; movements-плейсхолдеры ждут контент), фаза 5 (фильтры читают тот же keystone), UAT edit-потока через карточку]
tech-stack:
  added: []
  patterns:
    - "edit-диалог = тот же компонент с device?-пропом (employee-паттерн): useActionState выбирает action по режиму, inner form живёт в портале (per-open state, WR-01)"
    - "read-only сущность в форме = статичный текст вместо disabled-контрола + отсутствие ключа в zod-схеме (двойной барьер: UI не шлёт, сервер не принимает)"
    - "карточные значения: единый Value-хелпер с прочерком для пустых опциональных; Intl-форматтеры даты/цены подняты на уровень модуля в UTC (server-hoist-static-io, день не зависит от таймзоны хоста)"
    - "словари отображения (тип/статус) живут в keystone рядом с полями — ни список, ни карточка не держат параллельных карт"
key-files:
  created:
    - "app/(app)/(card)/devices/[id]/page.tsx"
    - "app/(app)/(card)/devices/[id]/error.tsx"
  modified:
    - "app/(app)/devices/device-dialog.tsx"
    - "app/(app)/devices/actions.ts"
    - "app/(app)/devices/page.tsx"
    - "lib/device-schema.ts"
    - "scripts/smoke-devices.mjs"
    - "tests/device-schema.test.ts"
    - "tests/devices-queries.test.ts"
requirements-addressed: [REG-03]
decisions:
  - "Порядок групп карточки — Основное → Характеристики типа → Закупка (план-executable контракт: must_haves truth + action дважды фиксируют этот порядок; он же совпадает с порядком секций диалога). Порядок перечисления групп в абзаце UI-SPEC (…Закупка…Характеристики типа) перекрыт — зафиксировано здесь"
  - "deviceSaveSchema/deviceUpdateSchema помещены в lib/device-schema.ts, общие границы полей переехали туда же из actions.ts: D-02 требует единого источника валидации, а 'use server'-модуль не может экспортировать не-async хелперы для тестов — keystone может"
  - "Словари deviceTypeName/deviceStatusLabel вынесены в keystone, list-страница переведена с локальных TYPE_NAMES/STATUS_LABELS: устранение параллельных карт в духе D-02; files_modified плана расширены page.tsx (см. deviations)"
  - "Диагональ на карточке рендерится со знаком ″ («27″» — дословно из per-type field table UI-SPEC); RAM/SSD/порты — голые числа (единица уже в label); ramUpgraded — Да/Нет, null — прочерк"
  - "В edit-режиме диалог typeKey hidden-input НЕ рендерит вовсе: нечего отправлять — сервер всё равно берёт тип из строки; strictObject UpdateSchema отверг бы такой ключ"
deviations:
  - "app/(app)/devices/page.tsx не перечислен в files_modified плана — изменён минимально (перевод на общие deviceTypeName/deviceStatusLabel вместо локальных словарей); нефункциональный refactor в пользу D-02"
  - "updateDeviceAction уже существовал с 03-01 (создан вместе с actions-модулем); план 03-02 выполнил его контракты: id включён в merged UpdateSchema, схема перенесена в keystone и покрыта strict-тестами — поведение не изменилось, гейты усилены"
self-check:
  - "npx vitest run: 102 passed / 102 (базлайн 96 + 6 новых: strict UpdateSchema/SaveSchema-гейты + усиленный unknown-id no-op); TDD: test(03-02) RED ff81e36 → feat(03-02) GREEN 2e0e495 (RED подтверждён: 6 failed до реализации)"
  - "npm run build: exit 0; route table содержит ƒ /devices/[id]"
  - "node scripts/smoke-devices.mjs: exit 0 — полный прогон: 307-периметр, 200+зонд+CTA+пилюля, / → /devices, фильтр+clamp, карточка 200 + группы + плейсхолдеры фазы 4 + edit-остров (data-device-edit-id), 404 на /devices/99999 и /devices/abc + русская «Страница не найдена»"
  - "node scripts/smoke-employees.mjs: exit 0 (регрессии нет)"
  - "Греп-гейт no-delete: grep -rniE '\\bdelete\\b' db/queries/devices.ts app/(app)/devices/ = 0; гейт 404-инварианта: app/(app)/(card)/devices/[id]/loading.tsx отсутствует"
status: complete
---

# Phase 03 Plan 02: Device card + edit dialog Summary

Замыкающий срез REG-03: карточка устройства группами из keystone с русским 404-инвариантом (card)-group → edit-режим того же диалога (тип read-only, все поля своего типа редактируются, статус/держатель отсутствуют) → strict UpdateSchema в keystone (подменённые typeKey/status/currentEmployeeId отвергаются) → гейты целостности (no-delete, отсутствие loading в (card), полная матрица smoke). Доказано 102 тестами (TDD RED→GREEN) и расширенным smoke.

## What Was Built

- **TDD (RED `ff81e36`):** `tests/device-schema.test.ts` +6 кейсов — deviceUpdateSchema валидирует {id}+общие+строгий per-type набор строки (мусорный/нулевой/отсутствующий id отвергается), подменённый `typeKey` в payload отвергается (тип — из строки БД), custody-колонки `status`/`currentEmployeeId` вне схемы (Pitfall 4), per-type whitelist сохраняется (monitor не принимает ramGb), общие границы держатся на edit (дата ISO, цена, notes 2000); deviceSaveSchema — тот же merged-whitelist без id, peripheralKind обязателен. `tests/devices-queries.test.ts`: updateDevice по несуществующему id → false И количество строк не растёт (не только no-update, но и no-insert). До реализации — 6 failed (RED подтверждён).
- **GREEN `2e0e495`:** `lib/device-schema.ts` — CommonFields (общие границы из actions) переехали в keystone; `deviceSaveSchema(typeKey)`/`deviceUpdateSchema(typeKey)` = strictObject из общих + buildZodSchema().shape (у update — с `id: z.coerce.number().int().positive()`); `deviceTypeName()`/`deviceStatusLabel()` — общие словари отображения. `app/(app)/devices/actions.ts` — create валидируется deviceSaveSchema, update — deviceUpdateSchema с id в объекте; typeKey читается ТОЛЬКО из `existing.typeKey` (grep: `formData.get('typeKey')` — единственный, в create-ветке). `device-dialog.tsx` — экспорт `DeviceDialogDevice` (плоский сериализуемый снапшот, Dates → yyyy-mm-dd); edit-режим: hidden id, «Тип» статичным 16px-текстом без hidden-input, все поля предзаполнены (text/number defaultValue, select через initial-state, checkbox defaultChecked из 0/1), primary «Сохранить изменения», заголовок «Редактировать устройство», `data-device-edit-id` на триггере; create-ветка не изменилась. `page.tsx` карточки — edit-остров с `dialogDeviceOf(device)`.
- **UI `4a8b0d2` (задача 1):** `app/(app)/(card)/devices/[id]/page.tsx` — guard-first RSC: params Promise → z.coerce.int().positive() → notFound() ДО базы, getDevice → notFound(); заголовок-модель 28/600, meta-строка «тип · серийник (mono)» + пилюля только при status ≠ in_stock (нейтральная bg-black/5); группы по плану Основное (Тип/Модель/Серийник mono/Инвентарник mono/Статус пилюлей/Держатель/Заметки full-width) → Характеристики типа (typeFields, прочерки пустых, диагональ с ″, Да/Нет у флага) → Закупка (дата ru-RU, цена Intl ₽, поставщик, гарантия без цвета) → плейсхолдеры «История перемещений»/«Фото» с копи UI-SPEC; Intl-форматтеры модульные, в UTC. `error.tsx` — «Не удалось загрузить карточку устройства» + retry. `scripts/smoke-devices.mjs` — карточка зонда (lastInsertRowid вместо угадывания id=1) + 404-матрица 99999/abc.

## TDD Gate Compliance

- `test(03-02)` RED `ff81e36` (6 кейсов падают на отсутствующих deviceUpdateSchema/deviceSaveSchema) предшествует `feat(03-02)` GREEN `2e0e495` — ворота соблюдены. Задача 1 (карточка) зафиксирована отдельным `feat(03-02)` `4a8b0d2` до RED-коммита — карточка не входит в TDD-объём задачи 2.

## Verification Evidence

- `npx vitest run` → 102 passed (11 файлов): базлайн 96 + 6 новых.
- `npm run build` → exit 0; route table: `ƒ /devices/[id]`.
- `node scripts/smoke-devices.mjs` → exit 0: «307 → /login без cookie; 200 + «Смок Устройство» + CTA + пилюля с cookie; / → 307 на /devices; фильтр type=laptop + «1 устройство»; type=zzz → все типы; page=99 клампится; карточка 200 + группы + плейсхолдеры фазы 4 + edit-остров; 404 на /devices/99999 и /devices/abc + русская страница «Страница не найдена»».
- `node scripts/smoke-employees.mjs` → exit 0 (сотрудники не регрессировали).
- Гейты плана: no-delete grep (`\bdelete\b` по db/queries/devices.ts + app/(app)/devices/) = 0; `app/(app)/(card)/devices/[id]/loading.tsx` отсутствует (404-инвариант d0ceff8); grep подтверждает — update-путь не читает typeKey из payload, schema-гейт покрыт тестами.

---

_Fixed at: 2026-09-02_
_Executor: ZCode (fallback executor — MCP spawn outage)_
_Plan: 03-02 of 2, phase complete_
