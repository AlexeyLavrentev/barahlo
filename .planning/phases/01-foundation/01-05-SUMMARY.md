---
phase: 01-foundation
plan: 05
subsystem: foundation
tags: [backup, restore-rehearsal, acceptance, git-remote, push, deploy-checklist]
requires:
  - "01-02 (периметр: curl-матрица в README — переиспользована в шаге (6) чек-листа)"
  - "01-03 (runbook «Бэкапы и восстановление» — исполнен в репетиции задачи 1)"
  - "01-04 (deploy.sh и раздел «Деплой на сервер» — на них ссылается чек-лист приёмки)"
provides:
  - "Исполненная и задокументированная локальная репетиция восстановления: снимок → замена тома → поднятая стопка → integrity ok → данные на месте → переживание down+up (успех-критерии 4 и 5 локально, отметка в README с датой 2026-09-01)"
  - "README-раздел «Приёмка фазы 1» — финальный 9-шаговый чек-лист: push, серверный деплой, учётка на сервере, вход из браузера, curl-матрица, cron, серверная репетиция восстановления, отметки в README"
  - "Канонический remote origin (приватный GitHub) — код и .planning/ запушены, ветка main отслеживает origin/main (D-15 в редакции владельца)"
affects: ["end-of-phase верификация фазы 01 (серверные шаги 2–8 чек-листа закрывает оператор)", "фазы 2–6 (обновление сервера через origin + deploy.sh)"]
tech-stack:
  added: []
  patterns:
    - "Приёмка фазы — проверяемый чек-лист в README с отметками по ходу выполнения; автоматизированная половина исполняется планом, серверная — оператором на end-of-phase"
key-files:
  created: []
  modified:
    - README.md
key-decisions:
  - "Канонический remote перенесён с корпоративного GitLab (D-15) в приватный GitHub-репозиторий https://github.com/AlexeyLavrentev/barahlo.git — инфраструктурное решение владельца от 2026-09-01; приватность сохранена (приватный репозиторий, ничего из рабочих материалов не публикуется), README синхронизирован с реальностью тем же коммитом (T-05-03)"
  - "Шаги (2)–(8) чек-листа приёмки делегированы оператору на end-of-phase верификацию (human_verify_mode фазы) — у исполнителя нет SSH-доступа к серверу (D-08); шаг (1) push и локальная репетиция закрыты исполнением плана"
patterns-established: []
requirements-completed: [ACC-02, ACC-03]
coverage:
  - id: D1
    description: "Локальная репетиция восстановления исполнена и отмечена в README (дата 2026-09-01, шаги 1–9: снимок → замена тома → поднятая стопка → integrity ok → контрольные данные на месте → переживание down+up)"
    requirement: ACC-03
    verification:
      - kind: integration
        ref: "README.md#Репетиция восстановления — выполнена + node -e integrity_check против ./data/app.db → ok"
        status: pass
    human_judgment: false
  - id: D2
    description: "README-раздел «Приёмка фазы 1»: 9-шаговый серверный чек-лист (деплой, учётка, браузерный вход, curl-матрица, cron, серверная репетиция восстановления)"
    requirement: ACC-02
    verification:
      - kind: other
        ref: "grep -c \"Приёмка фазы 1\" README.md → 1"
        status: pass
    human_judgment: true
    rationale: "Серверные шаги (2)–(8) по плану выполняет оператор на end-of-phase приёмке (human_verify_mode: end-of-phase) — автоматизация невозможна без SSH-доступа; чек-лист лишь фиксирует процедуру"
  - id: D3
    description: "Код и .planning/ запушены в канонический remote: git push -u origin main, ветка main отслеживает origin/main (приватный GitHub)"
    requirement: ACC-02
    verification:
      - kind: integration
        ref: "git ls-remote --heads origin main → d5a2bad131a55b0277181e252f65671c2d5d7f53"
        status: pass
    human_judgment: false
duration: 14min
completed: 2026-09-01
status: complete
---

# Phase 01 Plan 05: Репетиция восстановления + приёмка фазы Summary

Восстановление из бэкапа отрепетировано локально end-to-end (снимок → замена тома → целая база → данные на месте → переживание рестарта) с отметкой в README, финальный 9-шаговый чек-лист «Приёмка фазы 1» добавлен в README, код и `.planning/` запушены в приватный GitHub-репозиторий как канонический remote.

## Performance

- **Duration:** 14 min (продолжение-сессия задачи 2; задача 1 закрыта предыдущей сессией)
- **Started:** 2026-09-01T03:52:22Z
- **Completed:** 2026-09-01T04:06:30Z
- **Tasks:** 2 of 2 (задача 1 — коммит `56504c8` предыдущей сессии, задача 2 — эта сессия)
- **Files modified:** 1 (README.md)

## Accomplishments

- Задача 1 (предыдущая сессия): локальная репетиция восстановления выполнена строго по README-процедуре — контрольная запись в devices до снимка, `scripts/backup.mjs` → `./data/backups/2026-09-01/`, `docker compose down`, замена тома копией, `up -d`, `/login` 200 при периметре целым (`/` → 307), integrity `ok`, учётка и контрольная запись на месте, переживание `down`+`up -d` (успех-критерии 4 и 5 локально). Отметка с датой в README.
- Задача 2: README-раздел «Приёмка фазы 1» — нумерованный чек-лист: (1) push в origin — выполнено; (2) сервер: клон из origin, `.env` + `AUTH_SECRET`, права `1000:1000` на `data/`; (3) `bash scripts/deploy.sh` (первый прогон ставит cron); (4) учётка через `create-admin.mjs` в контейнере; (5) браузер рабочей станции → редирект на `/login` → вход → каркас, сессия переживает перезапуск браузера; (6) curl-матрица периметра с сервера (`/` 307, `/api/health` 307, `/login` 200); (7) одна cron-строка с `scripts/backup.mjs`, утром — вчерашний бэкап; (8) серверная репетиция восстановления с остановленной стопкой — хотя бы раз в первый месяц; (9) отметки в README. Периметр чек-листом не ослабляется.
- Push: `git push -u origin main` — remote fast-forward `56504c8..d5a2bad`, upstream-трекинг установлен; `git ls-remote --heads origin main` видит `d5a2bad`.

## Task Commits

1. **Task 1: Локальная репетиция восстановления из бэкапа** - `56504c8` (docs) — предыдущая сессия
2. **Task 2: Push в канонический remote + чек-лист приёмки фазы в README** - `d5a2bad` (docs)

**Plan metadata:** отдельный docs-коммит (SUMMARY + STATE + ROADMAP) — см. ниже.

## Files Created/Modified

- `README.md` - раздел «Приёмка фазы 1» (9 шагов); строки канонического remote приведены к реальности (приватный GitHub вместо GitLab: требование в «Требованиях к серверу» и `git clone` в «Первом деплое»)

## Decisions Made

- **GitLab → приватный GitHub (отклонение от D-15, решение владельца 2026-09-01):** план и D-15 называли каноническим remote корпоративный GitLab; владелец настроил `origin` → `https://github.com/AlexeyLavrentev/barahlo.git` (приватный). Интенция D-15 сохранена: репозиторий приватный, код и `.planning/` остаются в частной зоне, публичных зеркал нет. README синхронизирован с реальностью в том же коммите, что и чек-лист (T-05-03: процедура и реальность обязаны совпадать).
- Серверные шаги приёмки осознанно оставлены оператору (end-of-phase): у исполнителя нет SSH-доступа (D-08); чек-лист делает ручную часть проверяемой и фиксируемой отметками в README.

## Deviations from Plan

### User-directed infrastructure change (задача 2)

**1. Канонический remote — приватный GitHub вместо корпоративного GitLab (D-15)**
- **Found during:** Task 2 (precondition задачи 2 — URL remote'а)
- **Issue:** план предписывал `git remote add origin <GitLab URL>`; владелец самостоятельно настроил `origin` на приватный GitHub-репозиторий и подтвердил его как канонический.
- **Fix:** push выполнен в существующий `origin` (без смены ремоутов исполнителем); две строки README, называвшие GitLab, приведены к реальности; отклонение зафиксировано здесь и в decisions.
- **Files modified:** README.md
- **Verification:** `git remote get-url origin` → GitHub URL; `git ls-remote --heads origin main` → `d5a2bad`
- **Committed in:** d5a2bad

**Total deviations:** 1 (user-directed infra decision, не auto-fix; Rules 1–3 не применялись)
**Impact on plan:** содержимое и критерии плана не менялись — сменился только провайдер приватного remote'а.

## Issues Encountered

- Push и авторизация прошли без ошибок (учётные данные уже были у владельца) — auth-гейтов не встречалось.

## User Setup Required

Выполнено владельцем до этой сессии: `origin` → приватный GitHub-репозиторий (user_setup «corporate GitLab» закрыт эквивалентным решением). Остаток — серверные шаги чек-листа «Приёмка фазы 1» (2)–(8), закрываются оператором на end-of-phase приёмке.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: trust_boundary_relocated | README.md | Граница T-05-01/T-05-02 «рабочая станция → GitLab» фактически завершается в приватном GitHub-репозитории; интенция митигаций сохранена (приватность, `.env`/`data/` в `.gitignore`/`.dockerignore`, `.planning/` не попадает в публичные зеркала), провайдер изменён решением владельца |

## Known Stubs

Нет. Новых исходников нет — план исполнял и фиксировал. Незакрытые чекбоксы (2)–(8) в «Приёмке фазы 1» — не заглушки, а спроектированная ручная часть приёмки (end-of-phase).

## Next Phase Readiness

- Фаза 01 закрыта по всем 5 планам; локальные критерии 4 и 5 доказаны, серверная половина расписана чек-листом.
- Для end-of-phase приёмки оператору: пройти шаги (2)–(8) раздела «Приёмка фазы 1» на внутреннем сервере, отметить в README.
- `.planning/config.json` (modified) и незафиксированные артефакты планировщика (`.planning/phases/01-foundation/01-PATTERNS.md`, `.planning/research/.cache/*`) — как и в 01-01/01-03/01-04, вне скоупа плана, остаются оркестратору фазы.

---
*Phase: 01-foundation*
*Completed: 2026-09-01*
