# Requirements: Barahlo — учёт корпоративной техники

**Defined:** 2026-08-31
**Core Value:** Мгновенный точный ответ: где конкретная единица техники, кто ею пользуется и какая конфигурация — за секунды, поиском или фильтром.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Типы и реестр

- [ ] **REG-01**: User can view device registry filtered by type (ноутбук / монитор / док-станция / периферия) with server-side pagination
- [ ] **REG-02**: User can create a device of one of 4 fixed types; the form shows that type's field set (ноутбук: модель, серийник, инвентарник, RAM ГБ, флаг «RAM апгрейдена», SSD, закупка, поставщик, стоимость, гарантия до, заметки)
- [ ] **REG-03**: User can edit all device fields; per-type field set enforced by the app
- [ ] **REG-04**: User can set device status: используется / на складе / в ремонте / списано; списанные устройства остаются в базе с историей
- [ ] **REG-05**: User can attach photos to a device card; thumbnails visible in lists

### Перемещения

- [ ] **MOVE-01**: User can assign a device to an employee («выдать»)
- [ ] **MOVE-02**: User can return a device from an employee to stock («принять»)
- [ ] **MOVE-03**: User can transfer a device from one employee to another («передать»)
- [ ] **MOVE-04**: Every assign/transfer/return automatically writes an append-only movement event; device timeline shows who, when, from/to — events are not editable or deletable
- [ ] **MOVE-05**: Device card and employee card always show current holder; status updates in the same action (одна транзакция)

### Сотрудники

- [ ] **EMP-01**: User can create and edit employees: имя + отдел
- [ ] **EMP-02**: User can view an employee card with the list of currently issued devices
- [ ] **EMP-03**: User can archive an employee (уволен); archived employees keep their movement history

### Поиск и фильтры

- [ ] **FIND-01**: User can instantly search devices by substring in serial / inventory number / model, case-insensitive
- [ ] **FIND-02**: User can filter ноутбуки by RAM-upgrade flag — «ноуты без апгрейда RAM» in one click
- [ ] **FIND-03**: User can filter devices by type, status, department, and warranty window («гарантия истекает в 60 дней»)
- [ ] **FIND-04**: Search and filters tolerate real input: extra spaces, регистр, кириллические/латинские гомоглифы (С vs C)

### Закупка и гарантия

- [ ] **WAR-01**: Device card and lists show warranty expiry state (зелёный / жёлтый «< 60 дней» / красный «истекла»)

### Дашборд

- [ ] **DASH-01**: User sees dashboard with device counts by type and status
- [ ] **DASH-02**: Dashboard shows list of devices with expiring/expired warranty
- [ ] **DASH-03**: Dashboard shows recent movements feed

### Доступ и данные

- [x] **ACC-01**: User can log in with username + password (single account, session cookie)
- [x] **ACC-02**: All pages, uploads and API are blocked without authentication
- [x] **ACC-03**: Data persists in a single SQLite database with an automatic backup routine

### Интерфейс

- [ ] **UI-01**: Интерфейс полностью на русском
- [ ] **UI-02**: Apple-aesthetic design: чистота, типографика, воздух (гайды skill `apple-design`)
- [ ] **UI-03**: Lists stay fast at hundreds of devices (server-side pagination, indexed search columns)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Ускорители

- **V2-01**: Saved smart filters (именованные фильтры в один клик)
- **V2-02**: Global ⌘K search across devices and employees
- **V2-03**: Clone device / bulk create for multi-unit purchases
- **V2-04**: QR label sheet export (PDF) → device page by scan
- **V2-05**: Bulk actions on list selection (выдать N единиц разом)
- **V2-06**: Printable handover act (акт приёма-передачи) per assignment
- **V2-07**: Warranty watchlist tile on dashboard (дешёвый, добавляется первым при наличии дашборда)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Конструктор пользовательских полей | Слабая типизация убивает главный фильтр RAM; фиксированные поля на тип меняются в коде |
| Роли / многопользовательский доступ / LDAP / SSO | Ровно один оператор |
| Самообслуживание сотрудников (вход, заявки, подписи) | Сотрудники не логинятся; выдачу фиксирует руководитель |
| Учёт ПО / лицензий / контрактов | Реестр про железо; ITAM-набор удваивает домен |
| Сетевые агенты автоинвентаризации | Тяжёлая инфраструктура; реестр точен по построению — всё вносит сам оператор |
| Амортизация / бухгалтерия | Территория бухгалтерского софта |
| Пайплайн закупок («заказано → в пути») | Фиксируем факт покупки, не процесс |
| Email-уведомления | Подсветка и бейджи на экране достаточны для одного пользователя |
| Бронирование / календарь | Нет второго участника |
| CSV-импорт | Старт с нуля — решение пользователя |
| Нативное мобильное приложение | Responsive web; LAN, один пользователь |
| 1D-штрихкоды и ручные сканеры | Ноль выгоды на этом масштабе; QR с телефона покрывает кейс |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ACC-01 | Phase 1 | Complete |
| ACC-02 | Phase 1 | Complete |
| ACC-03 | Phase 1 | Complete |
| EMP-01 | Phase 2 | Pending |
| EMP-03 | Phase 2 | Pending |
| UI-01 | Phase 2 | Pending |
| UI-02 | Phase 2 | Pending |
| REG-01 | Phase 3 | Pending |
| REG-02 | Phase 3 | Pending |
| REG-03 | Phase 3 | Pending |
| MOVE-01 | Phase 4 | Pending |
| MOVE-02 | Phase 4 | Pending |
| MOVE-03 | Phase 4 | Pending |
| MOVE-04 | Phase 4 | Pending |
| MOVE-05 | Phase 4 | Pending |
| REG-04 | Phase 4 | Pending |
| EMP-02 | Phase 4 | Pending |
| REG-05 | Phase 4 | Pending |
| FIND-01 | Phase 5 | Pending |
| FIND-02 | Phase 5 | Pending |
| FIND-03 | Phase 5 | Pending |
| FIND-04 | Phase 5 | Pending |
| WAR-01 | Phase 5 | Pending |
| UI-03 | Phase 5 | Pending |
| DASH-01 | Phase 6 | Pending |
| DASH-02 | Phase 6 | Pending |
| DASH-03 | Phase 6 | Pending |

**Coverage:**

- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0 ✓

*(Примечание: фактическое число v1-требований — 27; прежний счётчик «24» был устаревшим.)*

---
*Requirements defined: 2026-08-31*
*Last updated: 2026-08-31 — traceability filled by roadmap creation*
