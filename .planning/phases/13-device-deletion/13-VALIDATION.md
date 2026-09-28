---
phase: 13
slug: device-deletion
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-28
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (project standard) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/device-delete.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15–30 seconds (460 tests baseline) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run` (full — ловит регрессии dispose/bulk/clone/фидов)
- **After every plan wave:** Full suite + `npx tsc --noEmit` + `npx next build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-0X-01 | 0X | 1 | DEL-02 | T-13-01 | one-tx cascade, ноль сирот movements/attachments | unit | `npx vitest run tests/device-delete.test.ts` | ❌ W0 | ⬜ pending |
| 13-0X-02 | 0X | 1 | DEL-02 | T-13-02 | DEVICE_GONE guard (чужой id / повторное удаление) | unit | `npx vitest run tests/device-delete.test.ts` | ❌ W0 | ⬜ pending |
| 13-0X-03 | 0X | 1 | DEL-02 | T-13-03 | файлы оригинал+thumb удалены с диска (tmp uploadsDir) | unit | `npx vitest run tests/device-delete.test.ts` | ❌ W0 | ⬜ pending |
| 13-0X-04 | 0X | X | DEL-02 | — | parity поверхностей: реестр/поиск/⌘K/CSV/лента/«выданное»/счётчики | unit | `npx vitest run tests/device-delete.test.ts tests/devices-queries.test.ts` | ✅ | ⬜ pending |
| 13-0Y-XX | 0Y | Y | DEL-01 | T-13-04 | action requireSession-first, ноль машинных кодов | unit | `npx vitest run tests/device-delete.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Map уточняется планом (реальные Task ID подставит планировщик); файл теста — план-специфичный, Wave-0 не требуется если рождается в Wave 1 до потребителей (прецедент фазы 12).*

---

## Wave 0 Requirements

- [ ] `tests/device-delete.test.ts` — каскад-матрица (с потомками / клон-младенец без детей / DEVICE_GONE / файлы на диске / parity-ножи)

*Existing infrastructure (helpers.ts, temp-db, movement-edit bootstrap) covers the rest.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Диалог удаления: счётчики, красный деструктив, dismiss; redirect на /devices; 404 старого URL | DEL-01 | браузерная истина (прецедент UAT фаз 12/10/7) | UAT-сценарии: удалить с историей и фото; повторный заход на URL → 404; disposed-карточка несёт зону удаления |
| Удаление ≠ списание | DEL-01/02 | сквозной сценарий | UAT: списать другое устройство → работает как раньше; удалённое не создаёт записей |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
