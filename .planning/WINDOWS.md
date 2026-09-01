---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 0
total_count: 2
last_updated: 2026-09-01T03:31:23.646Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | deviation | scripts/deploy.sh |  | Pattern-6 deviation: migrate step pinned to DATABASE_PATH=./data/app.db (drizzle-kit loads .env; unpinned fails on prod .env) | open |  | 2026-09-01T03:31:23.593Z |  |
| 2 | 01 | deviation | scripts/deploy.sh |  | crontab -l captured outside pipeline: exit 1 on empty crontab would trip set -o pipefail | open |  | 2026-09-01T03:31:23.646Z |  |

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
  }
]
````
