# Milestones

## v1.2 Гигиена данных (Shipped: 2026-09-29)

**Phases completed:** 2 phases, 4 plans, 9 tasks

**Key accomplishments:**

- Дата-ядро правки истории: миграция 0002 сняла append-only в цепочке (SC5), кейстоун получил edit-схемы с обязательной датой, query-слой — replay-движок editMovement/deleteMovement с проекцией статуса в одной транзакции (D-03/D-04)
- UI-поверхность правки истории: клиентский остров таймлайна с «Исправить»/«Удалить» на каждой записи, диалоги по паттерну movement-dialogs, два Server Actions с requireSession-first и {code}→русские копии; UAT оркестратора 9/9 + backstop-фикс переноса 500-символьного комментария
- `deleteDevice` — жёсткое удаление устройства одной транзакцией (movements → attachments → devices с guardом DEVICE_GONE) + post-commit unlink фото-пар, keystone `deviceDeleteSchema` и тест-матрица из 7 ножей, включая parity-обход шести поверхностей при нулевых правках read-кода
- `deleteDeviceAction` (requireSession-first, {code}→русские копии, redirect вне try/catch) + красный `DeviceDeleteDialog` — третья инсталляция деструктивного семейства — + тихая зона `data-device-delete` на карточке вне disposed-условного + `pluralMovementRecords`; контракт прикреплён source-gates

---

## v1.1 Скорость и удобство (Shipped: 2026-09-18)

**Phases completed:** 5 phases, 7 plans, 17 tasks

**Key accomplishments:**

- URL-driven ?q= employee search through every layer with the device reconciliation moved verbatim into the shared useDebouncedSearchQuery hook; «елкин» finds «Ёлкин» via a Ё/ё-fold onto Latin E
- /employees search surface finished: «Ничего не найдено» + segment-preserving «Сбросить поиск», q-gated «Найдено: N» subtitle — and the full D-10 matrix (URL + homoglyphs + wildcards + parity + clamp + sort) locked green with zero production changes
- UAT approved: live employee search proven in the browser on both lists — keystroke races, Ё/ё and homoglyph folding, URL state with reset/clamp/back-forward; the last race defect (G-7-1 replace-loop ping-pong) found and fixed during acceptance (`10c3cee`)
- 20-колоночная CSV-ведомость: конфиг-блок своего типа (диагональ запятая-десятичная, матрица, порты, вид), текстовый статус гарантии в parity с цветом сайта через warrantyState, ISO-даты — всё через один pure-модуль lib/device-csv с деривацией меток из кейстоуна и esc-гвардом на каждой ячейке
- Клон-контур REG-06: «Дублировать» → диалог (1..100 + подсказка инвентарника) → одна транзакция N копий с наследованием закупки/конфига и NULL-серийником; единственная миграция вехи serial→nullable применена host-side раннером вместо молча падающего CLI
- Bulk-выдача/приём (MOVE-06): чекбоксы строк + tri-state «выбрать страницу», панель «Выбрано: N», диалоги партии, транзакция всё-или-ничего с in-tx превалидацией и отчётом по каждой единице
- ⌘K-палитра поверх предикатов фаз 5/7: GET /api/search (requireSession-first, 6+6, no-store) + клиентский остров на Base UI Dialog+Autocomplete (event.code-хоткей, группы, полная клавиатура, CSV-строка); оба долга D-08 закрыты с регрессионными тестами

---

## v1.0 MVP — учёт корпоративной техники (Shipped: 2026-09-14)

**Phases completed:** 6 phases, 21 plans, 19 tasks

**Key accomplishments:**

- 1. [Rule 1 - Bug] drizzle-kit migrate падал молча: 4 INSERT в одном statement-сегменте
- 1. [Rule 1 - Bug] Голый `npx drizzle-kit migrate` из Pattern 6 ломался бы на сервере с прод-.env
- 1. Канонический remote — приватный GitHub вместо корпоративного GitLab (D-15)
- 1. [Rule 3 - Blocking] shadcn init -b base требует именованный пресет (research A2 неверен для CLI 4.19.1)
- 1. [Rule 3 - Blocking] db-комментарий со словом «DELETE» ронял EMP-03 греп-гейт
- 1. [Rule 1 - Bug] Сегментный loading.tsx списка ломал 404-контракт карточки: /employees/{99999,abc} отвечали 200
- Live URL-driven device search end-to-end: «С123» typed on a Cyrillic keyboard finds the Latin serial «C123» — norm() UDF fold + 300 ms debounced island + the shared query-params module plans 02–04 import.
- Combinable filters end-to-end: the NULL-safe RAM predicate `(type=laptop) AND (ram_upgraded IS NULL OR != 1)`, type/status/department/warranty windows composing with search in ONE shared where — with the unified inclusive 60-day warranty boundary backed by a single constant.
- Warranty state colored at exactly the three D-16 render sites through ONE WarrantyDate server component and the ONE inclusive 60-day warrantyState calculation — tokens #248A3D / #FF9500 / #D70015, «без гарантии» never colored, listIssuedByEmployee widened so the employee card can color too.
- Authenticated `/api/devices/export` downloads the FULL result of the current filters through the page's exact parser and a shared factored predicate — string-built RFC-4180 CSV (UTF-8 BOM + «;» + CRLF) with a tab-prefix formula-injection guard and an RFC 5987 Cyrillic filename, zero new dependencies.
- UI-03 turned into a permanent tripwire: the full combined filter query (q + type + status + department + warranty + RAM over the joined tables) machine-proven instant at 600 rows — avg 0.757 ms over 200 timed runs under a generous 200 ms ceiling — and the dev seed scaled to 400 devices (200/80/50/70) with all four warranty states for human acceptance at real scale.
- Search-box reconciliation inverted to local-priority: clean-input-only URL adoption, push-time lastSynced stamping, and inFlight own-echo absorption — fast typing/deleting no longer loses keystrokes or rolls back (G-5-1), CR-01 behaviors preserved.
- Live RSC dashboard at «/»: 8 zero-default count tiles deep-linking phase-5 filters via buildDevicesQuery, plus a 10-row movements feed with segmented device/employee links over a 3-way join — redirect stub and its smoke needle removed in the same commit
- Блок «Гарантия» достроен из тех же операторов, что фильтры фазы 5 (счётчики-пресеты + топ-5 w60-живых с переиспользованной WarrantyDate), а инвариант D-04 превращён из обзора кода в громкие красные тесты: parity счётчик↔listDevices.total, frozen-MSK граница, zero-default и лента — плюс выделенный smoke-dashboard

---
