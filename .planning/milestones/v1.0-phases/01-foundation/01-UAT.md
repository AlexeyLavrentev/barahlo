---
status: complete
phase: 01-foundation
source: [01-VERIFICATION.md]
started: 2026-09-01
updated: 2026-09-01
---

## Current Test

[testing complete]

## Tests

### 1. Деплой на сервер + cron бэкапа (README шаги 2–3, 7)
expected: контейнер работает на внутреннем сервере; cron установлен; ночной бэкап появляется и integrity_check ok
result: pass

### 2. Вход через браузер + сессия переживает перезапуск браузера
expected: `/` редиректит на `/login`; вход по логину+паролю открывает каркас; после закрытия и открытия браузера сессия жива (cookie 30 дней)
result: pass

### 3. Неверные данные + блокировка перебора + тайминг-паритет
expected: неверный пароль — generic-ошибка, счётчик неудач растёт, после лимита блокировка; неизвестный логин отвечает неотличимо по времени от неверного пароля
result: pass

### 4. Curl-матрица периметра на сервере
expected: без cookie: `/` 307, `/api/health` 307, несуществующий путь 307, `/login` 200; с валидной сессией `/` 200
result: pass

### 5. Репетиция восстановления на сервере (README шаг 8, стоп стек)
expected: по runbook README восстановление из свежего бэкапа проходит: integrity_check ok, известная запись на месте, вход работает
result: pass

### 6. Volume-персистентность на реальном сервере (SC5)
expected: `docker compose restart` / пересоздание контейнера не теряет данные (users, devices, backups на месте)
result: pass

### 7. Ревью 9 flagged-запретов (VERIFICATION.md frontmatter prohibitions)
expected: человек просматривает 9 незапряжённых запретов (7 test-tier + 2 judgment-tier) и подтверждает/отклоняет
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
