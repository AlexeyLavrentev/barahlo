---
schema_version: 1
open_count: 9
waived_count: 0
fixed_count: 0
total_count: 9
last_updated: 2026-09-17T05:24:20.905Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | deviation | scripts/deploy.sh |  | Pattern-6 deviation: migrate step pinned to DATABASE_PATH=./data/app.db (drizzle-kit loads .env; unpinned fails on prod .env) | open |  | 2026-09-01T03:31:23.593Z |  |
| 2 | 01 | deviation | scripts/deploy.sh |  | crontab -l captured outside pipeline: exit 1 on empty crontab would trip set -o pipefail | open |  | 2026-09-01T03:31:23.646Z |  |
| 3 | 01 | deviation | README.md |  | 01-05: канонический remote перенесён с корпоративного GitLab (D-15) в приватный GitHub — решение владельца 2026-09-01 | open |  | 2026-09-01T03:56:13.159Z |  |
| 4 | 01 | unrun-verify | README.md |  | 01-05 human-check: серверные шаги чек-листа «Приёмка фазы 1» (2)-(8) выполняет оператор на end-of-phase приёмке фазы | open |  | 2026-09-01T03:56:13.220Z |  |
| 5 | 02 | stub | app/(app)/employees/[id]/page.tsx | 63 | «Пока ничего не выдано» — осознанная контентная заглушка «Техники» (EMP-02 строится в Фазе 4), секция уже в макете карточки | open |  | 2026-09-01T17:55:36.171Z |  |
| 6 | 02 | deviation | app/(app)/(card)/employees/[id]/page.tsx |  | Card segment lives in route group (card): a parent segment loading.tsx streams the subtree and flushes 200 before notFound(), so /employees/{99999,abc} lost their 404; card loading skeleton intentionally omitted (conflict documented in 02-03-SUMMARY) | open |  | 2026-09-01T18:24:39.021Z |  |
| 7 | 07 | lint-warning | lib/use-search-param.ts | 124 | react-hooks/exhaustive-deps warning (flagged dep is the stable Next router — reviewed non-blocking in 07-03 gate); first recorded at plan 07-03 final gate | open |  | 2026-09-16T03:49:21.374Z |  |
| 8 | 08 | unrun-verify | lib/device-csv.ts |  | 08: ручная проверка end-of-phase (08-VALIDATION): открыть выгрузку на dev-инстансе в RU-Excel/Numbers — «Диагональ, ″» со значением 21,5 читается числом, а не датой «21.мая» (поведение локали Excel не воспроизводится vitest); запятая-десятичная ячейка запинена unit-тестами | open |  | 2026-09-16T08:33:43.243Z |  |
| 9 | 09 | unrun-verify | app/(app)/devices/clone-dialog.tsx |  | 09: ручная приёмка UAT (Manual-Only из 09-VALIDATION, компонентного раннера в репо нет — прецедент фаз 2–8): карточка → «Дублировать» → N=2 → копии «на складе»; backstop-пункты must_haves (порядок ряда, disabled-сабмит, очистка линии успеха); ядро и миграция запинены 391 автотестом + pragma-ассертом | open |  | 2026-09-17T05:24:20.905Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "01",
    "file": "scripts/deploy.sh",
    "line": null,
    "description": "Pattern-6 deviation: migrate step pinned to DATABASE_PATH=./data/app.db (drizzle-kit loads .env; unpinned fails on prod .env)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-01T03:31:23.593Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "01",
    "file": "scripts/deploy.sh",
    "line": null,
    "description": "crontab -l captured outside pipeline: exit 1 on empty crontab would trip set -o pipefail",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-01T03:31:23.646Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "01",
    "file": "README.md",
    "line": null,
    "description": "01-05: канонический remote перенесён с корпоративного GitLab (D-15) в приватный GitHub — решение владельца 2026-09-01",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-01T03:56:13.159Z",
    "resolved_at": null
  },
  {
    "id": 4,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "README.md",
    "line": null,
    "description": "01-05 human-check: серверные шаги чек-листа «Приёмка фазы 1» (2)-(8) выполняет оператор на end-of-phase приёмке фазы",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-01T03:56:13.220Z",
    "resolved_at": null
  },
  {
    "id": 5,
    "kind": "stub",
    "phase": "02",
    "file": "app/(app)/employees/[id]/page.tsx",
    "line": 63,
    "description": "«Пока ничего не выдано» — осознанная контентная заглушка «Техники» (EMP-02 строится в Фазе 4), секция уже в макете карточки",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-01T17:55:36.171Z",
    "resolved_at": null
  },
  {
    "id": 6,
    "kind": "deviation",
    "phase": "02",
    "file": "app/(app)/(card)/employees/[id]/page.tsx",
    "line": null,
    "description": "Card segment lives in route group (card): a parent segment loading.tsx streams the subtree and flushes 200 before notFound(), so /employees/{99999,abc} lost their 404; card loading skeleton intentionally omitted (conflict documented in 02-03-SUMMARY)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-01T18:24:39.021Z",
    "resolved_at": null
  },
  {
    "id": 7,
    "kind": "lint-warning",
    "phase": "07",
    "file": "lib/use-search-param.ts",
    "line": 124,
    "description": "react-hooks/exhaustive-deps warning (flagged dep is the stable Next router — reviewed non-blocking in 07-03 gate); first recorded at plan 07-03 final gate",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-16T03:49:21.374Z",
    "resolved_at": null
  },
  {
    "id": 8,
    "kind": "unrun-verify",
    "phase": "08",
    "file": "lib/device-csv.ts",
    "line": null,
    "description": "08: ручная проверка end-of-phase (08-VALIDATION): открыть выгрузку на dev-инстансе в RU-Excel/Numbers — «Диагональ, ″» со значением 21,5 читается числом, а не датой «21.мая» (поведение локали Excel не воспроизводится vitest); запятая-десятичная ячейка запинена unit-тестами",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-16T08:33:43.243Z",
    "resolved_at": null
  },
  {
    "id": 9,
    "kind": "unrun-verify",
    "phase": "09",
    "file": "app/(app)/devices/clone-dialog.tsx",
    "line": null,
    "description": "09: ручная приёмка UAT (Manual-Only из 09-VALIDATION, компонентного раннера в репо нет — прецедент фаз 2–8): карточка → «Дублировать» → N=2 → копии «на складе»; backstop-пункты must_haves (порядок ряда, disabled-сабмит, очистка линии успеха); ядро и миграция запинены 391 автотестом + pragma-ассертом",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-17T05:24:20.905Z",
    "resolved_at": null
  }
]
````
