---
phase: 02-employees
verified: 2026-09-01T19:07:02Z
status: passed
score: 12/14 must-haves verified
behavior_unverified: 2
overrides_applied: 2
overrides:

  - must_have: "Загрузка списка и карточки показывает 5 скелет-строк h-11 bg-black/5 rounded-lg в белой карточке — без сдвига раскладки (UI-SPEC loading)"
    reason: "Карточный скелетон сознательно не создаётся: в этой версии Next любая loading-граница на пути /employees/[id] стримит поддерево и флешит 200 до notFound() — ломается 404-матрица (инвариант безопасности V4/V5). Конфликт разрешён в пользу статуса; скелетон списка сохранён, карточка вынесена в route group (card). Задокументировано в 02-03-SUMMARY.md Deviation #1, бисект подтверждён, коммит d0ceff8; smoke 404/404 на 99999/abc — зелёный"
    accepted_by: "developer (documented deviation, 02-03-SUMMARY.md + orchestrator execution context)"
    accepted_at: "2026-09-01T23:54:00+05:00"

  - must_have: "components.json + components/ui — shadcn, Base UI, пресет none (UI-SPEC preset: none)"
    reason: "Preset-фри стиль base в реестре shadcn CLI v4.19.1 НЕ существует: styles/base/badge.json → 404, резолвятся только {base}-{preset} (проверено add --dry-run в обе стороны). Оставлен base-nova; контракт соблюдён на уровне токенов — палитра/радиусы/шрифты диктуются app/globals.css (@theme), nova-флейвор в сгенерированных файлах фазы перекрыт вручную (font-medium=0, полушаги=0, prefers-color-scheme=0 — греп-гейты зелёные). Review option (a): отклонение записано в 02-03-SUMMARY.md Note, коммит 8fea0cc"
    accepted_by: "developer (02-REVIEW-FIX.md WR-03, option a — accepted after registry verification)"
    accepted_at: "2026-09-01T18:53:51Z"
re_verification: null
deferred:

  - truth: "Карточка показывает список выданной техники (секция «Техника» сейчас с «Пока ничего не выдано»)"
    addressed_in: "Phase 4"
    evidence: "REQUIREMENTS.md: EMP-02 → Phase 4; ROADMAP Phase 4 SC2: «карточка сотрудника (список выданной техники) обновляются мгновенно»; ROADMAP Phase 2 plans note: «сам список выданной техники оживёт в Фазе 4»"
behavior_unverified_items:

  - truth: "SC1: пользователь добавляет сотрудника (имя + отдел) и исправляет данные через диалог — изменение видно в списке/карточке без ручной перезагрузки (в т.ч. combobox «Создать „X“»)"
    test: "В браузере: «Добавить сотрудника» → ввести имя, в отделе набрать новый отдел → Enter на «Создать „X“» → сохранение; затем «Редактировать» на карточке → поменять имя/отдел → «Сохранить изменения»"
    expected: "Диалог закрывается, новый сотрудник виден в списке (счётчик N обновлён), карточка отражает правки — всё без F5; отдел создан и доступен в combobox"
    why_human: "Smoke-зонд создаётся прямой DB-вставкой — клиентский раундтрип useActionState → Server Action → refresh() → пере-рендер ни одним автотестом не проведён; нужен живой браузер"

  - truth: "SC4: интерфейс выдержан в Apple-эстетике (воздух, типографика, пресс-фидбек, дисциплина акцента) — паттерны для фаз 3–6"
    test: "Визуальная сверка 9 covered-состояний UI-SPEC (список/карточка/диалоги/сегмент/пустые/скелетон/вход) + skill apple-design"
    expected: "Чистота, типографика 400/600, воздух, акцент только на CTA/фокусе/галочке combobox, белая пилюля сегмента"
    why_human: "Субъективное визуальное свойство — план помечает его [backstop/manual UAT]; автогрепы доказывают контракт (токены/веса/полушаги), но не качество"
human_verification:

  - test: "Браузерный проход SC1: создать сотрудника через диалог (новый отдел через «Создать „X“»), найти в списке, отредактировать имя и отдел, проверить обновление без перезагрузки"
    expected: "Сотрудник появляется в списке сразу после сохранения; правки видны на карточке и в списке; отдел из ввода создан и переиспользуется"
    why_human: "Интерактивный клиентский раундтрип (диалог → Server Action → refresh) автотестами не покрыт; smoke проверяет только серверный рендер из прямой DB-вставки"

  - test: "UAT Apple-эстетики: сверить глазами 9 covered-состояний UI-SPEC на всех экранах фазы (вход, список, карточка, диалоги) с гайдами skill apple-design"
    expected: "Единый визуальный язык: системный шрифт, вес 400/600, воздух, hairline-карточки, пресс-фидбек, акцент-дисциплина"
    why_human: "Субъективное качество; план объявил его ручным backstop-тестом фазы"

  - test: "Backstop длинного текста: имя 100 символов + отдел 80 символов в строке списка и в диалоге"
    expected: "Обрезка с многоточием, высота строки 44px не меняется, max-w-md диалога не ломается; полные данные видны на карточке и в title-атрибуте"
    why_human: "Визуальный held-out тест из UI Considerations UI-SPEC; grep доказывает truncate/title, но не поведение при реальных 100+80 символах"

  - test: "WR-01 (код-ревью): открыть диалог, спровоцировать ошибку (например, очистить имя и сохранить), закрыть и переоткрыть диалог"
    expected: "При переоткрытии старая ошибка/role=alert не показывается — поля чистые под текущие значения (сброс состояния на каждую сессию диалога)"
    why_human: "Семантика state-reset проверена структурно (перенос useActionState внутрь портала, 294878c) + build/tests; интерактивное упражнение диалога требует браузера — явно помечено REVIEW-FIX как требующее human verification"
prohibitions: # ADR-550 D4: test-tier без выделенного теста → unverified+flagged (fail-closed); вердикты LLM — неавторитетные
  unverified_flagged_count: 9
  human_review_recommended: true
  items:

    - statement: "02-01 P1: Нигде нет удаления сотрудника — ни кнопки, ни удаляющего запроса, только архив (EMP-03, D-02)"
      tier: test
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — grep -rniE '\\bdelete\\b' по db/queries/, app/(app)/employees/, app/(app)/(card)/ = 0; тест 'exposes no delete/remove capability at module level' зелёный; единственный off-list путь — setEmployeeArchived (isActive flip)"
      enforcement: "модульный тест employees-queries (косвенный), выделенного негативного e2e-теста нет"

    - statement: "02-01 P2: Никаких drizzle-kit push; в фазе нет миграций"
      tier: test
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — package.json не содержит push; git log d9323df..HEAD по db/schema.ts и drizzle/ пуст"
      enforcement: "нет выделенного теста"

    - statement: "02-01 P3: Никакой клиентской пагинации — сортировка, фильтр и лимиты живут в SQL"
      tier: test
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — listEmployees: where/orderBy/limit/offset в SQL; клиент хранит только filter/page в query-string; тест 20-страничной нарезки зелёный"
      enforcement: "косвенно тестом пагинации; выделенного негативного теста нет"

    - statement: "02-02 P1: Нет удаления; греп-гейт \\bdelete\\b по db/queries/ и app/(app)/employees/ = 0"
      tier: test
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — гейт воспроизведён верификатором: 0 совпадений (включая (card)-группу)"
      enforcement: "греп-гейт исполнялся исполнителем; в CI не проводан"

    - statement: "02-02 P2: Никаких drizzle-kit push; схема не меняется"
      tier: test
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — см. 02-01 P2"
      enforcement: "нет выделенного теста"

    - statement: "02-02 P3: Никакой клиентской пагинации; списочные данные — только через db/queries"
      tier: test
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — pages импортируют listEmployees/getEmployee/listDepartments из db/queries; прямых db-вызовов в app/ нет"
      enforcement: "нет выделенного теста"

    - statement: "02-03 P1: Нигде нет удаления сотрудника (EMP-03); греп-гейты 02-02 действуют"
      tier: test
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — см. 02-02 P1"
      enforcement: "греп-гейт; в CI не проводан"

    - statement: "02-03 P2: Никаких drizzle-kit push; схема не меняется"
      tier: test
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — см. 02-01 P2"
      enforcement: "нет выделенного теста"

    - statement: "02-03 P3: Никакой клиентской пагинации и никакого поиска по имени в списке (D-01, D-05)"
      tier: test
      status: unverified
      flagged: true
      llm_verdict_non_authoritative: "satisfied — в app/(app)/employees/page.tsx нет поискового инпута (все вхождения «search» — API searchParams); поиск отложен к Фазе 5 (FIND-01)"
      enforcement: "нет выделенного теста"
unverified_flagged_count: 9
human_review_recommended: true
items:

  - "statement: \"02-01 P1: Нигде нет удаления сотрудника — ни кнопки, ни удаляющего запроса, только архив (EMP-03, D-02)"
  - "statement: \"02-01 P2: Никаких drizzle-kit push; в фазе нет миграций"
  - "statement: \"02-01 P3: Никакой клиентской пагинации — сортировка, фильтр и лимиты живут в SQL"
  - "statement: \"02-02 P1: Нет удаления; греп-гейт \\\\bdelete\\\\b по db/queries/ и app/(app)/employees/ = 0"
  - "statement: \"02-02 P2: Никаких drizzle-kit push; схема не меняется"
  - "statement: \"02-02 P3: Никакой клиентской пагинации; списочные данные — только через db/queries"
  - "statement: \"02-03 P1: Нигде нет удаления сотрудника (EMP-03); греп-гейты 02-02 действуют"
  - "statement: \"02-03 P2: Никаких drizzle-kit push; схема не меняется"
  - "statement: \"02-03 P3: Никакой клиентской пагинации и никакого поиска по имени в списке (D-01, D-05)"

---

# Phase 2: Employees — Verification Report

**Phase Goal:** Пользователь ведёт справочник сотрудников (имя + отдел, архив вместо удаления) — и на этих простых экранах задаётся визуальный язык всего приложения: полностью русский интерфейс и Apple-эстетика, образцы list/detail-паттернов для всех следующих фаз.
**Verified:** 2026-09-01T19:07:02Z
**Status:** human_needed
**Re-verification:** No — initial verification

## MVP-Mode Process Note (не гэп)

ROADMAP помечает фазу `mode: mvp`, но цель фазы не в формате User Story («As a …, I want to …, so that ….») — `user-story.validate` вернул `valid: false`; таблица «User Flow Coverage» поверх такой цели не строится. Верификация выполнена стандартным goal-backward методом по 4 success criteria дорожной карты. Идентичное расхождение уже зафиксировано и эскалировано в фазе 1 (01-VERIFICATION.md, процессная заметка): при желании — `/gsd mvp-phase 2` и re-verify.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: добавляет сотрудника (имя + отдел), находит в списке, исправляет данные | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Слой данных поведенчески доказан (createEmployee/updateEmployee — tests/employees-queries.test.ts, 13/13); действия и диалог wired (useActionState → actions.ts: requireSession→zod→refresh); smoke рендерит зонда в списке/карточке. Не доказан интерактивный браузерный раундтрип (диалог → action → refresh без перезагрузки) — зонд smoke создаётся прямой DB-вставкой. См. Human Verification |
| 2 | SC2: архивирование — из рабочих списков исчезает, остаётся в базе и истории; кнопки удаления не существует | ✓ VERIFIED | tests 84–107: isActive flip обе стороны + строка выживает; архивный исчезает из активного списка и счётчика, появляется в архиве; no-delete: grep = 0 по db/queries + экранам, модульного delete нет; smoke: бейдж «В архиве»/«Разархивировать» циклится по is_active; FK restrict в схеме сохраняет историю |
| 3 | SC3: все экраны фазы полностью на русском | ✓ VERIFIED | 23/23 строк копи-таблицы UI-SPEC найдены в коде (список, карточка, диалоги, пустые состояния, пагинация, 404, вход); русская 404 «Страница не найдена» ассертится smoke (99999/abc); Intl.PluralRules('ru') — 8 тестов; английских лейблов 0 (единственное исключение — sr-only «Close», Info IN-01, см. Anti-Patterns) |
| 4 | SC4: Apple-эстетика, паттерны переиспользуются фазами 3–6 | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Контракт доказан грепами: 7 токенов UI-SPEC в globals.css (#F5F5F7/#0071E3/#D70015…), системный шрифт-стек, font-medium=0, полушаги=0, prefers-color-scheme=0, шелл 48px bg-white/70 backdrop-blur-md; press-feedback active:scale-[0.97]. Качество эстетки — субъективное свойство, план объявил его manual UAT. Паттерны (list/detail, queries-модуль, error/loading, buildQuery) зафиксированы в коде для фаз 3–6 |
| 5 | Русская сортировка: «Ёлкин» после «Ежова» (replace Ё/ё в ORDER BY + id tiebreaker) | ✓ VERIFIED | db/queries/employees.ts:34,65; тест «Анна < Борис < Ежов < Ёлкин» зелёный |
| 6 | «N сотрудник/сотрудника/сотрудников» через Intl.PluralRules('ru') | ✓ VERIFIED | lib/ru.ts; tests/ru.test.ts 8/8 зелёные |
| 7 | Повторное создание отдела возвращает существующий id (UNIQUE-гонка → re-select) | ✓ VERIFIED | resolveDepartmentId: select→insert returning→catch SQLITE_CONSTRAINT_UNIQUE→re-select; тест 'returns the same department id when the name repeats' зелёный |
| 8 | Создание сотрудника — одна транзакция: отдел + сотрудник атомарно | ✓ VERIFIED | createEmployee/updateEmployee в db.transaction; тесты create/update зелёные |
| 9 | Имя сотрудника НЕ уникально: два «Иван Иванов» различаются отделом и id (D-04) | ✓ VERIFIED | тест 'allows two employees with the same name' зелёный; на карточке отдел виден ([id]/page.tsx:55-57) |
| 10 | Пагинация: 20 строк/страница, SQL limit/offset, ссылки несут полный query-string (?filter=&page=), сброс страницы при смене фильтра | ✓ VERIFIED | listEmployees limit/offset+count+clamp (тесты); buildQuery во всех 4 href (сегмент ×2, Назад/Далее); кламп страницы в [1,pages] тестом |
| 11 | Пустые состояния дословно: «Пока нет сотрудников»+CTA / «Архив пуст»+«Уволенные…» | ✓ VERIFIED | app/(app)/employees/page.tsx:90-114 — обе ветки, копи совпадает с UI-SPEC посимвольно |
| 12 | loading-скелетоны (5 строк h-11 bg-black/5 rounded-lg) + error-границы с retry | PASSED (override) | loading.tsx списка — VERIFIED (5 скелет-строк, motion-safe:animate-pulse); error.tsx ×2 — VERIFIED ({ error, retry }, «Не удалось загрузить список» + «Попробовать снова»). Карточный скелетон сознательно отсутствует — override: конфликт с 404-инвариантом (стриминг флешит 200 до notFound), задокументирован, бисект, d0ceff8 |
| 13 | Экран входа нормализован к контракту (веса 400/600, акцентный фокус, копи не менялось) | ✓ VERIFIED | login-form.tsx: focus:border-accent + ring-accent/30, primary bg-accent hover #0077ED active:scale-[0.97], копи «Логин/Пароль/Войти/Вход…» не тронуто |
| 14 | Периметр не тронут: /employees без сессии 307 → /login; мусорный id → 404 (русская страница), не 500 | ✓ VERIFIED | smoke (после пересборки): 307/Location-/login; 404+«Страница не найдена» на 99999/abc; requireSession первой строкой в обеих страницах и всех трёх действиях; notFound() ДО any-SQL (zod-coerce) |

**Score:** 12/14 truths verified (11 VERIFIED + 1 PASSED (override); 2 present, behavior-unverified)

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Секция «Техника» на карточке показывает «Пока ничего не выдано» (список выданной техники) | Phase 4 | REQUIREMENTS.md: EMP-02 → Phase 4; ROADMAP Phase 4 SC2; Phase 2 plans note в ROADMAP |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/globals.css` | 7 токенов UI-SPEC, системный шрифт, light-only | ✓ VERIFIED | --color-page #F5F5F7 … --color-destructive #D70015, -apple-system стек, prefers-color-scheme = 0 |
| `app/(app)/layout.tsx` | Шелл: sticky 48px бар «Учёт техники / Сотрудники / Выйти» | ✓ VERIFIED | h-12 bg-white/70 backdrop-blur-md border-black/5, max-w-3xl, requireSession |
| `components/ui/{button,input,label,badge,dialog,combobox}.tsx` | shadcn Base UI, ретаргет на UI-SPEC | ✓ VERIFIED | 8 файлов; веса 400/600, hover #0077ED, active:scale-[0.97], scrim 0.3, rounded-2xl; пресет — override WR-03 |
| `db/queries/employees.ts` | listEmployees/getEmployee/listDepartments/resolveDepartmentId/create/update/setEmployeeArchived | ✓ VERIFIED | 182 строки, чистые sync-функции, 0 framework-импортов; delete-путей нет |
| `lib/ru.ts` | pluralEmployees + ruCollator | ✓ VERIFIED | Intl.PluralRules('ru')/Intl.Collator('ru'); покрыто тестами |
| `app/(app)/employees/page.tsx` | RSC-список: 20/стр, сегмент, пустые состояния, пагинация | ✓ VERIFIED | await searchParams → enum+clamp → listEmployees; buildQuery |
| `app/(app)/employees/actions.ts` | 3 действия: requireSession → zod → queries → refresh | ✓ VERIFIED | create/update/setEmployeeArchived; русские полевые ошибки, role=alert-строка |
| `app/(app)/employees/employee-dialog.tsx` | Диалог create/edit + combobox отдела с «Создать „X“» | ✓ VERIFIED | Два режима по пропу employee; hidden departmentName; WR-01 inner-form фикс на месте |
| `app/(app)/employees/archive-confirm-dialog.tsx` | Подтверждение архивации, нейтральный primary | ✓ VERIFIED | Копи дословно, bg-ink (не красный, не акцент), «Не архивировать» |
| `app/(app)/(card)/employees/[id]/page.tsx` | RSC-карточка: zod-id → notFound, бейдж, действия, «Техника» | ✓ VERIFIED | Перемещён в route group (card) — отклонение задокументировано (404-инвариант); URL не изменился |
| `app/(app)/employees/{loading,error}.tsx`, `(card)/…/[id]/error.tsx` | Скелетон/границы с retry | ✓ VERIFIED | Карточный loading.tsx отсутствует by-design — override |
| `app/not-found.tsx` | Русская корневая 404 (WR-02) | ✓ VERIFIED | «Страница не найдена» + «← Сотрудники» вторичным стилем (не акцент); /_not-found в таблице маршрутов |
| `app/login/{page,login-form}.tsx` | Нормализация к контракту | ✓ VERIFIED | См. truth 13 |
| `scripts/smoke-employees.mjs` | E2E: периметр/рендер/404/бейдж | ✓ VERIFIED | Исполнен верификатором, exit 0 (после пересборки) |
| `tests/employees-queries.test.ts`, `tests/ru.test.ts` | Покрытие слоя данных и плюрализации | ✓ VERIFIED | 13 + 8 тестов, зелёные |
| `components.json` | shadcn, Base UI, пресет none | PASSED (override) | «base-nova»: preset-фри стиль в реестре v4 не существует (404 проверен); токены диктует globals.css — override WR-03 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| employee-dialog (useActionState) | createEmployeeAction | requireSession → zod safeParse → db.transaction(resolveDepartmentId+insert) → refresh() → {ok} | WIRED | actions.ts:55-74; диалог вызывает оба действия, ok-эффект закрывает |
| /employees?filter&page | listEmployees | await searchParams → enum+clamp → SQL limit/offset + RU sort-key + count → строки/«Страница N из M» | WIRED | page.tsx:33-43; данные реально рендерятся (smoke: зонд в HTML) |
| smoke-employees.mjs | /employees, /employees/[id] | jose SignJWT({userId}) HS256 → Cookie session → 200/307/404-матрица | WIRED | Исполнен верификатором: все ассерты зелёные |
| /employees/[id] | getEmployee / notFound | await params → z.coerce.int().positive() → notFound ДО any-SQL | WIRED | [id]/page.tsx:36-40; smoke: 404 на 99999/abc, 200 на живом id |
| ArchiveConfirmDialog | setEmployeeArchivedAction | useActionState → requireSession+zod → setEmployeeArchived → refresh → бейдж на той же карточке | WIRED | archive-confirm-dialog.tsx:36-46; рендер-сторона цикла доказана smoke; клик-раундтрип — UAT |
| EmployeeDialog(edit) | updateEmployeeAction | hidden id → db.transaction(resolveDepartmentId+update) → refresh | WIRED | [id]/page.tsx:70-78 передаёт {id,name,department}; data-employee-id ассертится smoke |
| page/[id] | EmployeeDialog(departments) | listDepartments() → combobox → hidden departmentName → resolveDepartmentId | WIRED | Оба места вызова передают живой список отделов |
| error.tsx ×2 | retry() | props { error, retry } → onClick retry() | WIRED | Обе границы; console.error только в консоль (V7) |
| Сегмент «Активные/Архив» | listEmployees(filter) | Link buildQuery({filter, page:1}) — полный query-string | WIRED | Все 4 href через buildQuery; фильтр не теряется, страница сбрасывается |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| app/(app)/employees/page.tsx | rows/total | listEmployees() — SQL innerJoin+where+orderBy+limit/offset над SQLite | Да (smoke: «Смок Сотрудник» в HTML списка) | ✓ FLOWING |
| app/(app)/(card)/employees/[id]/page.tsx | employee | getEmployee(id) — SQL innerJoin | Да (smoke: карточка 200 + имя) | ✓ FLOWING |
| EmployeeDialog | departments | listDepartments() в обоих местах вызова; props не захардкожены пустыми | Да | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Полный вит-сьют (44 фазы-1 регресс + 21 фазы-2) | `npx vitest run` | 65/65 зелёные (9 файлов), 1.6s | ✓ PASS |
| Прод-сборка | `npm run build` | exit 0; маршруты ƒ /employees, ƒ /employees/[id], ○ /_not-found | ✓ PASS |
| Smoke E2E на свежей сборке | `node scripts/smoke-employees.mjs` | exit 0: 307→/login; 200+зонд; карточка+«Пока ничего не выдано»; 404×2 с русской страницей; бейдж-цикл | ✓ PASS |
| Smoke на найденной в репо сборке (.next от 23:21, до review-fix коммитов) | `node scripts/smoke-employees.mjs` | FAIL: русской 404-страницы нет в HTML | ✗ FAIL (stale build — см. Gaps Summary) |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| scripts/smoke-employees.mjs | `bash`/`node scripts/smoke-employees.mjs` (после `npm run build`) | exit 0; «SMOKE OK: 307 → /login … 404 на 99999/abc + русская страница … бейдж … переключается» | PASS |

Примечание: первый прогон верификатора упал на ассерте русской 404 — проверялась устаревшая сборка `.next` (BUILD_ID 23:21, коммит d0ceff8), предшествующая review-fix коммитам 294878c/34bc64f (23:47–23:48; фиксер верифицировал в отдельном worktree). После пересборки из текущих исходников — PASS. Код корректен; расхождение — окруженческое.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| EMP-01 | 02-01, 02-02, 02-03 | Создание и редактирование сотрудников: имя + отдел | ✓ SATISFIED | create/updateEmployee протестированы; диалог в двух режимах; действия wired; smoke-рендер; интерактивный проход — UAT (truth 1) |
| EMP-03 | 02-01, 02-02 | Архив сотрудника (уволен); архивный сохраняет историю | ✓ SATISFIED | isActive flip обе стороны тестом; из активного списка/счётчика исчезает; удаления не существует (grep 0 + модульный тест); история защищена FK restrict и отсутствием delete-путей |
| UI-01 | 02-01, 02-02, 02-03 | Интерфейс полностью на русском | ✓ SATISFIED | 23/23 копи-строк; русская 404 smoke-ассертом; plurals тестами; английских лейблов нет (sr-only «Close» — Info, вне видимого UI) |
| UI-02 | 02-01, 02-02, 02-03 | Apple-эстетика (чистота, типографика, воздух) | ? NEEDS HUMAN | Контрактные грепы зелёные (токены/веса/полушаги/пресс); эстетическое качество — заявленный manual UAT фазы |

Orphaned requirements: нет — REQUIREMENTS.md отображает на Phase 2 ровно EMP-01/EMP-03/UI-01/UI-02, все четыре заявлены в `requirements:` планов. EMP-02 корректно НЕ в фазе 2 (доставляется в Фазе 4).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| components/ui/dialog.tsx | ~78 | sr-only «Close» — английская строка для скринридеров (IN-01 ревью) | ℹ️ Info | Не видима визуально; ревью осознанно оставило Info-тир вне скоупа фиксов; односторонний фикс — текст «Закрыть» |
| app/(app)/(card)/employees/[id]/page.tsx | 104 | «Пока ничего не выдано» — контентная заглушка секции «Техника» | ℹ️ Info | Осознанная заглушка по плану (EMP-02 — Фаза 4, см. Deferred); не архитектурная: данные карточки живут через db/queries |
| .next (build output) | — | Устаревшая сборка в рабочем дереве на момент верификации | ℹ️ Info | Окруженческое: `.next` не в git; фикс-сессия верифицировала в worktree. Любой прогон smoke требует свежего `npm run build` |

Debt-маркеры (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) в файлах фазы: 0. Пустых реализаций и console.log-only функций: 0.

## Human Verification Required

### 1. Интерактивный проход SC1 (создание + редактирование)

**Test:** «Добавить сотрудника» → имя + новый отдел через «Создать „X“» (Enter) → сохранить; найти в списке; «Редактировать» → поменять имя/отдел → «Сохранить изменения».
**Expected:** Сотрудник в списке и счётчик обновляются без F5; правки видны на карточке; отдел создан и переиспользуется; ошибки полей — под полями 14/400 #D70015.
**Why human:** Клиентский раундтрип useActionState → Server Action → refresh() ни одним автотестом не покрыт; smoke создаёт данные прямой DB-вставкой.

### 2. UAT Apple-эстетики (SC4)

**Test:** Глазами сверить 9 covered-состояний UI-SPEC (вход, список, карточка, диалоги, сегмент, пустые, скелетон) с гайдами skill `apple-design`.
**Expected:** Единый визуальный язык: воздух, типографика 400/600, hairline, акцент только на CTA/фокусе/галочке combobox.
**Why human:** Субъективное визуальное свойство — заявленный plan-backstop фазы; паттерны должны переиспользоваться фазами 3–6.

### 3. Backstop длинного текста

**Test:** Имя 100 символов + отдел 80 символов — в строке списка и в диалоге.
**Expected:** Truncate с многоточием, высота строки 44px не меняется, max-w-md диалога не ломается; полные данные в title и на карточке.
**Why human:** Визуальный held-out тест из UI Considerations UI-SPEC.

### 4. WR-01: сброс состояния диалога между открытиями

**Test:** Спровоцировать ошибку в диалоге (пустое имя + «Сохранить»), закрыть, переоткрыть.
**Expected:** Старая ошибка/role=alert не показывается; поля чистые под текущие значения.
**Why human:** Фикс (294878c) верифицирован структурно + build/tests; интерактивная семантика reset требует браузера — явно помечено в 02-REVIEW-FIX.md.

## Gaps Summary

Гэпов, блокирующих цель фазы, не обнаружено. Все 4 requirement-пути фазы (EMP-01, EMP-03, UI-01, UI-02) имеют реализацию в коде: данные, действия, экраны и клиентские острова существуют, содержательны и соединены; поведенческое доказательство — 65/65 vitest (включая 44 регрессионных фазы-1) и smoke-E2E на прод-сборке (периметр 307, список/карточка с реальными данными, 404-матрица с русской страницей, цикл бейджа архивации). Запреты фазы соблюдены и перепроверены: удаления сотрудника не существует (греп 0, модульного delete нет, кнопки нет), схема и миграции не тронуты, пагинация серверная, поиска в списке нет (D-05).

Статус — human_needed, а не passed, по двум причинам. Во-первых, два truth'а сознательно не верифицированы как поведение: интерактивный браузерный раундтрип диалогов (smoke-зонд идёт мимо UI прямой вставкой в БД) и эстетика SC4, которую план сам объявил ручным UAT (плюс backstop длинного текста и явно помеченный REVIEW-FIX пункт WR-01). Во-вторых — и это главная находка верификации: smoke-проба при первом прогоне упала на ассерте русской 404, потому что в рабочем дереве лежала устаревшая сборка `.next` (23:21), предшествующая review-fix коммитам (23:47–23:48); fix-сессия верифицировалась в отдельном worktree. После пересборки проба полностью зелёная — код корректен, но утверждение «smoke green» верно только относительно свежего `npm run build`; это окруженческое замечание зафиксировано в Anti-Patterns, не гэп. Два отклонения от буквы планов (карточный скелетон принесён в пользу 404-инварианта; shadcn-пресет base-nova при несуществующем в реестре preset-фри стиле) оформлены как overrides с доказательной базой. Секция «Техника» с «Пока ничего не выдано» — плановый дефер в Фазу 4 (EMP-02).

---

_Verified: 2026-09-01T19:07:02Z_
_Verifier: Claude (gsd-verifier)_
