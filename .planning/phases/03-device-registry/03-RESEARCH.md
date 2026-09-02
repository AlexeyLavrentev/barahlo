# Phase 3 Research: Device Registry

**Phase:** 03-device-registry
**Researched:** 2026-09-02 (orchestrator-inline; MCP spawn outage — see CONTEXT §canonical)
**Confidence:** HIGH — все паттерны уже верифицированы исполнением в фазах 1–2; новый код — та же форма над готовой схемой.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01** Пер-типовые поля: общие (модель*, серийник*, инвентарник, закупка: дата/цена/поставщик, гарантия до, заметки) + laptop (ramGb, ramUpgraded, ssdGb), monitor (screenDiagonal, panelType), dock (portCount), peripheral (peripheralKind) — ровно колонки схемы v1.
- **D-02** `device_schema` keystone: typeKey → список полей (ключ, ru-label, тип, required, группа); из него форма + zod-валидация; фильтры фазы 5 читают тот же модуль.
- **D-03** peripheralKind — фиксированный select: мышь / клавиатура / гарнитура / веб-камера / прочее.
- **D-04** Серийник обязателен у всех типов; конвенция для безсерийной периферии — вписать инвентарник из 1С (подсказка в форме).
- **D-05** Список: двухстрочные строки (модель+тип / серийник·инвентарник·держатель·статус), dropdown-фильтр по типу, пагинация 20 (prev/next).
- **D-06** Карточка группами (Основное / Характеристики типа / Закупка); статус и держатель — просмотр, в форме отсутствуют; create/edit — один диалог.

### Claude's Discretion
Группировка полей карточки, порядок колонок, формат даты/цены (ru-RU Intl), текст подсказки D-04.

### Deferred (OUT OF SCOPE)
Фото (фаза 4), статусные действия (фаза 4), полевые фильтры/поиск (фаза 5), клон устройства (v1.x).

### UI Contract (binding)
`03-UI-SPEC.md` (approved): two-line rows h-[60px], диалог формы, mono для серийника/инвентарника (Geist Mono activation), dropdown фильтр, статус-пилюли нейтральные, accent только CTA/фокус/checkmark select, per-type field table в спеке — канон для device_schema, (card) group для 404-инварианта, nav «Устройства» + redirect `/` → `/devices`.

## Phase Requirements
- **REG-01** Список по типам с пагинацией
- **REG-02** Создание устройства любого из 4 типов; форма показывает набор полей типа
- **REG-03** Редактирование всех полей; пер-типовый набор enforced

## Project Constraints (from CLAUDE.md / AGENTS.md)
Новых миграций НЕТ (схема v1 полная). `drizzle-kit push` запрещён. Next 16: `params`/`searchParams` — Promise; `error.tsx` получает `retry`; мутация без `refresh()` = stale UI. Все действия — `requireSession()` первой строкой + zod-whitelist. `node_modules/next/dist/docs/` — источник по Next-API. Русский инлайн, без i18n.

## Summary
Фаза 3 — CRUD-фаза над готовой схемой: keystone-модуль + queries + три экрана (список/карточка/диалог) по лекалам фазы 2. Единственные новые механики: условные поля формы по типу (render из device_schema), zod-схема, собираемая из того же модуля, и запись normalized-номеров через `lib/normalize`.

## Architectural Responsibility Map
| Concern | Layer |
|---|---|
| device_schema (поля/типы/валидация) | `lib/device-schema.ts` (чистый модуль, без Next-импортов — читается и сервером, и клиентом) |
| Queries (список/карточка/insert/update) | `db/queries/devices.ts` (sync better-sqlite3 через `@/db`) |
| Мутации | `app/(app)/devices/actions.ts` (requireSession → zod → queries → refresh()) |
| Список/карточка | RSC `app/(app)/devices/page.tsx`, `(card)/devices/[id]/page.tsx` |
| Диалог | client island `device-dialog.tsx` (useActionState), поля рендерит из device_schema |
| Фильтр типа + пагинация | URL searchParams (`?type=laptop&page=2`), серверная валидация |

## Standard Stack
Тот же, что фазы 2; НОВЫХ пакетов нет (зачёт Package Legitimacy — T-03-SC не возникает). shadcn `select` уже установлен (`components/ui/select.tsx` из набора? — если нет: `npx shadcn@latest add select checkbox` — реестр официальный, чекпоинт не нужен, санкционировано approved-чекпоинтом фазы 2 для shadcn-реестра).

## Architecture Patterns (фаза-специфичное; базовые — 02-RESEARCH Patterns 1–6 переиспользуются дословно)

### Pattern D1: device_schema — единственный источник (D-02)
```ts
// lib/device-schema.ts — типы из db/schema.ts, БЕЗ Next-импортов
export type FieldType = 'text' | 'number' | 'select' | 'checkbox' | 'date' | 'textarea'
export type DeviceField = {
  key: 'ramGb' | 'ssdGb' | 'screenDiagonal' | 'panelType' | 'portCount' | 'peripheralKind'
  label: string            // русский, из UI-SPEC field table
  type: FieldType
  required: boolean
  options?: string[]       // для select (peripheralKind, panelType)
  group: 'type' | 'main' | 'purchase'
}
export const DEVICE_TYPES = [
  { key: 'laptop',    name: 'Ноутбук',      fields: [...] },
  { key: 'monitor',   name: 'Монитор',      fields: [...] },
  { key: 'dock',      name: 'Док-станция',  fields: [...] },
  { key: 'peripheral',name: 'Периферия',    fields: [...] },
] as const
export function typeFields(typeKey: string): DeviceField[]
export function buildZodSchema(typeKey: string): z.ZodObject  // required → min(1)/positive, optional → nullable
```
`buildZodSchema` возвращает СЕРВЕРНУЮ схему для actions и (через тот же модуль) конфигурацию полей для клиентского рендера. Двойное использование = D-02 «никаких параллельных списков полей».

### Pattern D2: UNIQUE normalized при необязательном инвентарнике
`inventoryNormalized` nullable + UNIQUE — SQLite допускает много NULL. Правило записи: если `inventoryNumber` пуст → оба поля null; если введён → `normalizeInventory()` (lib/normalize.mjs) в оба. Серийник: всегда оба (NOT NULL), `normalizeSerial()` до INSERT/UPDATE. Коллизия UNIQUE → ловить `SQLITE_CONSTRAINT_UNIQUE` → русский error «Такой серийный/инвентарный номер уже существует» (UI-SPEC copy table), не generic.

### Pattern D3: условные поля диалога по типу
Форма рендерит общие поля всегда, пер-типовые — из `typeFields(typeKey)`; при смене типа в create-режиме пер-типовые значения сбрасываются (`key={typeKey}` на контейнере полей — чистый reset без useEffect, vercel `rerender-derived-state-no-effect`). В edit-режиме typeKey read-only (UI-SPEC). Сериализация в клиент: только `{value,label}`-пары и плоские значения строк (vercel `server-serialization`), не целые rows.

### Pattern D4: список — two-line row (D-05)
Переиспользование Pattern 1 (02-RESEARCH): `searchParams` Promise → `type` валидируется против DEVICE_TYPES (иначе «все»), page Number+clamp; `listDevices({type, page, pageSize})` возвращает `{rows,total,page,pages}`; row = Link на карточку; RU-сортировка по модели тем же `replace()`-выражением; строка запроса целиком в пагинации (`?type=laptop&page=3`).

### Pattern D5: карточка + (card) group
`app/(card)/devices/[id]/page.tsx` — id: `z.coerce.number().int().positive()` → не число/нет строки → `notFound()`; группы полей из device_schema (только заполненные пер-типовые показываем, прочерк для пустых опциональных); секции «История»/«Фото» — placeholder-строки (фаза 4). loading/error границы — в списочном сегменте; ВНУТРИ (card) loading НЕ класть (404-инвариант фазы 2 — streamed 200 до notFound).

### Pattern D6: redirect `/` → `/devices`
`app/(app)/page.tsx` (заглушка) → `redirect('/devices')`; nav-шапка получает «Устройства» рядом с «Сотрудники» (active-state по pathname). Тонкость: redirect в RSC — до рендера, без refresh()-взаимодействий.

## Vercel React Best Practices (применимое к файлам фазы; юзер-мандат)
- `server-auth-actions` — все действия уже по шаблону requireSession()-первой-строкой (T-03-01).
- `server-serialization` — в client-диалог передаём: departments/options, значения строки, typeFields-конфиг (плоский), НЕ drizzle-rows и не функции.
- `bundle-barrel-imports` / `bundle-analyzable-paths` — иконки только `import { PlusIcon } from 'lucide-react'` поимённо (не `@/components/ui` barrel, не namespace import).
- `rendering-conditional-render` — тернарники вместо `&&` для условных полей/ошибок.
- `rerender-derived-state-no-effect` — сброс пер-типовых полей при смене типа через `key={typeKey}`, не через useEffect.
- `server-no-shared-module-state` — device_schema иммутабелен (as const), модульного мутируемого состояния нет.
- `js-early-exit`, `js-length-check-first` — ранняя валидация типа до полей в action.
- Полный рулсет: `/Users/aleksey/.zcode/skills/vercel-react-best-practices/SKILL.md` (AGENTS.md — расширенная версия) — сверяться на code review.

## Don't Hand-Roll
| Задача | Не строить | Использовать |
|---|---|---|
| Наборы полей/валидация | параллельные списки полей в компонентах | device_schema (D-02) |
| Нормализация номеров | свой toUpperCase/trim | lib/normalize.mjs (гомоглифы уже там) |
| select-списки | самописный dropdown | shadcn select (a11y готов) |
| Пагинация/clamp | ad-hoc | listDevices {rows,total,page,pages} (Pattern 1) |
| Дата/цена | свой форматтер | Intl.DateTimeFormat/NumberFormat('ru-RU') на клиенте |

## Runtime State Inventory
Ни rename, ни миграции. `drizzle/` = только 0000; `db/schema.ts` devices уже содержит все колонки/индексы/CHECK. Seed (`scripts/seed.mjs`) уже насыпал 80 устройств — dev-данные есть.

## Common Pitfalls
1. **UNIQUE-коллизия как 500** — не пойманный SQLITE_CONSTRAINT_UNIQUE на normalized. Ловить → copy-таблица.
2. **Забытый normalized при edit** — update без пересчёта serialNormalized → расхождение с UNIQUE-индексом и будущим поиском (фаза 5). Пересчитывать оба поля в каждом mutation.
3. **Смена типа в edit** — запрещена UI (typeKey read-only), серверная zod-схема не принимает typeKey вовсе → тип подменить нельзя.
4. **Статус/держатель в форме** — не пропускать их через zod-whitelist даже «на всякий случай»: REG-04 (фаза 4) — единственный путь изменения.
5. **Пустая строка инвентарника** — normalized('') ≠ null: пустое поле → оба null, иначе UNIQUE на '' схлопнет второе устройство.
6. **loading.tsx в (card)** — ломает 404-инвариант (фаза 2, d0ceff8). Скелетоны — только в списочном сегменте.
7. **Пер-типовые поля чужого типа в payload** — zod-whitelist строго по typeFields(typeKey); лишние ключи отбрасывать, не валидировать.

## Success Criteria (roadmap, фаза 3)
1. Устройство любого типа создаётся; форма показывает поля типа; серийник обязателен (D-04 подсказка для периферии).
2. Редактирование всех полей; пер-типовый набор enforced; тип в edit неизменяем.
3. Список фильтруется по типу, пагинирован (20), RU-сортировка по модели; держатель/статус отображаются, но не редактируются.
