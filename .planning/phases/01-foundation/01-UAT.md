---
status: testing
phase: 01-foundation
source: [01-VERIFICATION.md]
started: 2026-09-01
updated: 2026-09-01
---

## Current Test

number: 1
name: Деплой на внутренний сервер + cron бэкапа (README «Приёмка фазы 1» шаги 2–3, 7)
expected: |
  deploy.sh на сервере: git pull → npm ci → migrate → контейнер поднят; строка cron `0 2 * * *` установлена; утром следующего дня в data/backups/<дата>/ лежит валидная копия (integrity ok).
awaiting: user response

## Tests

### 1. Деплой на сервер + cron бэкапа (README шаги 2–3, 7)
expected: контейнер работает на внутреннем сервере; cron установлен; ночной бэкап появляется и integrity_check ok
result: [pending]

### 2. Вход через браузер + сессия переживает перезапуск браузера
expected: `/` редиректит на `/login`; вход по логину+паролю открывает каркас; после закрытия и открытия браузера сессия жива (cookie 30 дней)
result: [pending]

### 3. Неверные данные + блокировка перебора + тайминг-паритет
expected: неверный пароль — generic-ошибка, счётчик неудач растёт, после лимита блокировка; неизвестный логин отвечает неотличимо по времени от неверного пароля
result: [pending]

### 4. Curl-матрица периметра на сервере
expected: без cookie: `/` 307, `/api/health` 307, несуществующий путь 307, `/login` 200; с валидной сессией `/` 200
result: [pending]

### 5. Репетиция восстановления на сервере (README шаг 8, стоп стек)
expected: по runbook README восстановление из свежего бэкапа проходит: integrity_check ok, известная запись на месте, вход работает
result: [pending]

### 6. Volume-персистентность на реальном сервере (SC5)
expected: `docker compose restart` / пересоздание контейнера не теряет данные (users, devices, backups на месте)
result: [pending]

### 7. Ревью 9 flagged-запретов (VERIFICATION.md frontmatter prohibitions)
expected: человек просматривает 9 незапряжённых запретов (7 test-tier + 2 judgment-tier) и подтверждает/отклоняет
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
