# Milestones

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
