# Phase 3 Pattern Map: Device Registry

**Phase:** 03-device-registry
**Mapped:** 2026-09-02 (orchestrator-inline; MCP spawn outage)
**Analogs:** 16/16 файлов имеют аналоги в кодовой базе (фаза 2) — первая не-greenfield фаза.

## File Classification → Analog Assignments

| File (NEW unless noted) | Role | Analog | Excerpt Source |
|---|---|---|---|
| `lib/device-schema.ts` | keystone: типы+поля+zod | `lib/normalize.ts` (типизированный чистый модуль) + UI-SPEC per-type field table (канон содержания) | 03-RESEARCH Pattern D1 |
| `db/queries/devices.ts` | data layer | `db/queries/employees.ts` (пагинация/clamp/RU-sort/join) | 02-RESEARCH Patterns 1, 4; RESEARCH D2 (UNIQUE catch) |
| `app/(app)/devices/page.tsx` | RSC list | `app/(app)/employees/page.tsx` (searchParams Promise, guard-first, сегмент→dropdown) | 02-RESEARCH Pattern 1 |
| `app/(app)/devices/actions.ts` | mutations | `app/(app)/employees/actions.ts` (requireSession→zod→queries→refresh, поле-error map) | 02-RESEARCH Pattern 2 |
| `app/(app)/devices/device-dialog.tsx` | client island | `app/(app)/employees/employee-dialog.tsx` (useActionState, per-open state из WR-01 фикса, combobox-уроки: items+Collection) | диалог + 02-03-SUMMARY deviations |
| `app/(app)/(card)/devices/[id]/page.tsx` | card RSC | `app/(app)/(card)/employees/[id]/page.tsx` (id zod→notFound, groups) | 02-02-SUMMARY |
| `app/(app)/devices/loading.tsx` | skeleton | `app/(app)/employees/loading.tsx` (h-[60px] rows per UI-SPEC) | 02-03 |
| `app/(app)/devices/error.tsx` | boundary | `app/(app)/employees/error.tsx` (`retry` prop!) | 02-03 |
| `app/layout.tsx` (MOD) | nav | существующий header (добавить «Устройства») | фаза 2 shell |
| `app/(app)/page.tsx` (MOD) | redirect | — (заглушка → `redirect('/devices')`) | 03-RESEARCH D6 |
| `tests/devices-queries.test.ts` | tests | `tests/employees-queries.test.ts` (temp-SQLite helper) | tests/helpers.ts |
| `tests/device-schema.test.ts` | tests | `tests/normalize.test.ts` (чистый модуль) | — |

## Shared Patterns (verbatim from phase 2 code)
1. Guard-first RSC: `const session = await requireSession()` первой строкой страницы/действия.
2. Action shape: `'use server'` + module-top zod + `safeParse` + `(_prev, formData)` + русский generic-error + `refresh()`.
3. Запись normalized: `serialNormalized = normalizeSerial(serial)` ВСЕГДА в insert/update (Pitfall 2).
4. UNIQUE catch: `SQLITE_CONSTRAINT_UNIQUE` → русский copy из UI-SPEC (Питфолл 1).
5. Тесты: temp-db через `tests/helpers.ts` createTempDb/applyMigrations; sync drizzle только.
6. Стили: токены из `globals.css` @theme; иконки поимённо из lucide-react (vercel `bundle-barrel-imports`).

## No-Analog Files
Нет — все 12 позиций покрыты. Новый паттерн ровно один: **условные поля формы из device_schema** (03-RESEARCH D1/D3) — реализация через `key={typeKey}` reset, без useEffect (vercel `rerender-derived-state-no-effect`).

## Structural Cautions
- Паттерн фазы 2 «page-pattern reserved» перекрыт locked D-06 (диалог) — приоритет CONTEXT.
- `components/ui/select.tsx` — проверить наличие; нет → `npx shadcn@latest add select` (официальный реестр, санкция фазы 2).
- НЕ класть loading.tsx в (card) — 404-инвариант (d0ceff8).
