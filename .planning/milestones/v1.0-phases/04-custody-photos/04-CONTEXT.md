# Phase 4: Custody & Photos - Context

**Gathered:** 2026-09-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Транзакционное ядро: действия «Выдать» / «Принять» / «Передать» / «В ремонт» / «Из ремонта» / «Списать» — каждое атомарно (одна транзакция: movement-событие + проекция devices.status/currentEmployeeId), неизменяемый таймлайн на карточке устройства (с «поступления»), карточка сотрудника со списком выданного и «Вернуть всю технику», статусы только действиями, фото на карточке устройства (клиентский ресайз + sharp re-encode, EXIF-strip, авторизованная раздача, удаление фото). Прямое редактирование статуса/держателя — по-прежнему запрещено. Поиск/фильтры — фаза 5, дашборд — фаза 6.

</domain>

<decisions>
## Implementation Decisions

### Сопровождение событий
- **D-01:** Каждое перемещение несёт опциональную дату события (задним числом: «закупил вчера, выдал вчера») и опциональный комментарий (номер акта, примечание) — оба видны в таймлайне. Дефолт даты — «сейчас»; дата не может быть в будущем (валидация). [user: выбрано явно]
- **D-02:** Схема готова: `movements` (deviceId, eventType: received/assigned/transferred/returned/to_repair/from_repair/disposed, from/toEmployeeId, comment, occurredAt) + append-only триггеры уже в миграции 0000 — новых миграций нет.

### Списание
- **D-03:** Списание ФИНАЛЬНО: подтверждение с обязательной причиной (комментарий), после — устройство только просматривается (статус disposed, история целая). Ошибка данных исправляется заводом нового устройства, не правкой. Кнопка красная (единственный destructive-контекст — UI-SPEC фазы 3 резервирует #D70015 именно сюда). [user: выбрано явно]

### Ремонт
- **D-04:** Два действия: «В ремонт» (устройство уходит от держателя — если был, автоматически «принимается» — и получает статус repair) → «Из ремонта» (на склад). Комментарии к обоим. Без событийного оформления — запрещено (дыра в истории). [user: выбрано явно]

### Фото
- **D-05:** До 8 фото на устройство; удаление фото доступно (вложения — не история; случайное фото убирается). [user: выбрано явно]
- **D-06:** Пайплайн по research: клиентский ресайз до ~1600px → sharp re-encode (JPEG/WebP) → EXIF-strip → диск `data/uploads/<deviceId>/…` с DB-метаданными (attachments.storageKey, никогда не BLOB); миниатюры; раздача только через авторизованный route (не статика из public). Принимаются фото с телефона (input capture). [user: выбрано явно; research-паттерн]

### Массовый возврат
- **D-07:** В карточке сотрудника действие «Вернуть всю технику»: одна операция, каждая единица — отдельное событие returned в одной транзакции (для увольнения/передачи дела). [user: выбрано явно]

### Guard выдачи
- **D-08:** У устройства со статусом assigned кнопка «Выдать» скрыта (видны «Передать»/«Принять»); guard дублируется в action (выдача возможна только от in_stock/repair-возврата). [user: выбрано явно]

### Claude's Discretion
- Раскладка кнопок действий на карточке (по статусу устройства)
- Формат таймлайна (вертикальная лента vs список)
- Механика «Вернуть всю технику» при частичном сбое (вся транзакция откатывается — атомарно)
- Порядок полей в форме выдачи (сотрудник → дата → комментарий)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Архитектура ядра
- `.planning/research/ARCHITECTURE.md` — hybrid movement pattern: append-only событие + проекция devices в ОДНОЙ транзакции (канонический SQL-скетч внутри)
- `db/schema.ts` — movements (event_type CHECK? — enum в коде), attachments, devices.currentEmployeeId/status — всё готово, миграций нет
- `.planning/research/PITFALLS.md` — история с первой выдачи, soft-delete семантика

### Паттерны и контракт
- `.planning/phases/03-device-registry/03-CONTEXT.md` + `03-PATTERNS.md` + `03-UI-SPEC.md` — действующие паттерны (действия, диалоги, (card) группа, статусы-пилюли; destructive #D70015 зарезервирован под «Списать»)
- `.planning/phases/02-employees/02-UI-SPEC.md` — визуальный язык
- `.planning/REQUIREMENTS.md` — MOVE-01..05, REG-04, EMP-02, REG-05
- `/Users/aleksey/.zcode/skills/vercel-react-best-practices/SKILL.md` — перф-правила (юзер-мандат; фаза 3 показала: применять при планировании и на review)
- `/Users/aleksey/.zcode/skills/apple-design/SKILL.md` — визуальный язык

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `db/schema.ts`: movements + attachments таблицы, триггеры append-only, FK restrict — миграция 0000, НОВЫХ МИГРАЦИЙ НЕТ (кроме… нет, всё есть)
- `db/queries/{employees,devices}.ts` — паттерн queries-модуля + транзакции (resolveDepartmentId — образец tx)
- `app/(app)/(card)/devices/[id]/page.tsx` — карточка, куда встают действия и таймлайн; placeholder-секции «История»/«Фото» ждут именно эту фазу
- `app/(app)/(card)/employees/[id]/page.tsx` — карточка сотрудника (список выданного + «Вернуть всю технику»)
- lib/device-schema.ts (deviceStatusLabel) — статусы-лейблы уже есть
- smoke-скрипты — паттерн e2e-проверок

### Established Patterns
- Action: requireSession → zod → queries-транзакция → refresh()
- Русский копи-контракт, статусы-пилюли нейтральные, destructive red — только «Списать»
- React-19 form-reset: echo values при ошибке (4886f6a) — ПРИМЕНИТЬ к формам выдачи и сотрудникам заодно (known issue из 03-UAT)

### Integration Points
- devices.status CHECK ('in_stock','assigned','repair','disposed') — действия пишут ровно эти значения
- movements.append-only триггеры: компенсация ошибок — только новое событие; тест на RAISE(ABORT) уже в schema.test.ts
- Раздача фото — НОВЫЙ авторизованный route (прокси периметр уже прикрывает /api/*)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — стандартные подходы в рамках действующего UI-контракта

</specifics>

<deferred>
## Deferred Ideas

- Печатный акт приёма-передачи — v1.x (V2-06, по запросу HR/бухгалтерии)
- Уведомления об истекающей гарантии — фаза 5-6 (подсветка)
- История по сотруднику (все события его техники на одной ленте) — по потребности, сейчас: список текущего + таймлайны на устройствах

</deferred>

---

*Phase: 4-custody-photos*
*Context gathered: 2026-09-02*
