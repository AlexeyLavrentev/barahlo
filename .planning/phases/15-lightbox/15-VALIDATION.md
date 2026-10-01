---
phase: 15
slug: lightbox
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-01
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.11 (node environment, без DOM/компонентного раннера — устоявшееся ограничение репо со фазы 2) |
| **Config file** | `vitest.config.ts` (existing, live-verified; alias `@`, stub `server-only`) |
| **Quick run command** | `npx vitest run tests/zoom-math.test.ts` (если план извлечёт `lib/zoom.ts`) |
| **Full suite command** | `npx vitest run` (515/515 зелёны на фазе 14) |
| **Estimated runtime** | полный сьют ~30–60 s; single file ~2–5 s |
| **E2E smoke** | `node scripts/smoke-custody.mjs` (прод-билд на :3116 — пинит грид/роуты фото; лайтбокс-интерьер client-only, smoke-ом не пинится) |

---

## Sampling Rate

- **After every task commit:** `npx tsc --noEmit` + `npx eslint` + `npx vitest run tests/zoom-math.test.ts` (когда существует)
- **After every plan wave:** `npx vitest run` (полный сьют — паритет-базлайн: все prior тесты зелёные) + `node scripts/smoke-custody.mjs` при касании поверхностей фото
- **Before `/gsd-verify-work`:** полный сьют зелёный + build green + UAT-чеклист жестов
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (заполняется планами фазы 15) | | | PHOTO-01 | | | unit (zoom-математика) / UAT (жесты) | `npx vitest run tests/zoom-math.test.ts` | ❌ Wave 0 | ⬜ pending |

Требования → тест-тип (из RESEARCH §Validation Architecture):

| Req ID | Behavior | Test Type |
|--------|----------|-----------|
| PHOTO-01 (SC 1) | Панель ~max-w-5xl (`sm:max-w-sm` перебит через `sm:max-w-5xl` — twMerge не снимает base) | unit-пин класса или UAT |
| PHOTO-01 (SC 2) | Wheel к курсору / даблклик / pinch / drag, [1,4] | unit чистой математики (`zoomAtPoint`, `clampOffset`) + UAT жестов |
| PHOTO-01 (SC 3) | Сброс при prev/next; pointercancel не залипает | unit (сброс = константное состояние) + UAT |
| PHOTO-01 (SC 4) | Delete смонтирована; ⌘K-проба жива; fade-in без мигания | UAT + регресс `node scripts/smoke-custody.mjs` |

Жесты/фокус/порталы — manual-only: компонентного раннера в репо нет (решение фазы 2, НЕ добавлять), lightbox-контент не SSR-ится; интерактивность диалогов исторически верифицируется UAT через Playwright MCP (фазы 7/10).

---

## Wave 0 Requirements

- [ ] `tests/zoom-math.test.ts` + `lib/zoom.ts` — покрывает SC 2/3 математику (настоятельно рекомендуется research'ом — единственный автоматический RED→GREEN слой фазы; план решает извлечение)
- [ ] Компонентный раннер/RTL — НЕ добавлять (противоречит решению репо и D-04 CONTEXT.md)
- [ ] Инфраструктура фреймворка не нужна — vitest существует

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Wheel к позиции курсора; даблклик тогглит; drag панорамирует; clamp [1,4] | PHOTO-01 SC2 | Жесты — браузерная интерактивность, раннера DOM в репо нет | Playwright MCP UAT: открыть лайтбокс, колесо поверх изображения, даблклик, drag за границы |
| Pinch на тачскрине; iOS pointercancel не залипает | PHOTO-01 SC2/SC3 | Тач-жесты не эмулируются нативно в Playwright (эмуляция pointer-событий частична) | Реальный iPhone/Safari: pinch в/из, оборвать жест mid-pinch, проверить сброс |
| Сброс зума при prev/next; стрелки и ←/→; инертные края | PHOTO-01 SC3 (D-01 CONTEXT) | Комбинированный UX-поток | Playwright MCP: листать стрелками/клавишами, зум → next → проверка 1x |
| «Удалить фото» смонтирована над зум-изображением; delete-флоу цел | PHOTO-01 SC4 | Порталы + интерактив | Playwright MCP: зум → удалить → confirm → грид обновлён |
| ⌘K открывается при открытом лайтбоксе (проба `data-slot="dialog-content"`) | PHOTO-01 SC4 | Глобальный хоткей + портал | Playwright MCP: открыть лайтбокс → ⌘K → палитра поверх |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
