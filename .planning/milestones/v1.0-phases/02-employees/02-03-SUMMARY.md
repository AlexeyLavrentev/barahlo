---
phase: 02
plan: 03
subsystem: employees-ux-completion
tags: [combobox, base-ui, streaming, route-groups, error-boundary, skeleton, empty-states, russian-ui, apple-design]
requires:
  - "02-01: дизайн-система, components/ui/combobox, db/queries/employees (listDepartments/resolveDepartmentId), EmployeeDialog"
  - "02-02: карточка /employees/[id], edit-режим диалога, smoke-матрица 404/бейдж"
provides:
  - "Combobox отдела с инлайн-созданием (D-03): фильтрация по вводу (Ё/case-fold), акцентная галочка точного совпадения, закреплённый первый пункт «Создать „{ввод}“» (Enter/клик), hidden departmentName — создание делает серверный resolveDepartmentId"
  - "Сегмент «Активные/Архив» по UI-SPEC: белая пилюля активного состояния, дословные пустые состояния, пагинация через buildQuery (фильтр не теряется, сброс страницы)"
  - "loading.tsx списка (5 скелет-строк, motion-safe:animate-pulse) + error.tsx ×2 с пропом retry этой версии Next"
  - "Карточный сегмент в группе (card): знание о конфликте «сегментный loading.tsx стримит поддерево → неFound теряет 404» и структурное решение"
  - "Нормализованный app/login по контракту (веса 400/600, шкала 4px, акцентный фокус и primary-кнопка, копи не тронуто)"
affects: ["phases 3-6 (паттерн: loading-граница только на листовых маршрутах без notFound-детей)", "Фаза 5 (поиск — отдельно, D-05 не задет)"]
tech-stack:
  added: []
  patterns:
    - "Combobox-выбор записывает ТОЛЬКО имя в hidden input: серверный race-safe resolve — единственный создатель отделов (UI без состояния «уже существует»)"
    - "Next 16 streaming: сегментный loading.tsx оборачивает поддерево ВМЕСТЕ с дочерними сегментами и флешит 200 до notFound() — notFound-маршруты держат вне stream-поддерева через route groups"
    - "error.tsx этой версии Next: props { error, retry }, onClick={() => retry()}; детали только в console (V7)"
    - "Клиентская сортировка опций ruCollator + Ё-fold фильтр; byte-exact сравнение для пункта создания (зеркало departments_name_uq)"
key-files:
  created:
    - "app/(app)/employees/loading.tsx"
    - "app/(app)/employees/error.tsx"
    - "app/(app)/(card)/employees/[id]/error.tsx"
  modified:
    - "app/(app)/employees/employee-dialog.tsx"
    - "app/(app)/employees/page.tsx"
    - "app/(app)/(card)/employees/[id]/page.tsx (перемещён из app/(app)/employees/[id]/, импорты на @/app-алиас)"
    - components/ui/combobox.tsx
    - app/login/page.tsx
    - app/login/login-form.tsx
decisions:
  - "Карточный сегмент вынесен в route group (card): сегментный loading.tsx списка стримит поддерево с дочерним [id] и флешит 200 до notFound() — /employees/{99999,abc} отвечали 200; группа возвращает 404, список сохраняет скелетон"
  - "app/(app)/employees/[id]/loading.tsx сознательно НЕ создаётся: любая loading-граница на пути карточки в этой версии Next ломает статус 404 (проверено биcектом) — конфликт UI-SPEC loading vs T-02-07 решён в пользу статуса"
  - "Combobox-примитив расширен inputClassName (h-10/16px триггер по контракту) и duration-150 — прецедент ретаргета сгенерированных компонентов из 02-01"
  - "Точный байт-срез для «Создать „X“» (не case-fold): UI не обещает слияние, которого departments_name_uq не сделает"
metrics:
  duration: "14 min"
  completed: 2026-09-01
  tasks: 3
  files: 6
status: complete
---

# Phase 02 Plan 03: Combobox отдела, сегмент/пустые состояния, границы и нормализация входа Summary

Финальный слой контракта фазы: отдел в диалоге — combobox с фильтрацией, галочкой и закреплённым «Создать „X“» (создание по-прежнему делает сервер транзакционно и гонко-безопасно), список получил сегмент с белой пилюлей, дословные пустые состояния и не-теряющий фильтр buildQuery, маршруты — скелетон/ошибочные границы с retry, экран входа нормализован к дизайн-контракту без изменения копи; попутно найден и устранён конфликт стриминга и 404 (карточная группа (card)).

## What Was Built

- **Задача 1 (авто, коммит 3b586d3):** `employee-dialog.tsx` — поле «Отдел» заменено с текстового Input на композицию нативного Base UI combobox (выбор 02-01 подтверждён, фолбэк popover+command не понадобился): триггер-InputGroup стилизован под input h-10/16px с placeholder «Выберите или введите отдел»; опции из нового пропа `departments` ({id, name} из listDepartments()) сортируются на клиенте ruCollator, фильтруются по мере ввода с Ё/case-fold, пустой ввод показывает полный список; точное совпадение отмечено акцентной галочкой примитива (ItemIndicator, акцент — третий разрешённый случай UI-SPEC); ввод без точного совпадения закрепляет ПЕРВЫЙ пункт «Создать „{ввод}“» — autoHighlight даёт Enter, клик работает тоже; выбор записывает имя в hidden `departmentName` (hidden зеркалит текст триггера — «что видно, то и уходит на сервер»), фактическое создание — существующий серверный resolveDepartmentId в транзакции, проигранная UNIQUE-гонка молча переиспользует отдел. Обе страницы — список и карточка — вызывают listDepartments() и передают массив в остров. A11y целиком из примитива (своего фокус-менеджмента нет). Мелочи контракта: `maxLength` 100/80 на полях (ранняя защита от заведомо невалидного ввода), переоткрытие диалога сбрасывает combobox на текущие значения, muted-подсказка «Начните вводить название отдела» для вырожденного случая «нет отделов И пустой ввод» (никогда не мёртвый dropdown).
- **Задача 2 (авто, коммит 804c1ce):** `app/(app)/employees/page.tsx` — сегмент-контрол приведён к UI-SPEC Visual Details (контейнер rounded-lg bg-black/5 p-1, активный пункт — белая пилюля bg-white rounded-lg shadow-sm, НЕ акцент; переход 150ms ease-out, reduced-motion гасится глобальными правилами), пустые состояния дословно из копи-таблицы («Пока нет сотрудников» + «Добавьте первого сотрудника — понадобится имя и отдел.» с видимым CTA; «Архив пуст» + «Уволенные сотрудники появятся здесь.»), список и пагинация рендерятся только при наличии строк; все ссылки идут через buildQuery из 02-01 — фильтр сбрасывает page=1, «Назад/Далее» сохраняют фильтр (Pitfall 3 закрыт structurally), тихие границы opacity-40 без href, «Страница N из M».
- **Задача 3 (авто, коммит d0ceff8):** `loading.tsx` списка — белая карточка с пятью скелет-строками h-11 bg-black/5 rounded-lg, animate-pulse ограничен motion-safe (reduced-motion — статичный скелет), оболочка идентична заполненному списку (без сдвига раскладки). `error.tsx` ×2 (список и карточка) — 'use client', props { error, retry } этой версии Next (до-16-е имя `reset` нигде не используется), console.error в эффекте, наружу только «Не удалось загрузить список» + вторичная кнопка «Попробовать снова» с onClick={() => retry()} (T-02-09). Логин нормализован к контракту без изменения копи: лейблы 14/400 на токенах, инпуты 16px с фокусом ring-2 ring-accent/30 + border-accent (вместо чёрного фокуса фазы 1), primary-кнопка bg-accent/hover #0077ED/active:scale-[0.97], полушаги mt-1.5/py-2.5 → mt-2/py-2, neutral-* классы заменены на токены, ошибка #D70015. Финальный дизайн-гейт по app/: 0 font-medium, 0 полушагов, 0 англо-лейблов.
- **Отклонение-фикс внутри Задачи 3 (см. ниже):** карточный сегмент перемещён в route group (card).

## TDD Gate Compliance

План не помечен type: tdd; носители приёмки — греп-гейты, build, vitest (65/65) и smoke-скрипт (E2E на прод-сборке), все зелёные. Коммитов test(02-03)/feat-RED не требуется.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Сегментный loading.tsx списка ломал 404-контракт карточки: /employees/{99999,abc} отвечали 200**
- **Found during:** Task 3 (первый прогон smoke после добавления границ)
- **Issue:** В этой версии Next сегментный loading.tsx создаёт Suspense-оболочку вокруг ПОДДЕРЕВА сегмента — включая дочерние сегменты. Рендер /employees/99999 флешит оболочку (app-лейаут + скелетон) со статусом 200 раньше, чем notFound() страницы карточки получает шанс установить 404. Бисект подтвердил: виноват именно родительский `app/(app)/employees/loading.tsx` (не [id]-файлы — они тоже дают эффект, проверено отдельно).
- **Fix:** Карточный сегмент перемещён в собственную route group: `app/(app)/(card)/employees/[id]/{page,error}.tsx` (URL не изменился — /employees/[id]; импорты островов/действий переведены на @/app-алиас). У списочной ветки loading-граница осталась; карточная ветка не имеет стримящего предка и снова отвечает 404 (probe + smoke зелёные). `app/(app)/employees/[id]/loading.tsx` сознательно НЕ создаётся — любая loading-граница на пути карточки воспроизводит баг; конфликт UI-SPEC «loading: list + card» vs инвариант T-02-07/404-матрицы smoke решён в пользу статуса (скелетон карточки — косметика на локальном SQLite, 404-матрица — безпасностный инвариант фазы). Критерий плана «оба loading.tsx» скорректирован соответственно.
- **Files modified:** app/(app)/(card)/employees/[id]/page.tsx (rename), app/(app)/(card)/employees/[id]/error.tsx, app/(app)/employees/loading.tsx
- **Commit:** d0ceff8

**2. [Rule 2 - Contract] Сгенерированный combobox-примитив доведён до визуального контракта**
- **Found during:** Task 1
- **Issue:** Обёртка ComboboxInput не позволяла задать классы внутреннему input (триггер должен быть h-10/16px по UI-SPEC), попап анимировался 100ms вместо контрактных 150ms.
- **Fix:** добавлен проп inputClassName (тредится в InputGroupInput), duration-100 → duration-150. Прецедент — ретаргет button/dialog/label в 02-01.
- **Files modified:** components/ui/combobox.tsx
- **Commit:** 3b586d3

**3. [Rule 2 - Hardening] maxLength 100/80 на полях диалога + сброс combobox при переоткрытии + подсказка пустого списка**
- **Found during:** Task 1
- **Issue:** Вставка >80/100 символов раньше доходила до серверного zod и возвращала не относящуюся к делу ошибку «Выберите отдел»; переоткрытие диалога после «Не сохранять» показывало протухший ввод; при нуле отделов и пустом вводе dropdown был пуст.
- **Fix:** maxLength-атрибуты (серверная валидация не менялась), setInputValue при onOpenChange(true), muted-подсказка «Начните вводить название отдела».
- **Files modified:** app/(app)/employees/employee-dialog.tsx
- **Commit:** 3b586d3

### Осознанные решения (не отклонения)
- Точное сравнение для закрепления «Создать „X“» — байт-в-байт (не case-fold), ровно как departments_name_uq и resolveDepartmentId: UI не предлагает «слить» «Бухгалтерия» и «бухгалтерия», которых схема считает разными отделами. Фильтрация списка опций при этом Ё/case-fold-нечувствительна (поиск, не создание).
- human-check (end-of-phase UAT) — визуальная сверка 9 covered-состояний + backstop long-text с UI-SPEC и apple-design — вне автономного контура, передаётся на приёмку фазы.

## Verification Results

- `npm run build` → зелёный; маршруты ƒ /employees и ƒ /employees/[id] зарегистрированы как прежде
- `npx vitest run` → **65/65 зелёные**
- `node scripts/smoke-employees.mjs` → exit 0: 307 → /login; 200 + зонд; карточка 200 + «Пока ничего не выдано»; **404 на 99999/abc (восстановлен после стриминг-регрессии)**; бейдж/«Разархивировать» цикл по is_active
- Гейты Задачи 1: «Создать „«, ruCollator в диалоге, listDepartments в обеих страницах — зелёные
- Гейты Задачи 2: пустые состояния дословно, buildQuery во всех ссылках (4 href), белая пилюля — зелёные
- Гейты Задачи 3: retry + «Не удалось загрузить список» в обеих error-границах, `reset(` = 0, 5 скелет-строк в loading списка, font-medium = 0, полушаги = 0, англо-лейблы = 0 — зелёные
- Probe-скрипт (временный, удалён): подтверждает 404/404 на /employees/{99999,abc} и 200-оболочку при наличии родительского loading.tsx (корень отклонения №1)

## Known Stubs

Нет новых. Унаследованная контентная заглушка «Пока ничего не выдано» (карточка, Фаза 4) задокументирована в 02-02.

## Authentication Gates

Не встречались.

## Deferred Issues

- Скелетон загрузки для карточки /employees/[id] отсутствует по контракту-конфликту (отклонение №1): если когда-либо понадобится — сначала нужен механизм «не стримить маршрут с notFound» (или перенос существования id в прокси/выше boundary), не костыль.
- Подсказка «Начните вводить название отдела» — небольшое добавление копи вне таблицы UI-SPEC (вырожденный случай пустого справочника + пустого ввода); на UAT сверить, что не режет глаз.

## Self-Check: PASSED

- Файлы: app/(app)/employees/{loading,error}.tsx, app/(app)/(card)/employees/[id]/{page,error}.tsx, app/(app)/employees/employee-dialog.tsx, app/(app)/employees/page.tsx, components/ui/combobox.tsx, app/login/{page,login-form}.tsx — FOUND
- Коммиты: 3b586d3, 804c1ce, d0ceff8 — FOUND в git log

> **Note (WR-03, code-review fix 2026-09-01):** `components.json` остаётся `"style": "base-nova"` (+ `menuColor`/`menuAccent`) — сознательно принятое отклонение от UI-SPEC `preset: none`. Пресет-фри стиль `"base"` в реестре shadcn v4 НЕ существует: `https://ui.shadcn.com/r/styles/base/badge.json` отвечает 404, резолвятся только имена `{base}-{preset}` (проверено `add badge --dry-run` в обе стороны), поэтому нормализация сломала бы все будущие `shadcn add` в фазах 3–6. Контракт при этом соблюдён на уровне токенов: UI-SPEC-палитра/радиусы/шрифты диктуются `app/globals.css` (`@theme`), а nova-флейвор в сгенерированных файлах фазы 02 перекрыт вручную. Правило для будущих `shadcn add`: после генерации сверять компонент с globals.css и UI-SPEC (веса 400/600, полушаги запрещены, акцент только в трёх зарезервированных местах).

