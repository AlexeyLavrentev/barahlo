---
phase: 2
slug: employees
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-01
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (established Phase 1) |
| **Config file** | `vitest.config.ts` (exists) |
| **Quick run command** | `npx vitest run --reporter=dot` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=dot`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-T1 | 02-01 | 1 | UI-01, UI-02 (гейт установки) | T-02-SC | Ни одной установки пакетов до human-подтверждения (never auto-approve) | human checkpoint (из автоматической карты исключён) | — (шаги проверки npmjs.com — в плане) | — | ⬜ pending |
| 02-01-T2 | 02-01 | 1 | UI-01, UI-02 | T-02-SC | Light-only токены; установка только одобренным CLI после гейта | build + suite + grep-гейты | `npm run build && npx vitest run && grep -q -- '--color-accent: #0071E3' app/globals.css && grep -q -- '--color-page: #F5F5F7' app/globals.css && [ -f components.json ] && [ -f components/ui/dialog.tsx ] && [ -f components/ui/combobox.tsx ] && [ "$(grep -c 'prefers-color-scheme' app/globals.css)" = "0" ] && [ "$(grep -rn 'font-medium' 'app/(app)/' \| wc -l \| tr -d ' ')" = "0" ] && [ "$(grep -rnE '(py\|px\|mt\|mb)-[0-9]+\.5' 'app/(app)/' \| wc -l \| tr -d ' ')" = "0" ]` | ✅ | ⬜ pending |
| 02-01-T3 | 02-01 | 1 | EMP-01, UI-01 | T-02-01, T-02-02, T-02-03, T-02-04 | requireSession в каждом действии/странице; параметризованный SQL; без dangerouslySetInnerHTML; zod-whitelist | unit/integration + E2E smoke | `npx vitest run tests/employees-queries.test.ts tests/ru.test.ts && npm run build && node scripts/smoke-employees.mjs` | ✅ (тесты и smoke создаёт сам таск до прогона) | ⬜ pending |
| 02-02-T1 | 02-02 | 2 | EMP-01, EMP-03 | T-02-01, T-02-07 | Мусорный id → notFound() до SQL; requireSession | E2E smoke + build | `npm run build && node scripts/smoke-employees.mjs` | ✅ (smoke из 02-01, расширяется таском) | ⬜ pending |
| 02-02-T2 | 02-02 | 2 | EMP-01 | T-02-01, T-02-04 | Update через zod-whitelist {id, name, departmentName}; requireSession | suite + E2E smoke + build | `npm run build && npx vitest run && node scripts/smoke-employees.mjs` | ✅ | ⬜ pending |
| 02-02-T3 | 02-02 | 2 | EMP-03 | T-02-01, T-02-08 | Архив-не-удаление (grep-гейт = 0); requireSession; нейтральный primary | suite + E2E smoke + grep-гейт | `npm run build && npx vitest run && node scripts/smoke-employees.mjs && [ "$(grep -rniE '\bdelete\b' db/queries/ 'app/(app)/employees/' \| wc -l \| tr -d ' ')" = "0" ] && grep -q 'Архивировать сотрудника?' 'app/(app)/employees/archive-confirm-dialog.tsx' && grep -q 'Разархивировать' 'app/(app)/employees/[id]/page.tsx'` | ✅ | ⬜ pending |
| 02-03-T1 | 02-03 | 3 | EMP-01 | T-02-01, T-02-04 | departmentName zod (trim, 1..80); a11y из примитива, не самописный | build + suite + grep-гейты | `npm run build && npx vitest run && grep -q 'Создать „' 'app/(app)/employees/employee-dialog.tsx' && grep -q 'listDepartments' 'app/(app)/employees/page.tsx' && grep -q 'listDepartments' 'app/(app)/employees/[id]/page.tsx' && grep -q 'ruCollator' 'app/(app)/employees/employee-dialog.tsx'` | ✅ | ⬜ pending |
| 02-03-T2 | 02-03 | 3 | EMP-01, UI-01 | T-02-02 | Filter enum + page clamp до SQL | build + suite + grep-гейты | `npm run build && npx vitest run && grep -q 'Пока нет сотрудников' 'app/(app)/employees/page.tsx' && grep -q 'Архив пуст' 'app/(app)/employees/page.tsx' && grep -q 'buildQuery' 'app/(app)/employees/page.tsx' && grep -q 'Страница' 'app/(app)/employees/page.tsx'` | ✅ | ⬜ pending |
| 02-03-T3 | 02-03 | 3 | UI-01, UI-02 | T-02-09 | Граница ошибки не отдаёт деталей наружу; 0 англо-лейблов; дизайн-гейты 0 | build + suite + grep-гейты + E2E smoke | `npm run build && npx vitest run && [ "$(grep -rn 'font-medium' app/ \| wc -l \| tr -d ' ')" = "0" ] && [ "$(grep -rnE '(py\|px\|mt\|mb)-[0-9]+\.5' app/ \| wc -l \| tr -d ' ')" = "0" ] && grep -q 'retry' 'app/(app)/employees/error.tsx' && grep -q 'Не удалось загрузить список' 'app/(app)/employees/error.tsx' && [ "$(grep -rnE '>(Add\|Save\|Delete\|Cancel\|Edit\|Search\|Loading\|Close)<' app/ \| wc -l \| tr -d ' ')" = "0" ] && node scripts/smoke-employees.mjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] None — infrastructure established in Phase 1 (vitest, helpers, stubs)

*Seeded from RESEARCH.md "## Validation Architecture" — planner maps exact per-task rows.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Apple-aesthetic visual quality (UI-02) | UI-02 | Subjective visual judgment | /gsd-ui-review 2 after execution; side-by-side against apple-design гайды |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
